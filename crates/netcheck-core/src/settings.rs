use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::stats::Thresholds;

pub const AUTO_REGION: &str = "auto";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Theme {
    System,
    Dark,
    Light,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct Settings {
    pub preferred_region: String,
    pub ping_count: u32,
    pub thresholds: Thresholds,
    /// `None` until the player has been asked once.
    pub close_after_launch: Option<bool>,
    pub theme: Theme,
    /// Where arcs on the map start. `None` estimates from the lowest-ping region.
    pub home_lon_lat: Option<(f64, f64)>,
    pub check_updates: bool,
    /// UI language code. `None` follows the installer's choice, then English.
    pub language: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            preferred_region: AUTO_REGION.into(),
            ping_count: 20,
            thresholds: Thresholds::default(),
            close_after_launch: None,
            theme: Theme::System,
            home_lon_lat: None,
            check_updates: true,
            language: None,
        }
    }
}

impl Settings {
    pub const MIN_PINGS: u32 = 10;
    pub const MAX_PINGS: u32 = 100;

    pub fn sanitized(mut self) -> Self {
        self.ping_count = self.ping_count.clamp(Self::MIN_PINGS, Self::MAX_PINGS);
        self.preferred_region = self.preferred_region.trim().to_ascii_lowercase();
        if self.preferred_region.is_empty() {
            self.preferred_region = AUTO_REGION.into();
        }
        if self.language.as_deref().is_some_and(|l| !LANGUAGES.contains(&l)) {
            self.language = None;
        }
        self
    }

    /// Fills an unset language from the installer, without saving it.
    pub fn with_installer_language(mut self) -> Self {
        if self.language.is_none() {
            self.language = installer_lcid().and_then(language_for_lcid).map(String::from);
        }
        self
    }
}

/// Language codes the UI ships translations for.
pub const LANGUAGES: [&str; 11] = ["en", "es", "pt-BR", "fr", "de", "ru", "pl", "tr", "zh-CN", "ar", "fa"];

/// Maps the Windows language id saved by the installer's language picker.
pub fn language_for_lcid(lcid: u32) -> Option<&'static str> {
    Some(match lcid & 0x3ff {
        0x09 => "en",
        0x0a => "es",
        0x16 => "pt-BR",
        0x0c => "fr",
        0x07 => "de",
        0x19 => "ru",
        0x15 => "pl",
        0x1f => "tr",
        0x04 => "zh-CN",
        0x01 => "ar",
        0x29 => "fa",
        _ => return None,
    })
}

/// The NSIS installer's language picker saves its choice as a decimal
/// language id under `HKCU\Software\<publisher>\<product>`.
#[cfg(windows)]
fn installer_lcid() -> Option<u32> {
    use windows::core::w;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ};

    let mut buf = [0u16; 16];
    let mut size = std::mem::size_of_val(&buf) as u32;
    // SAFETY: `buf` and `size` describe a valid, writable buffer for the call.
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            w!("Software\\Mahan Imanian\\Netcheck"),
            w!("Installer Language"),
            RRF_RT_REG_SZ,
            None,
            Some(buf.as_mut_ptr().cast()),
            Some(&mut size),
        )
    };
    if status.is_err() {
        return None;
    }
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..len]).trim().parse().ok()
}

#[cfg(not(windows))]
fn installer_lcid() -> Option<u32> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_installer_languages() {
        assert_eq!(language_for_lcid(1033), Some("en"));
        assert_eq!(language_for_lcid(1065), Some("fa"));
        assert_eq!(language_for_lcid(1046), Some("pt-BR"));
        assert_eq!(language_for_lcid(2052), Some("zh-CN"));
        assert_eq!(language_for_lcid(1025), Some("ar"));
        assert_eq!(language_for_lcid(1041), None);
    }

    #[test]
    fn drops_unknown_languages() {
        let s = Settings { language: Some("xx".into()), ..Settings::default() }.sanitized();
        assert_eq!(s.language, None);
        let s = Settings { language: Some("fa".into()), ..Settings::default() }.sanitized();
        assert_eq!(s.language.as_deref(), Some("fa"));
    }
}
