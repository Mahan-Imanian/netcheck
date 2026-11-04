use std::net::Ipv4Addr;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, thiserror::Error)]
pub enum FirewallError {
    #[error("Windows Firewall could not be read: {0}")]
    Com(String),
    #[error("Windows Firewall is only available on Windows")]
    Unsupported,
}

pub const PROFILE_DOMAIN: i32 = 1;
pub const PROFILE_PRIVATE: i32 = 2;
pub const PROFILE_PUBLIC: i32 = 4;
pub const PROFILE_ALL: i32 = 0x7fff_ffff;
const PROTO_ANY: i32 = 256;
const PROTO_ICMPV4: i32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AddrSpec {
    Any,
    Range(u32, u32),
}

impl AddrSpec {
    pub fn contains(&self, ip: Ipv4Addr) -> bool {
        let v = u32::from(ip);
        match *self {
            AddrSpec::Any => true,
            AddrSpec::Range(lo, hi) => (lo..=hi).contains(&v),
        }
    }
}

fn mask_from(text: &str) -> Option<u32> {
    if let Ok(bits) = text.parse::<u32>() {
        return (bits <= 32).then(|| if bits == 0 { 0 } else { u32::MAX << (32 - bits) });
    }
    text.parse::<Ipv4Addr>().ok().map(u32::from)
}

/// Parses `INetFwRule::RemoteAddresses`: a comma list of `*`, single
/// addresses, `addr/mask` (prefix length or dotted mask) and `lo-hi` ranges.
/// IPv6 entries and keywords such as `LocalSubnet` never match a relay and
/// are dropped.
pub fn parse_remote_addresses(text: &str) -> Vec<AddrSpec> {
    text.split(',')
        .map(str::trim)
        .filter_map(|part| {
            if part == "*" {
                return Some(AddrSpec::Any);
            }
            if let Some((lo, hi)) = part.split_once('-') {
                let (lo, hi) = (lo.trim().parse::<Ipv4Addr>().ok()?, hi.trim().parse::<Ipv4Addr>().ok()?);
                return Some(AddrSpec::Range(u32::from(lo), u32::from(hi)));
            }
            if let Some((addr, mask)) = part.split_once('/') {
                let base = u32::from(addr.trim().parse::<Ipv4Addr>().ok()?);
                let m = mask_from(mask.trim())?;
                return Some(AddrSpec::Range(base & m, (base & m) | !m));
            }
            let ip = u32::from(part.parse::<Ipv4Addr>().ok()?);
            Some(AddrSpec::Range(ip, ip))
        })
        .collect()
}

#[derive(Debug, Clone, PartialEq)]
pub struct BlockRule {
    pub name: String,
    pub group: String,
    pub enabled: bool,
    pub outbound: bool,
    pub block: bool,
    pub profiles: i32,
    pub protocol: i32,
    pub application: String,
    pub remote: Vec<AddrSpec>,
}

impl BlockRule {
    fn applies_to_cs2(&self) -> bool {
        let app = self.application.to_ascii_lowercase();
        app.is_empty() || app.ends_with("\\cs2.exe")
    }

    fn is_candidate(&self) -> bool {
        self.enabled && self.block && self.outbound && self.applies_to_cs2()
    }

    fn matches(&self, ip: Ipv4Addr) -> bool {
        self.is_candidate() && self.remote.iter().any(|a| a.contains(ip))
    }

    pub fn blocks_icmp(&self) -> bool {
        self.protocol == PROTO_ANY || self.protocol == PROTO_ICMPV4
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProfileState {
    pub domain: bool,
    pub private: bool,
    pub public: bool,
    /// Bitmask of the profiles Windows currently applies (the network you're on).
    pub active: i32,
}

impl ProfileState {
    fn enabled_mask(&self) -> i32 {
        (if self.domain { PROFILE_DOMAIN } else { 0 })
            | (if self.private { PROFILE_PRIVATE } else { 0 })
            | (if self.public { PROFILE_PUBLIC } else { 0 })
    }

    /// Profiles that are both active and switched on.
    pub fn enforcing(&self) -> i32 {
        self.enabled_mask() & self.active
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct FirewallSnapshot {
    pub profiles: ProfileState,
    pub rules: Vec<BlockRule>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", tag = "state")]
#[ts(export)]
pub enum BlockState {
    Open,
    /// Every relay sits in an enforced block rule.
    #[serde(rename_all = "camelCase")]
    Blocked { rule: String, group: String, blocks_icmp: bool },
    /// A matching block rule exists but no active profile enforces it.
    Inactive { rule: String, group: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FirewallSummary {
    pub readable: bool,
    pub error: Option<String>,
    pub profiles: Option<ProfileState>,
    pub block_rule_count: u32,
    pub groups: Vec<String>,
    /// A block rule covers relays, but the firewall is off for the network you're on.
    pub warn_inactive: bool,
}

impl FirewallSnapshot {
    pub fn rule_for(&self, ip: Ipv4Addr) -> Option<&BlockRule> {
        self.rules.iter().find(|r| r.matches(ip))
    }

    fn enforced(&self, rule: &BlockRule) -> bool {
        let enforcing = self.profiles.enforcing();
        rule.profiles == PROFILE_ALL || rule.profiles & enforcing != 0
    }

    pub fn classify(&self, relays: &[Ipv4Addr]) -> BlockState {
        if relays.is_empty() {
            return BlockState::Open;
        }
        let matched: Option<Vec<&BlockRule>> = relays.iter().map(|ip| self.rule_for(*ip)).collect();
        let Some(rules) = matched else { return BlockState::Open };
        let first = rules[0];
        if rules.iter().all(|r| self.enforced(r)) && self.profiles.enforcing() != 0 {
            BlockState::Blocked {
                rule: first.name.clone(),
                group: first.group.clone(),
                blocks_icmp: rules.iter().all(|r| r.blocks_icmp()),
            }
        } else {
            BlockState::Inactive { rule: first.name.clone(), group: first.group.clone() }
        }
    }

    /// Addresses in the same /24 as `relay`, nearest first, that no block rule covers.
    pub fn unblocked_neighbours(&self, relay: Ipv4Addr) -> Vec<Ipv4Addr> {
        let [a, b, c, d] = relay.octets();
        (1..=3i16)
            .flat_map(|k| [i16::from(d) + k, i16::from(d) - k])
            .filter(|n| (1..=254).contains(n))
            .filter_map(|n| u8::try_from(n).ok())
            .map(|n| Ipv4Addr::new(a, b, c, n))
            .filter(|ip| self.rule_for(*ip).is_none())
            .collect()
    }

    pub fn summary(&self, states: &[BlockState]) -> FirewallSummary {
        let mut groups: Vec<String> =
            self.rules.iter().filter(|r| r.is_candidate() && !r.group.is_empty()).map(|r| r.group.clone()).collect();
        groups.sort();
        groups.dedup();
        FirewallSummary {
            readable: true,
            error: None,
            profiles: Some(self.profiles),
            block_rule_count: self.rules.iter().filter(|r| r.is_candidate()).count() as u32,
            groups,
            warn_inactive: states.iter().any(|s| matches!(s, BlockState::Inactive { .. })),
        }
    }
}

impl FirewallSummary {
    pub fn unreadable(err: &FirewallError) -> Self {
        Self {
            readable: false,
            error: Some(err.to_string()),
            profiles: None,
            block_rule_count: 0,
            groups: Vec::new(),
            warn_inactive: false,
        }
    }
}

#[cfg(windows)]
pub fn read() -> Result<FirewallSnapshot, FirewallError> {
    std::thread::spawn(windows_impl::read).join().map_err(|_| FirewallError::Com("reader thread panicked".into()))?
}

#[cfg(not(windows))]
pub fn read() -> Result<FirewallSnapshot, FirewallError> {
    Err(FirewallError::Unsupported)
}

#[cfg(windows)]
mod windows_impl {
    use windows::core::Interface;
    use windows::Win32::Foundation::VARIANT_BOOL;
    use windows::Win32::NetworkManagement::WindowsFirewall::{
        INetFwPolicy2, INetFwRule, NetFwPolicy2, NET_FW_ACTION_BLOCK, NET_FW_PROFILE2_DOMAIN, NET_FW_PROFILE2_PRIVATE,
        NET_FW_PROFILE2_PUBLIC, NET_FW_RULE_DIR_OUT,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, IDispatch, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
    };
    use windows::Win32::System::Ole::IEnumVARIANT;
    use windows::Win32::System::Variant::VARIANT;

    use super::*;

    fn com(e: windows::core::Error) -> FirewallError {
        FirewallError::Com(e.message())
    }

    struct ComGuard;
    impl Drop for ComGuard {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }

    fn on(v: VARIANT_BOOL) -> bool {
        v.as_bool()
    }

    pub fn read() -> Result<FirewallSnapshot, FirewallError> {
        unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.ok().map_err(com)?;
        let _guard = ComGuard;

        let policy: INetFwPolicy2 = unsafe { CoCreateInstance(&NetFwPolicy2, None, CLSCTX_INPROC_SERVER) }.map_err(com)?;
        let profiles = unsafe {
            ProfileState {
                domain: on(policy.get_FirewallEnabled(NET_FW_PROFILE2_DOMAIN).map_err(com)?),
                private: on(policy.get_FirewallEnabled(NET_FW_PROFILE2_PRIVATE).map_err(com)?),
                public: on(policy.get_FirewallEnabled(NET_FW_PROFILE2_PUBLIC).map_err(com)?),
                active: policy.CurrentProfileTypes().map_err(com)?,
            }
        };

        let enumerator: IEnumVARIANT = unsafe { policy.Rules().map_err(com)?._NewEnum().map_err(com)? }.cast().map_err(com)?;
        let mut rules = Vec::new();
        loop {
            let mut slot = [VARIANT::default()];
            let mut fetched = 0u32;
            let hr = unsafe { enumerator.Next(&mut slot, &mut fetched) };
            if hr.is_err() || fetched == 0 {
                break;
            }
            let Ok(dispatch) = IDispatch::try_from(&slot[0]) else { continue };
            let Ok(rule) = dispatch.cast::<INetFwRule>() else { continue };
            if let Some(parsed) = parse_rule(&rule) {
                rules.push(parsed);
            }
        }
        Ok(FirewallSnapshot { profiles, rules })
    }

    fn parse_rule(rule: &INetFwRule) -> Option<BlockRule> {
        unsafe {
            if rule.Action().ok()? != NET_FW_ACTION_BLOCK {
                return None;
            }
            let remote = rule.RemoteAddresses().map(|b| b.to_string()).unwrap_or_default();
            Some(BlockRule {
                name: rule.Name().map(|b| b.to_string()).unwrap_or_default(),
                group: rule.Grouping().map(|b| b.to_string()).unwrap_or_default(),
                enabled: rule.Enabled().map(on).unwrap_or(false),
                outbound: rule.Direction().ok()? == NET_FW_RULE_DIR_OUT,
                block: true,
                profiles: rule.Profiles().unwrap_or(PROFILE_ALL),
                protocol: rule.Protocol().unwrap_or(PROTO_ANY),
                application: rule.ApplicationName().map(|b| b.to_string()).unwrap_or_default(),
                remote: parse_remote_addresses(&remote),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(s: &str) -> Ipv4Addr {
        s.parse().expect("ip")
    }

    fn rule(name: &str, remote: &str) -> BlockRule {
        BlockRule {
            name: name.into(),
            group: "CS2 Vienna Only".into(),
            enabled: true,
            outbound: true,
            block: true,
            profiles: PROFILE_ALL,
            protocol: PROTO_ANY,
            application: String::new(),
            remote: parse_remote_addresses(remote),
        }
    }

    fn fw_on() -> ProfileState {
        ProfileState { domain: true, private: true, public: true, active: PROFILE_PRIVATE }
    }

    #[test]
    fn parses_every_remote_address_form() {
        let specs = parse_remote_addresses(
            "155.133.226.71/255.255.255.255, 155.133.230.0/24,162.254.197.10-162.254.197.20,10.0.0.1,LocalSubnet,fe80::1/64",
        );
        assert_eq!(specs.len(), 4);
        assert!(specs[0].contains(ip("155.133.226.71")));
        assert!(!specs[0].contains(ip("155.133.226.72")));
        assert!(specs[1].contains(ip("155.133.230.255")));
        assert!(specs[2].contains(ip("162.254.197.15")));
        assert!(!specs[2].contains(ip("162.254.197.21")));
        assert!(specs[3].contains(ip("10.0.0.1")));
        assert_eq!(parse_remote_addresses("*"), vec![AddrSpec::Any]);
        assert!(parse_remote_addresses("").is_empty());
    }

    #[test]
    fn region_blocked_only_when_every_relay_is_covered() {
        let fw = FirewallSnapshot { profiles: fw_on(), rules: vec![rule("Block fra", "10.1.1.10,10.1.1.11")] };
        let all = [ip("10.1.1.10"), ip("10.1.1.11")];
        let some = [ip("10.1.1.10"), ip("10.1.1.12")];
        assert!(matches!(fw.classify(&all), BlockState::Blocked { blocks_icmp: true, .. }));
        assert_eq!(fw.classify(&some), BlockState::Open);
        assert_eq!(fw.classify(&[]), BlockState::Open);
    }

    #[test]
    fn disabled_inbound_allow_and_other_app_rules_do_not_block() {
        let relays = [ip("10.1.1.10")];
        let mut disabled = rule("off", "10.1.1.10");
        disabled.enabled = false;
        let mut inbound = rule("in", "10.1.1.10");
        inbound.outbound = false;
        let mut allow = rule("allow", "10.1.1.10");
        allow.block = false;
        let mut other_app = rule("app", "*");
        other_app.application = r"C:\Program Files\Other\other.exe".into();
        for r in [disabled, inbound, allow, other_app] {
            let fw = FirewallSnapshot { profiles: fw_on(), rules: vec![r] };
            assert_eq!(fw.classify(&relays), BlockState::Open);
        }

        let mut cs2 = rule("cs2", "10.1.1.0/24");
        cs2.application = r"C:\Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe".into();
        let fw = FirewallSnapshot { profiles: fw_on(), rules: vec![cs2] };
        assert!(matches!(fw.classify(&relays), BlockState::Blocked { .. }));
    }

    #[test]
    fn firewall_off_makes_rule_inactive_and_warns() {
        let profiles = ProfileState { domain: true, private: false, public: false, active: PROFILE_PRIVATE };
        let fw = FirewallSnapshot { profiles, rules: vec![rule("Block fra", "10.1.1.10")] };
        let state = fw.classify(&[ip("10.1.1.10")]);
        assert!(matches!(state, BlockState::Inactive { .. }));
        let summary = fw.summary(&[state, BlockState::Open]);
        assert!(summary.warn_inactive);
        assert_eq!(summary.groups, vec!["CS2 Vienna Only".to_string()]);
    }

    #[test]
    fn rule_limited_to_inactive_profile_is_not_enforced() {
        let mut r = rule("domain only", "10.1.1.10");
        r.profiles = PROFILE_DOMAIN;
        let fw = FirewallSnapshot { profiles: fw_on(), rules: vec![r] };
        assert!(matches!(fw.classify(&[ip("10.1.1.10")]), BlockState::Inactive { .. }));
    }

    #[test]
    fn udp_only_rule_still_answers_icmp() {
        let mut r = rule("udp", "10.1.1.10");
        r.protocol = 17;
        let fw = FirewallSnapshot { profiles: fw_on(), rules: vec![r] };
        assert!(matches!(fw.classify(&[ip("10.1.1.10")]), BlockState::Blocked { blocks_icmp: false, .. }));
    }

    #[test]
    fn neighbours_skip_blocked_and_stay_in_the_slash_24() {
        let fw = FirewallSnapshot { profiles: fw_on(), rules: vec![rule("Block", "10.1.1.10-10.1.1.11")] };
        let n = fw.unblocked_neighbours(ip("10.1.1.10"));
        assert_eq!(n, vec![ip("10.1.1.9"), ip("10.1.1.12"), ip("10.1.1.8"), ip("10.1.1.13"), ip("10.1.1.7")]);
        let edge = FirewallSnapshot { profiles: fw_on(), rules: vec![] }.unblocked_neighbours(ip("10.1.1.1"));
        assert_eq!(edge, vec![ip("10.1.1.2"), ip("10.1.1.3"), ip("10.1.1.4")]);
    }
}
