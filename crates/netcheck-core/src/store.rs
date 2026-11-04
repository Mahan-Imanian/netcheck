use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::check::{CheckReport, RegionStatus};
use crate::settings::Settings;
use crate::stats::percentile;

pub const RETENTION_DAYS: i64 = 30;
const DAY_MS: i64 = 86_400_000;

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("history database error: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("settings could not be read: {0}")]
    Json(#[from] serde_json::Error),
    #[error("history database is closed")]
    Closed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct HistoryCell {
    /// Local calendar day, `YYYY-MM-DD`.
    pub day: String,
    pub hour: u8,
    pub avg_ms: f64,
    pub loss_pct: f64,
    pub samples: u32,
}

const SCHEMA: &str = "
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS checks (
    id INTEGER PRIMARY KEY,
    started_at INTEGER NOT NULL,
    finished_at INTEGER NOT NULL,
    preferred TEXT NOT NULL,
    relay_source TEXT NOT NULL,
    gateway_avg REAL,
    internet_avg REAL,
    internet_loss REAL,
    offline INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS checks_started ON checks(started_at);
CREATE TABLE IF NOT EXISTS region_results (
    check_id INTEGER NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    target TEXT,
    min REAL, avg REAL, p95 REAL, max REAL, jitter REAL,
    loss REAL,
    grade TEXT,
    measured INTEGER NOT NULL,
    estimated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS region_results_code ON region_results(code, check_id);
CREATE TABLE IF NOT EXISTS route_hops (
    check_id INTEGER NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
    ttl INTEGER NOT NULL,
    addr TEXT NOT NULL,
    avg REAL,
    loss REAL
);
CREATE INDEX IF NOT EXISTS route_hops_addr ON route_hops(addr);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
";

pub struct Store {
    conn: Mutex<Option<Connection>>,
}

impl Store {
    pub fn open(path: &Path) -> Result<Self, StoreError> {
        Self::from_connection(Connection::open(path)?)
    }

    pub fn in_memory() -> Result<Self, StoreError> {
        Self::from_connection(Connection::open_in_memory()?)
    }

    fn from_connection(conn: Connection) -> Result<Self, StoreError> {
        conn.execute_batch(SCHEMA)?;
        Ok(Self { conn: Mutex::new(Some(conn)) })
    }

    fn with<T>(&self, f: impl FnOnce(&mut Connection) -> Result<T, StoreError>) -> Result<T, StoreError> {
        let mut guard = self.conn.lock().map_err(|_| StoreError::Closed)?;
        let conn = guard.as_mut().ok_or(StoreError::Closed)?;
        f(conn)
    }

    /// Checkpoints the WAL into the main file and closes the connection.
    /// Later calls fail with [`StoreError::Closed`].
    pub fn close(&self) -> Result<(), StoreError> {
        let mut guard = self.conn.lock().map_err(|_| StoreError::Closed)?;
        if let Some(conn) = guard.take() {
            conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
            conn.close().map_err(|(_, e)| StoreError::Sql(e))?;
        }
        Ok(())
    }

    pub fn prune(&self, now_ms: i64) -> Result<usize, StoreError> {
        self.with(|c| Ok(c.execute("DELETE FROM checks WHERE started_at < ?1", [now_ms - RETENTION_DAYS * DAY_MS])?))
    }

    pub fn save_check(&self, r: &CheckReport) -> Result<i64, StoreError> {
        self.with(|c| {
            let tx = c.transaction()?;
            tx.execute(
                "INSERT INTO checks (started_at, finished_at, preferred, relay_source, gateway_avg, internet_avg, internet_loss, offline)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    r.started_at_ms,
                    r.finished_at_ms,
                    r.preferred,
                    format!("{:?}", r.relays.source),
                    r.baseline.gateway.as_ref().and_then(|s| s.avg),
                    r.baseline.internet.as_ref().and_then(|s| s.avg),
                    r.baseline.internet.as_ref().map(|s| s.loss_pct),
                    r.offline,
                ],
            )?;
            let id = tx.last_insert_rowid();
            {
                let mut ins = tx.prepare(
                    "INSERT INTO region_results (check_id, code, target, min, avg, p95, max, jitter, loss, grade, measured, estimated)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                )?;
                for g in &r.regions {
                    let s = g.stats.as_ref();
                    ins.execute(params![
                        id,
                        g.code,
                        g.target,
                        s.and_then(|s| s.min),
                        s.and_then(|s| s.avg),
                        s.and_then(|s| s.p95),
                        s.and_then(|s| s.max),
                        s.and_then(|s| s.jitter),
                        s.map(|s| s.loss_pct),
                        g.grade.map(|g| g.as_str()),
                        g.status == RegionStatus::Measured,
                        g.estimated,
                    ])?;
                }
                let mut hop = tx.prepare("INSERT INTO route_hops (check_id, ttl, addr, avg, loss) VALUES (?1, ?2, ?3, ?4, ?5)")?;
                for h in r.route.iter().flat_map(|route| &route.hops) {
                    if let Some(addr) = &h.addr {
                        let s = h.stats.as_ref();
                        hop.execute(params![id, h.ttl, addr, s.and_then(|s| s.avg), s.map(|s| s.loss_pct)])?;
                    }
                }
            }
            tx.commit()?;
            Ok(id)
        })
    }

    /// Average ping for `code` per local day and hour over the last `days` days.
    pub fn history(&self, code: &str, days: i64, now_ms: i64) -> Result<Vec<HistoryCell>, StoreError> {
        self.with(|c| {
            let mut q = c.prepare(
                "SELECT strftime('%Y-%m-%d', k.started_at / 1000, 'unixepoch', 'localtime') AS day,
                        CAST(strftime('%H', k.started_at / 1000, 'unixepoch', 'localtime') AS INTEGER) AS hour,
                        AVG(r.avg), AVG(r.loss), COUNT(*)
                 FROM region_results r JOIN checks k ON k.id = r.check_id
                 WHERE r.code = ?1 AND r.measured = 1 AND r.avg IS NOT NULL AND k.started_at >= ?2
                 GROUP BY day, hour ORDER BY day, hour",
            )?;
            let rows = q.query_map(params![code, now_ms - days * DAY_MS], |row| {
                Ok(HistoryCell {
                    day: row.get(0)?,
                    hour: row.get(1)?,
                    avg_ms: row.get(2)?,
                    loss_pct: row.get::<_, Option<f64>>(3)?.unwrap_or(0.0),
                    samples: row.get(4)?,
                })
            })?;
            Ok(rows.collect::<Result<Vec<_>, _>>()?)
        })
    }

    /// Lowest average each route hop has shown in the retention window:
    /// latency can't drop below propagation delay, so this is its "normal".
    pub fn hop_normals(&self) -> Result<HashMap<String, f64>, StoreError> {
        self.with(|c| {
            let mut q = c.prepare("SELECT addr, MIN(avg) FROM route_hops WHERE avg IS NOT NULL GROUP BY addr")?;
            let rows = q.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)))?;
            Ok(rows.collect::<Result<HashMap<_, _>, _>>()?)
        })
    }

    /// 20th-percentile average per region; needs at least three checks.
    pub fn region_normals(&self) -> Result<HashMap<String, f64>, StoreError> {
        self.with(|c| {
            let mut q = c.prepare("SELECT code, avg FROM region_results WHERE measured = 1 AND avg IS NOT NULL AND estimated = 0")?;
            let mut by_code: HashMap<String, Vec<f64>> = HashMap::new();
            for row in q.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?)))? {
                let (code, avg) = row?;
                by_code.entry(code).or_default().push(avg);
            }
            Ok(by_code
                .into_iter()
                .filter(|(_, v)| v.len() >= 3)
                .filter_map(|(code, mut v)| {
                    v.sort_by(f64::total_cmp);
                    percentile(&v, 20.0).map(|p| (code, p))
                })
                .collect())
        })
    }

    pub fn load_settings(&self) -> Result<Settings, StoreError> {
        self.with(|c| {
            let raw: Option<String> = c.query_row("SELECT value FROM settings WHERE key = 'settings'", [], |r| r.get(0)).optional()?;
            Ok(match raw {
                Some(json) => serde_json::from_str::<Settings>(&json).unwrap_or_default().sanitized(),
                None => Settings::default(),
            })
        })
    }

    pub fn save_settings(&self, s: &Settings) -> Result<(), StoreError> {
        let json = serde_json::to_string(s)?;
        self.with(|c| {
            c.execute(
                "INSERT INTO settings (key, value) VALUES ('settings', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [json],
            )?;
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::check::{Baseline, RegionResult, RelayMeta};
    use crate::firewall::{BlockState, FirewallSummary};
    use crate::sdr::RelaySource;
    use crate::stats::{PingStats, Thresholds};

    fn report(at: i64, avg: f64) -> CheckReport {
        let stats = PingStats::from_samples(vec![Some(avg); 20]);
        CheckReport {
            started_at_ms: at,
            finished_at_ms: at + 6000,
            preferred: "vie".into(),
            relays: RelayMeta { source: RelaySource::Live, fetched_at_ms: at, live_error: None },
            firewall: FirewallSummary {
                readable: true,
                error: None,
                profiles: None,
                block_rule_count: 0,
                groups: vec![],
                warn_inactive: false,
            },
            regions: vec![RegionResult {
                code: "vie".into(),
                target: Some("192.0.2.10".into()),
                status: RegionStatus::Measured,
                estimated: false,
                block: BlockState::Open,
                grade: stats.grade(&Thresholds::default()),
                stats: Some(stats),
                normal_ms: None,
            }],
            baseline: Baseline { gateway_ip: None, gateway: None, internet_ip: "1.1.1.1".into(), internet: None },
            route: None,
            offline: false,
        }
    }

    #[test]
    fn saves_and_aggregates_history() {
        let store = Store::in_memory().expect("open");
        let now = 1_762_000_000_000;
        for (i, avg) in [82.0, 84.0, 150.0].iter().enumerate() {
            store.save_check(&report(now - i as i64 * 60_000, *avg)).expect("save");
        }
        let cells = store.history("vie", 14, now).expect("history");
        let samples: u32 = cells.iter().map(|c| c.samples).sum();
        assert_eq!(samples, 3);
        assert_eq!(store.region_normals().expect("normals").get("vie").copied(), Some(82.0));
    }

    #[test]
    fn prunes_after_thirty_days() {
        let store = Store::in_memory().expect("open");
        let now = 1_762_000_000_000;
        store.save_check(&report(now - 31 * DAY_MS, 80.0)).expect("save");
        store.save_check(&report(now, 80.0)).expect("save");
        assert_eq!(store.prune(now).expect("prune"), 1);
        assert_eq!(store.history("vie", 60, now).expect("history").len(), 1);
    }

    #[test]
    fn settings_round_trip_and_close() {
        let store = Store::in_memory().expect("open");
        assert_eq!(store.load_settings().expect("load"), Settings::default());
        let s = Settings { preferred_region: "fra".into(), close_after_launch: Some(false), ..Settings::default() };
        store.save_settings(&s).expect("save");
        assert_eq!(store.load_settings().expect("load"), s);
        store.close().expect("close");
        assert!(matches!(store.load_settings(), Err(StoreError::Closed)));
        store.close().expect("idempotent");
    }
}
