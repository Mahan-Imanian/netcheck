use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::stats::Thresholds;

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
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            preferred_region: "vie".into(),
            ping_count: 20,
            thresholds: Thresholds::default(),
            close_after_launch: None,
            theme: Theme::System,
            home_lon_lat: None,
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
            self.preferred_region = "vie".into();
        }
        self
    }
}
