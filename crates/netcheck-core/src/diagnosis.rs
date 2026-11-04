use std::collections::HashMap;
use std::net::Ipv4Addr;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::stats::{PingStats, ProblemHopLimit};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Hop {
    pub ttl: u8,
    pub addr: Option<String>,
    pub stats: Option<PingStats>,
    pub segment: Segment,
    pub is_destination: bool,
    /// Lowest average this address has shown over recent history, if known.
    pub normal_ms: Option<f64>,
}

impl Hop {
    fn avg(&self) -> Option<f64> {
        self.stats.as_ref().and_then(|s| s.avg)
    }
    fn loss(&self) -> f64 {
        self.stats.as_ref().map_or(100.0, |s| s.loss_pct)
    }
    fn is_stable(&self) -> bool {
        self.stats.as_ref().is_some_and(|s| {
            s.received == s.sent && s.jitter.unwrap_or(0.0) <= 5.0 && matches!((s.min, s.avg), (Some(lo), Some(av)) if av - lo <= 8.0)
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum Segment {
    Local,
    Isp,
    International,
    Valve,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum ProblemKind {
    Latency,
    Loss,
    LatencyAndLoss,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Finding {
    pub segment: Segment,
    pub ttl: u8,
    pub addr: Option<String>,
    pub kind: ProblemKind,
    pub prev_avg: f64,
    pub avg: Option<f64>,
    pub lost: u32,
    pub sent: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Diagnosis {
    pub finding: Option<Finding>,
    pub reached_destination: bool,
}

fn is_inside_isp(addr: Ipv4Addr) -> bool {
    let [a, b, ..] = addr.octets();
    addr.is_private() || (a == 100 && (64..128).contains(&b))
}

/// Assigns each hop to a route section. TTL 1 is the router and TTL 2–3 the
/// ISP. Past TTL 3, private and CGNAT addresses (and silent hops before the
/// first public one) are still the ISP, since they cannot be routed publicly.
pub fn classify_segments(hops: &mut [Hop]) {
    let mut isp_open = true;
    for hop in hops.iter_mut() {
        hop.segment = if hop.is_destination {
            Segment::Valve
        } else if hop.ttl <= 1 {
            Segment::Local
        } else if hop.ttl <= 3 {
            Segment::Isp
        } else {
            let private = hop.addr.as_deref().and_then(|a| a.parse::<Ipv4Addr>().ok()).is_some_and(is_inside_isp);
            if isp_open && (private || hop.addr.is_none()) {
                Segment::Isp
            } else {
                isp_open = false;
                Segment::International
            }
        };
    }
}

pub fn attach_normals(hops: &mut [Hop], normals: &HashMap<String, f64>) {
    for hop in hops.iter_mut() {
        hop.normal_ms = hop.addr.as_ref().and_then(|a| normals.get(a)).copied();
    }
}

/// Latency `cur` adds over `prev` beyond what it normally adds.
fn excess_rise(prev: Option<&Hop>, cur: &Hop) -> Option<f64> {
    let (prev_avg, prev_normal) = prev.map_or((Some(0.0), Some(0.0)), |p| (p.avg(), p.normal_ms));
    let rise = cur.avg()? - prev_avg?;
    let normal_rise = match (prev_normal, cur.normal_ms) {
        (Some(p), Some(c)) => (c - p).max(0.0),
        _ => 0.0,
    };
    Some(rise - normal_rise)
}

/// Finds the first hop where latency jumps by more than `jump_ms` over the
/// previous answering hop, or loss passes `loss_pct`, and only when the
/// destination itself is degraded (a clean destination means nothing on the
/// route is hurting the game).
///
/// Three corrections keep this honest:
/// * routers deprioritise ICMP aimed at themselves, so a spike or loss counts
///   only if it carries through to every later hop and to the destination;
/// * a rise a hop normally shows (learned from route history) is distance,
///   not congestion, and is subtracted;
/// * without history, a perfectly stable rise on the international segment
///   is long-haul propagation and is not reported.
pub fn find_problem(hops: &[Hop], limit: &ProblemHopLimit, destination_degraded: bool) -> Diagnosis {
    let answering: Vec<&Hop> = hops.iter().filter(|h| h.avg().is_some()).collect();
    let reached_destination = hops.iter().any(|h| h.is_destination && h.avg().is_some());
    let dest = answering.last().filter(|h| h.is_destination).copied();

    if !destination_degraded {
        return Diagnosis { finding: None, reached_destination };
    }

    let mut prev: Option<&Hop> = None;
    for (i, &hop) in answering.iter().enumerate() {
        let Some(rise) = excess_rise(prev, hop) else { continue };
        let downstream = &answering[i + 1..];

        let propagation = hop.segment == Segment::International && hop.normal_ms.is_none() && hop.is_stable();
        let jump = rise > limit.jump_ms
            && !propagation
            && downstream.iter().all(|h| excess_rise(prev, h).is_some_and(|r| r > limit.jump_ms * 0.8));
        let loss_persists = dest.map_or_else(
            || downstream.iter().all(|h| h.loss() > limit.loss_pct),
            |d| d.loss() > limit.loss_pct,
        );
        let loss = hop.loss() > limit.loss_pct && (hop.is_destination || loss_persists);

        if jump || loss {
            let (sent, received) = hop.stats.as_ref().map_or((0, 0), |s| (s.sent, s.received));
            return Diagnosis {
                finding: Some(Finding {
                    segment: hop.segment,
                    ttl: hop.ttl,
                    addr: hop.addr.clone(),
                    kind: match (jump, loss) {
                        (true, true) => ProblemKind::LatencyAndLoss,
                        (true, false) => ProblemKind::Latency,
                        _ => ProblemKind::Loss,
                    },
                    prev_avg: prev.and_then(Hop::avg).unwrap_or(0.0),
                    avg: hop.avg(),
                    lost: sent - received,
                    sent,
                }),
                reached_destination,
            };
        }
        if rise <= limit.jump_ms || propagation {
            prev = Some(hop);
        }
    }
    Diagnosis { finding: None, reached_destination }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stats::Thresholds;

    fn hop(ttl: u8, addr: &str, rtts: Vec<Option<f64>>, dest: bool) -> Hop {
        Hop {
            ttl,
            addr: Some(addr.to_string()),
            stats: Some(PingStats::from_samples(rtts)),
            segment: Segment::Local,
            is_destination: dest,
            normal_ms: None,
        }
    }

    fn steady(ms: f64) -> Vec<Option<f64>> {
        vec![Some(ms); 6]
    }

    fn noisy(ms: f64, lost: usize) -> Vec<Option<f64>> {
        let mut v: Vec<Option<f64>> = [-12.0, 9.0, -4.0, 15.0, -8.0, 0.0][..6 - lost].iter().map(|d| Some(ms + d)).collect();
        v.extend(std::iter::repeat_n(None, lost));
        v
    }

    fn silent(ttl: u8) -> Hop {
        Hop { ttl, addr: None, stats: None, segment: Segment::Local, is_destination: false, normal_ms: None }
    }

    fn route(mut hops: Vec<Hop>) -> Vec<Hop> {
        classify_segments(&mut hops);
        hops
    }

    fn run(r: &[Hop]) -> Option<Finding> {
        find_problem(r, &Thresholds::default().problem_hop, true).finding
    }

    #[test]
    fn case_wifi_router() {
        let r = route(vec![
            hop(1, "192.168.1.1", noisy(38.0, 1), false),
            hop(2, "10.20.0.1", noisy(40.0, 1), false),
            hop(3, "10.20.5.9", noisy(42.0, 1), false),
            hop(4, "78.38.240.17", steady(108.0), false),
            hop(5, "155.133.0.10", noisy(120.0, 1), true),
        ]);
        let f = run(&r).expect("finding");
        assert_eq!((f.segment, f.ttl, f.kind), (Segment::Local, 1, ProblemKind::LatencyAndLoss));
        assert_eq!(f.prev_avg, 0.0);
    }

    #[test]
    fn case_isp() {
        let r = route(vec![
            hop(1, "192.168.1.1", steady(1.0), false),
            hop(2, "10.20.0.1", noisy(48.0, 0), false),
            hop(3, "10.20.5.9", noisy(50.0, 0), false),
            hop(4, "78.38.240.17", steady(115.0), false),
            hop(5, "155.133.0.10", noisy(130.0, 0), true),
        ]);
        let f = run(&r).expect("finding");
        assert_eq!((f.segment, f.ttl, f.prev_avg), (Segment::Isp, 2, 1.0));
        assert_eq!(f.kind, ProblemKind::Latency);
    }

    fn brief_route() -> Vec<Hop> {
        route(vec![
            hop(1, "192.168.1.1", steady(1.0), false),
            hop(2, "10.20.0.1", steady(2.0), false),
            hop(3, "78.38.0.1", steady(4.0), false),
            hop(4, "78.38.240.17", steady(69.0), false),
            hop(5, "85.132.90.233", noisy(134.0, 2), false),
            hop(6, "80.81.192.10", noisy(137.0, 2), false),
            hop(7, "155.133.0.10", noisy(141.0, 2), true),
        ])
    }

    #[test]
    fn case_international_link_brief_example_without_history() {
        let r = brief_route();
        let f = run(&r).expect("finding");
        assert_eq!(f.segment, Segment::International);
        assert_eq!(f.addr.as_deref(), Some("85.132.90.233"));
        assert_eq!((f.prev_avg, f.lost, f.sent), (69.0, 2, 6));
        assert_eq!(f.kind, ProblemKind::LatencyAndLoss);
    }

    #[test]
    fn case_international_link_with_learned_normals() {
        let mut r = brief_route();
        let normals: HashMap<String, f64> = [
            ("192.168.1.1", 1.0),
            ("10.20.0.1", 2.0),
            ("78.38.0.1", 4.0),
            ("78.38.240.17", 68.0),
            ("85.132.90.233", 72.0),
            ("80.81.192.10", 76.0),
            ("155.133.0.10", 82.0),
        ]
        .into_iter()
        .map(|(a, n)| (a.to_string(), n))
        .collect();
        attach_normals(&mut r, &normals);
        let f = run(&r).expect("finding");
        assert_eq!(f.addr.as_deref(), Some("85.132.90.233"));
        assert_eq!(f.segment, Segment::International);
    }

    #[test]
    fn case_valve_side_only_last_hop() {
        let r = route(vec![
            hop(1, "192.168.1.1", steady(1.0), false),
            hop(2, "10.20.0.1", steady(3.0), false),
            hop(3, "78.38.0.1", steady(5.0), false),
            hop(4, "78.38.240.17", steady(70.0), false),
            hop(5, "80.81.192.10", steady(80.0), false),
            hop(6, "155.133.0.10", noisy(82.0, 2), true),
        ]);
        let f = run(&r).expect("finding");
        assert_eq!((f.segment, f.ttl, f.kind), (Segment::Valve, 6, ProblemKind::Loss));
        assert_eq!((f.lost, f.sent), (2, 6));
    }

    #[test]
    fn healthy_destination_never_blames_a_hop() {
        let r = route(vec![
            hop(1, "192.168.1.1", steady(1.0), false),
            hop(2, "10.20.0.1", steady(2.0), false),
            hop(3, "78.38.0.1", steady(4.0), false),
            hop(4, "78.38.240.17", steady(69.0), false),
            hop(5, "155.133.0.10", steady(82.0), true),
        ]);
        let d = find_problem(&r, &Thresholds::default().problem_hop, false);
        assert_eq!(d.finding, None);
        assert!(d.reached_destination);
    }

    #[test]
    fn stable_long_haul_rise_is_propagation_not_a_problem() {
        let r = route(vec![
            hop(1, "192.168.1.1", steady(1.0), false),
            hop(2, "10.20.0.1", steady(2.0), false),
            hop(3, "78.38.0.1", steady(4.0), false),
            hop(4, "78.38.240.17", steady(69.0), false),
            hop(5, "80.81.192.10", steady(80.0), false),
            hop(6, "155.133.0.10", noisy(96.0, 0), true),
        ]);
        assert_eq!(run(&r), None);
    }

    #[test]
    fn transient_spike_and_rate_limited_loss_are_ignored() {
        let r = route(vec![
            hop(1, "192.168.1.1", steady(1.0), false),
            hop(2, "10.20.0.1", steady(2.0), false),
            hop(3, "78.38.0.1", noisy(90.0, 4), false),
            silent(4),
            hop(5, "80.81.192.10", steady(20.0), false),
            hop(6, "155.133.0.10", steady(24.0), true),
        ]);
        assert_eq!(run(&r), None);
    }

    #[test]
    fn unreached_destination_reports_where_route_dies() {
        let r = route(vec![
            hop(1, "192.168.1.1", steady(1.0), false),
            hop(2, "10.20.0.1", noisy(20.0, 4), false),
            silent(3),
            silent(4),
        ]);
        let d = find_problem(&r, &Thresholds::default().problem_hop, true);
        assert!(!d.reached_destination);
        assert_eq!(d.finding.map(|f| f.ttl), Some(2));
    }

    #[test]
    fn segments_follow_ttl_and_private_ranges() {
        let r = route(vec![
            hop(1, "192.168.1.1", steady(1.0), false),
            hop(2, "10.0.0.1", steady(2.0), false),
            hop(3, "10.0.0.2", steady(3.0), false),
            hop(4, "100.70.0.1", steady(4.0), false),
            hop(5, "85.132.90.233", steady(70.0), false),
            hop(6, "10.9.9.9", steady(71.0), false),
            hop(7, "155.133.0.10", steady(80.0), true),
        ]);
        let segs: Vec<Segment> = r.iter().map(|h| h.segment).collect();
        use Segment::*;
        assert_eq!(segs, [Local, Isp, Isp, Isp, International, International, Valve]);
    }
}
