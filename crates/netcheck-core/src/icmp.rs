use std::net::Ipv4Addr;
use std::sync::Arc;
use std::time::Duration;

use tokio::time::MissedTickBehavior;
use tokio_util::sync::CancellationToken;

#[derive(Debug, thiserror::Error)]
pub enum IcmpError {
    #[error("could not open an ICMP handle: {0}")]
    Handle(String),
    #[error("ICMP echo failed with Windows error {0}")]
    Os(u32),
    #[error("ICMP is only implemented on Windows")]
    Unsupported,
    #[error("the check was cancelled")]
    Cancelled,
    #[error("a ping worker stopped unexpectedly")]
    Worker,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Echo {
    Reply { from: Ipv4Addr, rtt_ms: f64 },
    TtlExpired { from: Ipv4Addr, rtt_ms: f64 },
    Unreachable { from: Option<Ipv4Addr> },
    Timeout,
    /// The OS has no route out: cable unplugged, Wi-Fi off, adapter down.
    NoRoute,
}

impl Echo {
    pub fn rtt(&self) -> Option<f64> {
        match *self {
            Echo::Reply { rtt_ms, .. } => Some(rtt_ms),
            _ => None,
        }
    }
}

/// A blocking ICMP echo sender. Kept behind a trait so the check engine can
/// be exercised without a network.
pub trait Prober: Send + Sync + 'static {
    fn echo(&self, dest: Ipv4Addr, ttl: u8, timeout: Duration) -> Result<Echo, IcmpError>;
}

pub type SharedProber = Arc<dyn Prober>;

pub struct SystemProber;

impl Prober for SystemProber {
    #[cfg(windows)]
    fn echo(&self, dest: Ipv4Addr, ttl: u8, timeout: Duration) -> Result<Echo, IcmpError> {
        windows_impl::echo(dest, ttl, timeout)
    }

    #[cfg(not(windows))]
    fn echo(&self, _dest: Ipv4Addr, _ttl: u8, _timeout: Duration) -> Result<Echo, IcmpError> {
        Err(IcmpError::Unsupported)
    }
}

pub const DEFAULT_TTL: u8 = 128;

pub async fn echo(prober: &SharedProber, dest: Ipv4Addr, ttl: u8, timeout: Duration) -> Result<Echo, IcmpError> {
    let p = Arc::clone(prober);
    tokio::task::spawn_blocking(move || p.echo(dest, ttl, timeout)).await.map_err(|_| IcmpError::Worker)?
}

/// Sends `count` echoes `interval` apart without waiting for each reply, so a
/// 180 ms RTT does not stretch a 100 ms send interval. Returns RTTs in send
/// order, `None` for each lost echo.
pub async fn series(
    prober: &SharedProber,
    dest: Ipv4Addr,
    count: u32,
    interval: Duration,
    timeout: Duration,
    cancel: &CancellationToken,
) -> Result<Vec<Option<f64>>, IcmpError> {
    let mut ticker = tokio::time::interval(interval);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
    let mut inflight = Vec::with_capacity(count as usize);
    for _ in 0..count {
        tokio::select! {
            _ = cancel.cancelled() => return Err(IcmpError::Cancelled),
            _ = ticker.tick() => {}
        }
        let p = Arc::clone(prober);
        inflight.push(tokio::task::spawn_blocking(move || p.echo(dest, DEFAULT_TTL, timeout)));
    }
    let mut out = Vec::with_capacity(inflight.len());
    for handle in inflight {
        let result = tokio::select! {
            _ = cancel.cancelled() => return Err(IcmpError::Cancelled),
            r = handle => r.map_err(|_| IcmpError::Worker)?,
        };
        out.push(result?.rtt());
    }
    Ok(out)
}

#[cfg(windows)]
mod windows_impl {
    use std::ffi::c_void;
    use std::mem::size_of;

    use windows::Win32::Foundation::{GetLastError, HANDLE};
    use windows::Win32::NetworkManagement::IpHelper::{
        IcmpCloseHandle, IcmpCreateFile, IcmpSendEcho2, ICMP_ECHO_REPLY, IP_OPTION_INFORMATION,
    };

    use super::*;

    const IP_SUCCESS: u32 = 0;
    const IP_DEST_NET_UNREACHABLE: u32 = 11002;
    const IP_DEST_HOST_UNREACHABLE: u32 = 11003;
    const IP_DEST_PROT_UNREACHABLE: u32 = 11004;
    const IP_DEST_PORT_UNREACHABLE: u32 = 11005;
    const IP_REQ_TIMED_OUT: u32 = 11010;
    const IP_TTL_EXPIRED_TRANSIT: u32 = 11013;
    const IP_TTL_EXPIRED_REASSEM: u32 = 11014;
    const IP_GENERAL_FAILURE: u32 = 11050;
    const ERROR_NETWORK_UNREACHABLE: u32 = 1231;
    const ERROR_HOST_UNREACHABLE: u32 = 1232;
    const PAYLOAD: [u8; 32] = *b"abcdefghijklmnopqrstuvwabcdefghi";

    struct Handle(HANDLE);
    impl Drop for Handle {
        fn drop(&mut self) {
            unsafe {
                let _ = IcmpCloseHandle(self.0);
            }
        }
    }

    fn addr(raw: u32) -> Ipv4Addr {
        Ipv4Addr::from(raw.to_ne_bytes())
    }

    pub fn echo(dest: Ipv4Addr, ttl: u8, timeout: Duration) -> Result<Echo, IcmpError> {
        let handle = Handle(unsafe { IcmpCreateFile() }.map_err(|e| IcmpError::Handle(e.message()))?);
        let options = IP_OPTION_INFORMATION { Ttl: ttl, ..Default::default() };
        let mut reply = vec![0u64; (size_of::<ICMP_ECHO_REPLY>() + PAYLOAD.len() + 8 + 64).div_ceil(8)];
        let reply_len = (reply.len() * 8) as u32;
        let timeout_ms = u32::try_from(timeout.as_millis()).unwrap_or(u32::MAX);

        let count = unsafe {
            IcmpSendEcho2(
                handle.0,
                None,
                None,
                None,
                u32::from_ne_bytes(dest.octets()),
                PAYLOAD.as_ptr() as *const c_void,
                PAYLOAD.len() as u16,
                Some(&options),
                reply.as_mut_ptr() as *mut c_void,
                reply_len,
                timeout_ms,
            )
        };
        let last = if count == 0 { unsafe { GetLastError() }.0 } else { IP_SUCCESS };

        let parsed: ICMP_ECHO_REPLY = unsafe { std::ptr::read(reply.as_ptr() as *const ICMP_ECHO_REPLY) };
        let status = if count > 0 || parsed.Status != 0 { parsed.Status } else { last };
        let from = addr(parsed.Address);
        let rtt_ms = f64::from(parsed.RoundTripTime);
        let known_from = (parsed.Address != 0).then_some(from);

        Ok(match status {
            IP_SUCCESS if count > 0 => Echo::Reply { from, rtt_ms },
            IP_TTL_EXPIRED_TRANSIT | IP_TTL_EXPIRED_REASSEM if known_from.is_some() => Echo::TtlExpired { from, rtt_ms },
            IP_TTL_EXPIRED_TRANSIT | IP_TTL_EXPIRED_REASSEM => Echo::Timeout,
            IP_REQ_TIMED_OUT => Echo::Timeout,
            IP_DEST_NET_UNREACHABLE | IP_DEST_HOST_UNREACHABLE | IP_DEST_PROT_UNREACHABLE | IP_DEST_PORT_UNREACHABLE => {
                Echo::Unreachable { from: known_from }
            }
            IP_GENERAL_FAILURE | ERROR_NETWORK_UNREACHABLE | ERROR_HOST_UNREACHABLE => Echo::NoRoute,
            IP_SUCCESS => Echo::Timeout,
            other => return Err(IcmpError::Os(other)),
        })
    }
}

#[cfg(test)]
pub(crate) mod fake {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use super::*;

    /// Scripted prober: per destination, a fixed RTT (or silence), and an
    /// optional route for TTL-limited echoes.
    #[derive(Default)]
    pub struct FakeProber {
        pub rtt: HashMap<Ipv4Addr, f64>,
        pub route: Vec<(Ipv4Addr, f64)>,
        pub offline: bool,
        pub calls: Mutex<u32>,
    }

    impl Prober for FakeProber {
        fn echo(&self, dest: Ipv4Addr, ttl: u8, _timeout: Duration) -> Result<Echo, IcmpError> {
            if let Ok(mut c) = self.calls.lock() {
                *c += 1;
            }
            if self.offline {
                return Ok(Echo::NoRoute);
            }
            let ttl = usize::from(ttl);
            if ttl <= self.route.len() && ttl < DEFAULT_TTL as usize {
                let (hop, rtt) = self.route[ttl - 1];
                if hop != dest {
                    return Ok(Echo::TtlExpired { from: hop, rtt_ms: rtt });
                }
            }
            Ok(self.rtt.get(&dest).map_or(Echo::Timeout, |&rtt_ms| Echo::Reply { from: dest, rtt_ms }))
        }
    }

    #[tokio::test]
    async fn series_keeps_send_order_and_counts_losses() {
        let ip: Ipv4Addr = "192.0.2.1".parse().expect("ip");
        let fake = FakeProber { rtt: HashMap::from([(ip, 82.0)]), ..Default::default() };
        let p: SharedProber = Arc::new(fake);
        let token = CancellationToken::new();
        let out = series(&p, ip, 5, Duration::from_millis(1), Duration::from_millis(10), &token).await.expect("ok");
        assert_eq!(out, vec![Some(82.0); 5]);
        let lost = series(&p, "192.0.2.99".parse().expect("ip"), 3, Duration::from_millis(1), Duration::from_millis(10), &token)
            .await
            .expect("ok");
        assert_eq!(lost, vec![None; 3]);
    }

    #[tokio::test]
    async fn series_stops_when_cancelled() {
        let p: SharedProber = Arc::new(FakeProber::default());
        let token = CancellationToken::new();
        token.cancel();
        let r = series(&p, "192.0.2.1".parse().expect("ip"), 20, Duration::from_millis(100), Duration::from_secs(1), &token).await;
        assert!(matches!(r, Err(IcmpError::Cancelled)));
    }
}
