use std::net::Ipv4Addr;
use std::sync::Arc;
use std::time::Duration;

use netcheck_core::icmp::{self, SharedProber, SystemProber};
use netcheck_core::stats::PingStats;
use tokio_util::sync::CancellationToken;

#[tokio::main(flavor = "multi_thread")]
async fn main() {
    let mut args = std::env::args().skip(1);
    let Some(target) = args.next().and_then(|a| a.parse::<Ipv4Addr>().ok()) else {
        eprintln!("usage: probe <ipv4> [count] [interval-ms]");
        std::process::exit(2);
    };
    let count = args.next().and_then(|a| a.parse().ok()).unwrap_or(20);
    let interval = args.next().and_then(|a| a.parse().ok()).unwrap_or(100);
    let prober: SharedProber = Arc::new(SystemProber);
    match icmp::series(&prober, target, count, Duration::from_millis(interval), Duration::from_secs(1), &CancellationToken::new()).await {
        Ok(samples) => match serde_json::to_string(&PingStats::from_samples(samples)) {
            Ok(json) => println!("{json}"),
            Err(e) => eprintln!("{e}"),
        },
        Err(e) => {
            eprintln!("probe failed: {e}");
            std::process::exit(1);
        }
    }
}
