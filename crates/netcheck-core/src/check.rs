use std::collections::HashMap;
use std::net::Ipv4Addr;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::sync::Semaphore;
use tokio::task::JoinSet;
use tokio_util::sync::CancellationToken;
use ts_rs::TS;

use crate::diagnosis::{attach_normals, find_problem, Diagnosis, Hop};
use crate::firewall::{BlockState, FirewallError, FirewallSnapshot, FirewallSummary};
use crate::icmp::{self, Echo, IcmpError, SharedProber, DEFAULT_TTL};
use crate::sdr::{Pop, RelayList, RelaySource};
use crate::settings::Settings;
use crate::stats::{Grade, PingStats, Thresholds};
use crate::traceroute;

pub const INTERNET_BASELINE: Ipv4Addr = Ipv4Addr::new(1, 1, 1, 1);
const CONCURRENCY: usize = 16;
const INTERVAL: Duration = Duration::from_millis(100);
const ECHO_TIMEOUT: Duration = Duration::from_millis(1000);
const SELECT_TIMEOUT: Duration = Duration::from_millis(700);
const MAX_CANDIDATES: usize = 4;
const BASELINE_PINGS: u32 = 10;
const HOP_PROBES: u32 = 6;

#[derive(Debug, thiserror::Error)]
pub enum CheckError {
    #[error(transparent)]
    Icmp(#[from] IcmpError),
    #[error("the check was cancelled")]
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum RegionStatus {
    Measured,
    NoReply,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RegionInfo {
    pub code: String,
    pub city: String,
    pub desc: String,
    pub lon_lat: Option<(f64, f64)>,
    pub relay_count: u32,
    pub block: BlockState,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RegionResult {
    pub code: String,
    /// The address that was actually pinged: a relay, or a /24 neighbour when estimated.
    pub target: Option<String>,
    pub status: RegionStatus,
    pub estimated: bool,
    pub block: BlockState,
    pub stats: Option<PingStats>,
    pub grade: Option<Grade>,
    /// 20th-percentile average from the last 30 days, when known.
    pub normal_ms: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Baseline {
    pub gateway_ip: Option<String>,
    pub gateway: Option<PingStats>,
    pub internet_ip: String,
    pub internet: Option<PingStats>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RouteResult {
    pub region: String,
    pub target: String,
    pub estimated: bool,
    pub hops: Vec<Hop>,
    pub diagnosis: Diagnosis,
    pub no_route: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RelayMeta {
    pub source: RelaySource,
    #[ts(type = "number")]
    pub fetched_at_ms: i64,
    pub live_error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CheckReport {
    #[ts(type = "number")]
    pub started_at_ms: i64,
    #[ts(type = "number")]
    pub finished_at_ms: i64,
    pub preferred: String,
    pub relays: RelayMeta,
    pub firewall: FirewallSummary,
    pub regions: Vec<RegionResult>,
    pub baseline: Baseline,
    pub route: Option<RouteResult>,
    pub offline: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", tag = "kind")]
#[ts(export)]
pub enum CheckEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        #[ts(type = "number")]
        started_at_ms: i64,
        preferred: String,
        relays: RelayMeta,
        firewall: FirewallSummary,
        regions: Vec<RegionInfo>,
    },
    Region { result: RegionResult },
    Baseline { baseline: Baseline },
    Route { route: RouteResult },
    #[serde(rename_all = "camelCase")]
    RelayRefresh {
        ok: bool,
        error: Option<String>,
        #[ts(type = "number")]
        fetched_at_ms: i64,
    },
    #[serde(rename_all = "camelCase")]
    Finished {
        #[ts(type = "number | null")]
        check_id: Option<i64>,
        #[ts(type = "number")]
        finished_at_ms: i64,
        offline: bool,
    },
    #[serde(rename_all = "camelCase")]
    Failed { message: String, offline: bool, has_cache: bool },
}

pub type Emit = Arc<dyn Fn(CheckEvent) + Send + Sync>;

pub struct CheckInputs {
    pub settings: Settings,
    pub relays: RelayList,
    pub firewall: Result<FirewallSnapshot, FirewallError>,
    pub gateway: Option<Ipv4Addr>,
    pub hop_normals: HashMap<String, f64>,
    pub region_normals: HashMap<String, f64>,
    pub now_ms: fn() -> i64,
}

struct Plan {
    pop: Pop,
    block: BlockState,
    candidates: Vec<Ipv4Addr>,
    estimated: bool,
}

fn plan(pop: &Pop, firewall: Option<&FirewallSnapshot>) -> Plan {
    let relays = pop.relay_ips();
    let block = firewall.map_or(BlockState::Open, |fw| fw.classify(&relays));
    let (candidates, estimated) = match (&block, firewall) {
        (BlockState::Blocked { blocks_icmp: true, .. }, Some(fw)) => {
            let mut near: Vec<Ipv4Addr> = Vec::new();
            for r in &relays {
                for n in fw.unblocked_neighbours(*r) {
                    if !near.contains(&n) && !relays.contains(&n) {
                        near.push(n);
                    }
                }
            }
            (near, true)
        }
        _ => (relays, false),
    };
    Plan { pop: pop.clone(), block, candidates, estimated }
}

async fn select_target(
    prober: &SharedProber,
    candidates: &[Ipv4Addr],
    cancel: &CancellationToken,
) -> Result<Option<Ipv4Addr>, CheckError> {
    for ip in candidates.iter().take(MAX_CANDIDATES) {
        if cancel.is_cancelled() {
            return Err(CheckError::Cancelled);
        }
        match icmp::echo(prober, *ip, DEFAULT_TTL, SELECT_TIMEOUT).await? {
            Echo::Reply { .. } => return Ok(Some(*ip)),
            Echo::NoRoute => return Ok(None),
            _ => {}
        }
    }
    Ok(None)
}

async fn measure_region(
    prober: SharedProber,
    plan: Plan,
    count: u32,
    thresholds: Thresholds,
    normal_ms: Option<f64>,
    cancel: CancellationToken,
) -> Result<RegionResult, CheckError> {
    let target = select_target(&prober, &plan.candidates, &cancel).await?;
    let stats = match target {
        Some(ip) => Some(PingStats::from_samples(icmp::series(&prober, ip, count, INTERVAL, ECHO_TIMEOUT, &cancel).await?)),
        None => None,
    };
    let grade = stats.as_ref().and_then(|s| s.grade(&thresholds));
    let status = if stats.as_ref().is_some_and(|s| s.received > 0) { RegionStatus::Measured } else { RegionStatus::NoReply };
    Ok(RegionResult {
        code: plan.pop.code,
        target: target.map(|t| t.to_string()),
        status,
        estimated: plan.estimated && target.is_some(),
        block: plan.block,
        stats,
        grade,
        normal_ms,
    })
}

async fn baseline(prober: SharedProber, gateway: Option<Ipv4Addr>, cancel: CancellationToken) -> Result<Baseline, CheckError> {
    let gw = async {
        match gateway {
            Some(ip) => icmp::series(&prober, ip, BASELINE_PINGS, INTERVAL, ECHO_TIMEOUT, &cancel).await.map(Some),
            None => Ok(None),
        }
    };
    let net = icmp::series(&prober, INTERNET_BASELINE, BASELINE_PINGS, INTERVAL, ECHO_TIMEOUT, &cancel);
    let (gw, net) = tokio::join!(gw, net);
    Ok(Baseline {
        gateway_ip: gateway.map(|g| g.to_string()),
        gateway: gw?.map(PingStats::from_samples),
        internet_ip: INTERNET_BASELINE.to_string(),
        internet: Some(PingStats::from_samples(net?)),
    })
}

fn is_degraded(region: &RegionResult, t: &Thresholds) -> bool {
    let Some(stats) = region.stats.as_ref() else { return true };
    let above_normal = matches!((stats.avg, region.normal_ms), (Some(a), Some(n)) if a - n > t.problem_hop.jump_ms);
    stats.loss_pct > 0.0 || above_normal || region.grade.is_none_or(|g| g > Grade::Good)
}

async fn trace(
    prober: SharedProber,
    candidates: Vec<Ipv4Addr>,
    cancel: CancellationToken,
) -> Result<(Ipv4Addr, traceroute::Discovery, Vec<Hop>), CheckError> {
    let fallback = candidates.first().copied().unwrap_or(INTERNET_BASELINE);
    let target = select_target(&prober, &candidates, &cancel).await?.unwrap_or(fallback);
    let discovery = traceroute::discover(&prober, target, traceroute::MAX_HOPS, ECHO_TIMEOUT, &cancel).await?;
    let hops = traceroute::measure(&prober, &discovery, HOP_PROBES, &cancel).await?;
    Ok((target, discovery, hops))
}

fn no_answers(stats: Option<&PingStats>) -> bool {
    stats.is_none_or(|s| s.received == 0)
}

pub async fn run(prober: SharedProber, inputs: CheckInputs, emit: Emit, cancel: CancellationToken) -> Result<CheckReport, CheckError> {
    let started_at_ms = (inputs.now_ms)();
    let settings = inputs.settings.clone().sanitized();
    let preferred = settings.preferred_region.clone();
    let fw = inputs.firewall.as_ref().ok();

    let mut plans: Vec<Plan> = inputs.relays.pops.iter().map(|p| plan(p, fw)).collect();
    plans.sort_by_key(|p| p.pop.code != preferred);

    let states: Vec<BlockState> = plans.iter().map(|p| p.block.clone()).collect();
    let firewall = match &inputs.firewall {
        Ok(snapshot) => snapshot.summary(&states),
        Err(e) => FirewallSummary::unreadable(e),
    };
    let relays = RelayMeta {
        source: inputs.relays.source,
        fetched_at_ms: inputs.relays.fetched_at_ms,
        live_error: inputs.relays.live_error.clone(),
    };

    emit(CheckEvent::Started {
        started_at_ms,
        preferred: preferred.clone(),
        relays: relays.clone(),
        firewall: firewall.clone(),
        regions: plans
            .iter()
            .map(|p| RegionInfo {
                code: p.pop.code.clone(),
                city: p.pop.city.clone(),
                desc: p.pop.desc.clone(),
                lon_lat: p.pop.lon_lat,
                relay_count: p.pop.relays.len() as u32,
                block: p.block.clone(),
            })
            .collect(),
    });

    let route_task = plans.iter().find(|p| p.pop.code == preferred && !p.candidates.is_empty()).map(|p| {
        let task = tokio::spawn(trace(SharedProber::clone(&prober), p.candidates.clone(), cancel.clone()));
        (p.estimated, task)
    });
    let baseline_task = tokio::spawn(baseline(SharedProber::clone(&prober), inputs.gateway, cancel.clone()));

    let permits = Arc::new(Semaphore::new(CONCURRENCY));
    let mut set = JoinSet::new();
    for plan in plans {
        let p = SharedProber::clone(&prober);
        let permits = Arc::clone(&permits);
        let c = cancel.clone();
        let normal = inputs.region_normals.get(&plan.pop.code).copied();
        let count = settings.ping_count;
        let t = settings.thresholds;
        set.spawn(async move {
            let _permit = permits.acquire_owned().await.map_err(|_| CheckError::Cancelled)?;
            measure_region(p, plan, count, t, normal, c).await
        });
    }

    let mut regions = Vec::new();
    loop {
        let next = tokio::select! {
            _ = cancel.cancelled() => { set.abort_all(); return Err(CheckError::Cancelled) }
            n = set.join_next() => n,
        };
        let Some(joined) = next else { break };
        let result = joined.map_err(|_| CheckError::Icmp(IcmpError::Worker))??;
        emit(CheckEvent::Region { result: result.clone() });
        regions.push(result);
    }

    let baseline = baseline_task.await.map_err(|_| CheckError::Icmp(IcmpError::Worker))??;
    emit(CheckEvent::Baseline { baseline: baseline.clone() });

    let route = match route_task {
        Some((estimated, task)) => {
            let (target, discovery, mut hops) = task.await.map_err(|_| CheckError::Icmp(IcmpError::Worker))??;
            attach_normals(&mut hops, &inputs.hop_normals);
            let degraded = regions.iter().find(|r| r.code == preferred).is_none_or(|r| is_degraded(r, &settings.thresholds));
            let diagnosis = find_problem(&hops, &settings.thresholds.problem_hop, degraded);
            let route = RouteResult {
                region: preferred.clone(),
                target: target.to_string(),
                estimated,
                hops,
                diagnosis,
                no_route: discovery.no_route,
            };
            emit(CheckEvent::Route { route: route.clone() });
            Some(route)
        }
        None => None,
    };

    let offline = regions.iter().all(|r| r.status == RegionStatus::NoReply)
        && no_answers(baseline.gateway.as_ref())
        && no_answers(baseline.internet.as_ref());

    Ok(CheckReport {
        started_at_ms,
        finished_at_ms: (inputs.now_ms)(),
        preferred,
        relays,
        firewall,
        regions,
        baseline,
        route,
        offline,
    })
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;
    use crate::firewall::{parse_remote_addresses, BlockRule, ProfileState, PROFILE_ALL, PROFILE_PRIVATE};
    use crate::icmp::fake::FakeProber;
    use crate::sdr::Relay;

    fn ip(s: &str) -> Ipv4Addr {
        s.parse().expect("ip")
    }

    fn pop(code: &str, relays: &[&str]) -> Pop {
        Pop {
            code: code.into(),
            desc: code.into(),
            city: code.into(),
            lon_lat: Some((0.0, 0.0)),
            relays: relays.iter().map(|r| Relay { ipv4: (*r).into(), port_range: None }).collect(),
        }
    }

    fn inputs(pops: Vec<Pop>, firewall: Result<FirewallSnapshot, FirewallError>) -> CheckInputs {
        CheckInputs {
            settings: Settings::default(),
            relays: RelayList { pops, revision: None, source: RelaySource::Live, fetched_at_ms: 0, live_error: None },
            firewall,
            gateway: Some(ip("192.168.1.1")),
            hop_normals: HashMap::new(),
            region_normals: HashMap::new(),
            now_ms: || 0,
        }
    }

    fn collect() -> (Emit, Arc<Mutex<Vec<CheckEvent>>>) {
        let log = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&log);
        let emit: Emit = Arc::new(move |e| {
            if let Ok(mut l) = sink.lock() {
                l.push(e);
            }
        });
        (emit, log)
    }

    #[tokio::test(start_paused = true)]
    async fn measures_each_region_and_falls_back_to_next_relay() {
        let route = vec![(ip("192.168.1.1"), 1.0), (ip("10.0.0.1"), 2.0), (ip("192.0.2.11"), 82.0)];
        let rtt = HashMap::from([
            (ip("192.0.2.11"), 82.0),
            (ip("198.51.100.20"), 87.0),
            (ip("192.168.1.1"), 1.0),
            (ip("10.0.0.1"), 2.0),
            (INTERNET_BASELINE, 70.0),
        ]);
        let prober: SharedProber = Arc::new(FakeProber { rtt, route, ..Default::default() });
        let pops = vec![pop("vie", &["192.0.2.10", "192.0.2.11"]), pop("fra", &["198.51.100.20"]), pop("dead", &["203.0.113.1"])];
        let (emit, log) = collect();
        let report = run(prober, inputs(pops, Err(FirewallError::Unsupported)), emit, CancellationToken::new()).await.expect("ok");

        let vie = report.regions.iter().find(|r| r.code == "vie").expect("vie");
        assert_eq!(vie.target.as_deref(), Some("192.0.2.11"));
        assert_eq!(vie.stats.as_ref().map(|s| (s.sent, s.avg)), Some((20, Some(82.0))));
        assert_eq!(vie.grade, Some(Grade::Good));
        let dead = report.regions.iter().find(|r| r.code == "dead").expect("dead");
        assert_eq!(dead.status, RegionStatus::NoReply);
        assert!(!report.offline);

        let route = report.route.expect("route");
        assert!(route.diagnosis.reached_destination);
        assert_eq!(route.diagnosis.finding, None);

        let events = log.lock().expect("log");
        assert!(matches!(events.first(), Some(CheckEvent::Started { .. })));
        assert_eq!(events.iter().filter(|e| matches!(e, CheckEvent::Region { .. })).count(), 3);
        assert!(!report.firewall.readable);
    }

    #[tokio::test(start_paused = true)]
    async fn blocked_region_is_estimated_from_neighbours() {
        let rtt = HashMap::from([(ip("192.0.2.9"), 90.0), (ip("198.51.100.20"), 87.0), (INTERNET_BASELINE, 70.0)]);
        let prober: SharedProber = Arc::new(FakeProber { rtt, ..Default::default() });
        let rule = BlockRule {
            name: "CS2 block vie".into(),
            group: "CS2 Vienna Only".into(),
            enabled: true,
            outbound: true,
            block: true,
            profiles: PROFILE_ALL,
            protocol: 256,
            application: String::new(),
            remote: parse_remote_addresses("192.0.2.10"),
        };
        let fw = FirewallSnapshot {
            profiles: ProfileState { domain: true, private: true, public: true, active: PROFILE_PRIVATE },
            rules: vec![rule],
        };
        let pops = vec![pop("vie", &["192.0.2.10"]), pop("fra", &["198.51.100.20"])];
        let (emit, _) = collect();
        let report = run(prober, inputs(pops, Ok(fw)), emit, CancellationToken::new()).await.expect("ok");
        let vie = report.regions.iter().find(|r| r.code == "vie").expect("vie");
        assert!(matches!(vie.block, BlockState::Blocked { .. }));
        assert!(vie.estimated);
        assert_eq!(vie.target.as_deref(), Some("192.0.2.9"));
        assert_eq!(vie.stats.as_ref().and_then(|s| s.avg), Some(90.0));
        let fra = report.regions.iter().find(|r| r.code == "fra").expect("fra");
        assert_eq!((fra.block.clone(), fra.estimated), (BlockState::Open, false));
        assert_eq!(report.firewall.block_rule_count, 1);
    }

    #[tokio::test(start_paused = true)]
    async fn unplugged_cable_reports_offline_without_hanging() {
        let prober: SharedProber = Arc::new(FakeProber { offline: true, ..Default::default() });
        let pops = vec![pop("vie", &["192.0.2.10"]), pop("fra", &["198.51.100.20"])];
        let (emit, _) = collect();
        let report = run(prober, inputs(pops, Err(FirewallError::Unsupported)), emit, CancellationToken::new()).await.expect("ok");
        assert!(report.offline);
        assert!(report.route.expect("route").no_route);
    }

    #[tokio::test(start_paused = true)]
    async fn cancellation_stops_the_check() {
        let rtt = HashMap::from([(ip("192.0.2.10"), 82.0)]);
        let prober: SharedProber = Arc::new(FakeProber { rtt, ..Default::default() });
        let token = CancellationToken::new();
        token.cancel();
        let (emit, _) = collect();
        let r = run(prober, inputs(vec![pop("vie", &["192.0.2.10"])], Err(FirewallError::Unsupported)), emit, token).await;
        assert!(r.is_err());
    }
}
