use std::net::Ipv4Addr;

/// The IPv4 next hop of the lowest-metric default route, read from the
/// routing table (never modified).
#[cfg(windows)]
pub fn default_gateway() -> Option<Ipv4Addr> {
    use windows::Win32::NetworkManagement::IpHelper::{FreeMibTable, GetIpForwardTable2, MIB_IPFORWARD_TABLE2};
    use windows::Win32::Networking::WinSock::AF_INET;

    let mut table: *mut MIB_IPFORWARD_TABLE2 = std::ptr::null_mut();
    if unsafe { GetIpForwardTable2(AF_INET, &mut table) }.is_err() || table.is_null() {
        return None;
    }
    let best = unsafe {
        let t = &*table;
        let rows = std::slice::from_raw_parts(t.Table.as_ptr(), t.NumEntries as usize);
        rows.iter()
            .filter(|r| r.DestinationPrefix.PrefixLength == 0)
            .map(|r| (r.Metric, Ipv4Addr::from(r.NextHop.Ipv4.sin_addr.S_un.S_addr.to_ne_bytes())))
            .filter(|(_, ip)| !ip.is_unspecified())
            .min_by_key(|(metric, _)| *metric)
            .map(|(_, ip)| ip)
    };
    unsafe { FreeMibTable(table as *const _) };
    best
}

#[cfg(not(windows))]
pub fn default_gateway() -> Option<Ipv4Addr> {
    None
}
