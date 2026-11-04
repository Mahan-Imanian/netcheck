use std::net::Ipv4Addr;
use std::time::Duration;

use tokio::task::JoinSet;
use tokio_util::sync::CancellationToken;

use crate::diagnosis::{classify_segments, Hop, Segment};
use crate::icmp::{self, Echo, IcmpError, SharedProber};
use crate::stats::PingStats;

pub const MAX_HOPS: u8 = 15;

#[derive(Debug, Clone, PartialEq)]
pub struct RawHop {
    pub ttl: u8,
    pub addr: Option<Ipv4Addr>,
    pub is_destination: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Discovery {
    pub hops: Vec<RawHop>,
    pub no_route: bool,
}

async fn probe_ttl(prober: SharedProber, dest: Ipv4Addr, ttl: u8, timeout: Duration) -> Result<Echo, IcmpError> {
    let mut last = Echo::Timeout;
    for _ in 0..2 {
        last = icmp::echo(&prober, dest, ttl, timeout).await?;
        if !matches!(last, Echo::Timeout) {
            break;
        }
    }
    Ok(last)
}

/// TTL-stepped ICMP route discovery. All TTLs are probed at once, so a
/// 15-hop route costs about one timeout rather than fifteen.
pub async fn discover(
    prober: &SharedProber,
    dest: Ipv4Addr,
    max_hops: u8,
    timeout: Duration,
    cancel: &CancellationToken,
) -> Result<Discovery, IcmpError> {
    let mut set = JoinSet::new();
    for ttl in 1..=max_hops {
        let p = SharedProber::clone(prober);
        set.spawn(async move { (ttl, probe_ttl(p, dest, ttl, timeout).await) });
    }
    let mut echoes: Vec<(u8, Echo)> = Vec::with_capacity(usize::from(max_hops));
    loop {
        let next = tokio::select! {
            _ = cancel.cancelled() => { set.abort_all(); return Err(IcmpError::Cancelled) }
            n = set.join_next() => n,
        };
        let Some(joined) = next else { break };
        let (ttl, echo) = joined.map_err(|_| IcmpError::Worker)?;
        echoes.push((ttl, echo?));
    }
    echoes.sort_by_key(|(ttl, _)| *ttl);

    let no_route = echoes.iter().any(|(ttl, e)| *ttl == 1 && matches!(e, Echo::NoRoute));
    let mut hops = Vec::new();
    for (ttl, echo) in echoes {
        let (addr, is_destination) = match echo {
            Echo::Reply { from, .. } => (Some(from), from == dest),
            Echo::TtlExpired { from, .. } => (Some(from), false),
            Echo::Unreachable { from } => (from, false),
            Echo::Timeout | Echo::NoRoute => (None, false),
        };
        hops.push(RawHop { ttl, addr, is_destination });
        if is_destination {
            break;
        }
    }
    while hops.last().is_some_and(|h| h.addr.is_none()) && hops.len() > 1 {
        hops.pop();
    }
    Ok(Discovery { hops, no_route })
}

/// Pings every hop that answered `probes` times and returns hops grouped
/// into route sections.
pub async fn measure(
    prober: &SharedProber,
    discovery: &Discovery,
    probes: u32,
    cancel: &CancellationToken,
) -> Result<Vec<Hop>, IcmpError> {
    let mut set = JoinSet::new();
    for (i, raw) in discovery.hops.iter().enumerate() {
        let Some(addr) = raw.addr else { continue };
        let p = SharedProber::clone(prober);
        let c = cancel.clone();
        set.spawn(async move {
            let samples = icmp::series(&p, addr, probes, Duration::from_millis(100), Duration::from_secs(1), &c).await;
            (i, samples)
        });
    }
    let mut stats: Vec<Option<PingStats>> = vec![None; discovery.hops.len()];
    while let Some(joined) = set.join_next().await {
        let (i, samples) = joined.map_err(|_| IcmpError::Worker)?;
        stats[i] = Some(PingStats::from_samples(samples?));
    }
    let mut hops: Vec<Hop> = discovery
        .hops
        .iter()
        .zip(stats)
        .map(|(raw, stats)| Hop {
            ttl: raw.ttl,
            addr: raw.addr.map(|a| a.to_string()),
            stats,
            segment: Segment::Local,
            is_destination: raw.is_destination,
            normal_ms: None,
        })
        .collect();
    classify_segments(&mut hops);
    Ok(hops)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::Arc;

    use super::*;
    use crate::icmp::fake::FakeProber;

    fn ip(s: &str) -> Ipv4Addr {
        s.parse().expect("ip")
    }

    #[tokio::test]
    async fn discovers_route_up_to_destination() {
        let dest = ip("192.0.2.50");
        let route = vec![(ip("192.168.1.1"), 1.0), (ip("10.0.0.1"), 3.0), (ip("198.51.100.7"), 60.0), (dest, 82.0)];
        let rtt = route.iter().copied().collect::<HashMap<_, _>>();
        let p: SharedProber = Arc::new(FakeProber { rtt, route, ..Default::default() });
        let token = CancellationToken::new();
        let d = discover(&p, dest, MAX_HOPS, Duration::from_millis(5), &token).await.expect("ok");
        assert!(!d.no_route);
        assert_eq!(d.hops.len(), 4);
        assert!(d.hops[3].is_destination);

        let hops = measure(&p, &d, 3, &token).await.expect("ok");
        assert_eq!(hops[0].segment, Segment::Local);
        assert_eq!(hops[3].segment, Segment::Valve);
        assert_eq!(hops[2].stats.as_ref().and_then(|s| s.avg), Some(60.0));
    }

    #[tokio::test]
    async fn offline_is_reported_as_no_route() {
        let p: SharedProber = Arc::new(FakeProber { offline: true, ..Default::default() });
        let d = discover(&p, ip("192.0.2.50"), 4, Duration::from_millis(5), &CancellationToken::new()).await.expect("ok");
        assert!(d.no_route);
        assert_eq!(d.hops.len(), 1);
    }
}
