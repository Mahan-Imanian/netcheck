use std::collections::BTreeMap;
use std::net::Ipv4Addr;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const SDR_URL: &str = "https://api.steampowered.com/ISteamApps/GetSDRConfig/v1/?appid=730";
const CACHE_FILE: &str = "sdr-config.json";

#[derive(Debug, thiserror::Error)]
pub enum SdrError {
    #[error("Valve's relay list could not be fetched: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Valve answered with HTTP {0}")]
    Status(u16),
    #[error("Valve's relay list was not in the expected format: {0}")]
    Format(#[from] serde_json::Error),
    #[error("Valve's relay list contained no usable regions")]
    Empty,
    #[error("the relay cache could not be written: {0}")]
    Io(#[from] std::io::Error),
    #[error("Valve's relay list is unreachable and there is no cached copy yet")]
    NoData,
}

#[derive(Debug, Deserialize)]
struct RawRelay {
    ipv4: Option<String>,
    #[serde(default)]
    port_range: Vec<u16>,
}

#[derive(Debug, Deserialize)]
struct RawPop {
    #[serde(default)]
    desc: String,
    geo: Option<Vec<f64>>,
    #[serde(default)]
    relays: Vec<RawRelay>,
}

#[derive(Debug, Deserialize)]
struct RawConfig {
    #[serde(default)]
    revision: Option<u64>,
    #[serde(default)]
    pops: BTreeMap<String, RawPop>,
}

#[derive(Debug, Deserialize)]
struct Wrapped {
    response: RawConfig,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Relay {
    pub ipv4: String,
    pub port_range: Option<(u16, u16)>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Pop {
    pub code: String,
    pub desc: String,
    pub city: String,
    pub lon_lat: Option<(f64, f64)>,
    pub relays: Vec<Relay>,
}

impl Pop {
    pub fn relay_ips(&self) -> Vec<Ipv4Addr> {
        self.relays.iter().filter_map(|r| r.ipv4.parse().ok()).collect()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum RelaySource {
    Live,
    Cache,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RelayList {
    pub pops: Vec<Pop>,
    pub revision: Option<u64>,
    pub source: RelaySource,
    #[ts(type = "number")]
    pub fetched_at_ms: i64,
    pub live_error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CacheFile {
    fetched_at_ms: i64,
    body: String,
}

fn city_of(desc: &str, code: &str) -> String {
    let base = desc.split(" (").next().unwrap_or(desc).trim();
    if base.is_empty() {
        code.to_ascii_uppercase()
    } else {
        base.to_string()
    }
}

/// Parses a GetSDRConfig body. Pops without a usable IPv4 relay are dropped.
pub fn parse(body: &str) -> Result<(Vec<Pop>, Option<u64>), SdrError> {
    let raw: RawConfig = match serde_json::from_str::<Wrapped>(body) {
        Ok(w) => w.response,
        Err(_) => serde_json::from_str(body)?,
    };
    let pops: Vec<Pop> = raw
        .pops
        .into_iter()
        .filter_map(|(code, p)| {
            let relays: Vec<Relay> = p
                .relays
                .into_iter()
                .filter_map(|r| {
                    let ip = r.ipv4?;
                    ip.parse::<Ipv4Addr>().ok()?;
                    let port_range = match r.port_range.as_slice() {
                        [lo, hi] => Some((*lo, *hi)),
                        _ => None,
                    };
                    Some(Relay { ipv4: ip, port_range })
                })
                .collect();
            if relays.is_empty() {
                return None;
            }
            let lon_lat = match p.geo.as_deref() {
                Some([lon, lat, ..]) if lon.is_finite() && lat.is_finite() => Some((*lon, *lat)),
                _ => None,
            };
            Some(Pop { city: city_of(&p.desc, &code), desc: p.desc, code, lon_lat, relays })
        })
        .collect();
    if pops.is_empty() {
        return Err(SdrError::Empty);
    }
    Ok((pops, raw.revision))
}

pub struct SdrClient {
    url: String,
    cache_path: PathBuf,
    http: reqwest::Client,
}

impl SdrClient {
    pub fn new(cache_dir: &Path) -> Result<Self, SdrError> {
        Self::with_url(cache_dir, SDR_URL)
    }

    pub fn with_url(cache_dir: &Path, url: &str) -> Result<Self, SdrError> {
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(5))
            .user_agent(concat!("Netcheck/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self { url: url.to_string(), cache_path: cache_dir.join(CACHE_FILE), http })
    }

    async fn fetch_live(&self) -> Result<String, SdrError> {
        let resp = self.http.get(&self.url).send().await?;
        if !resp.status().is_success() {
            return Err(SdrError::Status(resp.status().as_u16()));
        }
        Ok(resp.text().await?)
    }

    pub fn read_cache(&self) -> Option<(i64, String)> {
        let text = std::fs::read_to_string(&self.cache_path).ok()?;
        let file: CacheFile = serde_json::from_str(&text).ok()?;
        Some((file.fetched_at_ms, file.body))
    }

    fn write_cache(&self, now_ms: i64, body: &str) -> Result<(), SdrError> {
        if let Some(dir) = self.cache_path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let tmp = self.cache_path.with_extension("tmp");
        std::fs::write(&tmp, serde_json::to_vec(&CacheFile { fetched_at_ms: now_ms, body: body.to_string() })?)?;
        std::fs::rename(tmp, &self.cache_path)?;
        Ok(())
    }

    pub fn cached(&self) -> Option<RelayList> {
        let (fetched_at_ms, body) = self.read_cache()?;
        let (pops, revision) = parse(&body).ok()?;
        Some(RelayList { pops, revision, source: RelaySource::Cache, fetched_at_ms, live_error: None })
    }

    /// Fetches and validates the live list, and caches it on success.
    pub async fn refresh(&self, now_ms: i64) -> Result<RelayList, SdrError> {
        let body = self.fetch_live().await?;
        let (pops, revision) = parse(&body)?;
        self.write_cache(now_ms, &body)?;
        Ok(RelayList { pops, revision, source: RelaySource::Live, fetched_at_ms: now_ms, live_error: None })
    }

    /// The live list, or the last good cached copy (whatever its age) when
    /// Valve can't be reached.
    pub async fn load(&self, now_ms: i64) -> Result<RelayList, SdrError> {
        match self.refresh(now_ms).await {
            Ok(list) => Ok(list),
            Err(e) => {
                let mut list = self.cached().ok_or(SdrError::NoData)?;
                list.live_error = Some(e.to_string());
                Ok(list)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
        "revision": 1730000000,
        "pops": {
            "vie": { "desc": "Vienna (Austria)", "geo": [16.37, 48.21],
                     "relays": [ { "ipv4": "192.0.2.10", "port_range": [27015, 27060] },
                                 { "ipv4": "192.0.2.11", "port_range": [27015, 27060] } ] },
            "fra": { "desc": "Frankfurt", "geo": [8.68, 50.11], "relays": [ { "ipv4": "192.0.2.20", "port_range": [27015, 27060] } ] },
            "sham": { "desc": "Shanghai (Mobile)", "geo": [121.47, 31.23] },
            "v6": { "desc": "Nowhere", "relays": [ { "ipv6": "2001:db8::1" } ] }
        }
    }"#;

    #[test]
    fn parses_pops_and_skips_relayless() {
        let (pops, rev) = parse(SAMPLE).expect("parses");
        assert_eq!(rev, Some(1_730_000_000));
        let codes: Vec<&str> = pops.iter().map(|p| p.code.as_str()).collect();
        assert_eq!(codes, ["fra", "vie"]);
        let vie = &pops[1];
        assert_eq!(vie.city, "Vienna");
        assert_eq!(vie.lon_lat, Some((16.37, 48.21)));
        assert_eq!(vie.relay_ips().len(), 2);
        assert_eq!(vie.relays[0].port_range, Some((27015, 27060)));
    }

    #[test]
    fn accepts_response_wrapper() {
        let wrapped = format!(r#"{{"response": {SAMPLE}}}"#);
        assert_eq!(parse(&wrapped).expect("parses").0.len(), 2);
    }

    #[test]
    fn empty_or_garbage_is_an_error() {
        assert!(matches!(parse(r#"{"pops": {}}"#), Err(SdrError::Empty)));
        assert!(parse("<html>").is_err());
    }

    #[test]
    fn cache_round_trip_and_fallback() {
        let dir = std::env::temp_dir().join(format!("netcheck-sdr-{}", std::process::id()));
        let client = SdrClient::new(&dir).expect("client");
        assert!(client.read_cache().is_none());
        client.write_cache(42, SAMPLE).expect("write");
        let (at, body) = client.read_cache().expect("cached");
        assert_eq!(at, 42);
        assert_eq!(parse(&body).expect("parses").0.len(), 2);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn unreachable_api_falls_back_to_cache_with_its_age() {
        let dir = std::env::temp_dir().join(format!("netcheck-sdr-fb-{}", std::process::id()));
        let client = SdrClient::with_url(&dir, "http://127.0.0.1:9/").expect("client");
        assert!(matches!(client.load(1000).await, Err(SdrError::NoData)));
        client.write_cache(500, SAMPLE).expect("write");
        let list = client.load(1000).await.expect("cache fallback");
        assert_eq!(list.source, RelaySource::Cache);
        assert_eq!(list.fetched_at_ms, 500);
        assert!(list.live_error.is_some());
        let _ = std::fs::remove_dir_all(dir);
    }
}
