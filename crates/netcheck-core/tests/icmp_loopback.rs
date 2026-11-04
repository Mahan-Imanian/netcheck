#![cfg(windows)]

use std::net::Ipv4Addr;
use std::sync::Arc;
use std::time::Duration;

use netcheck_core::icmp::{self, Echo, Prober, SharedProber, SystemProber, DEFAULT_TTL};
use netcheck_core::stats::PingStats;
use tokio_util::sync::CancellationToken;

#[test]
fn loopback_echo_through_icmpsendecho2() {
    let reply = SystemProber.echo(Ipv4Addr::LOCALHOST, DEFAULT_TTL, Duration::from_secs(1)).expect("echo");
    match reply {
        Echo::Reply { from, rtt_ms } => {
            assert_eq!(from, Ipv4Addr::LOCALHOST);
            assert!(rtt_ms < 10.0, "loopback took {rtt_ms} ms");
        }
        other => panic!("expected a reply from 127.0.0.1, got {other:?}"),
    }
}

#[tokio::test]
async fn loopback_series_has_no_loss() {
    let prober: SharedProber = Arc::new(SystemProber);
    let samples = icmp::series(
        &prober,
        Ipv4Addr::LOCALHOST,
        20,
        Duration::from_millis(100),
        Duration::from_secs(1),
        &CancellationToken::new(),
    )
    .await
    .expect("series");
    let stats = PingStats::from_samples(samples);
    assert_eq!((stats.sent, stats.received), (20, 20));
    assert!(stats.avg.is_some_and(|a| a < 10.0));
}
