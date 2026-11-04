use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const DEFAULT_THRESHOLDS_JSON: &str = include_str!("../../../config/thresholds.json");

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct GradeLimit {
    pub avg_ms: f64,
    pub jitter_ms: f64,
    pub loss_pct: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProblemHopLimit {
    pub jump_ms: f64,
    pub loss_pct: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Thresholds {
    pub excellent: GradeLimit,
    pub good: GradeLimit,
    pub playable: GradeLimit,
    pub problem_hop: ProblemHopLimit,
}

impl Default for Thresholds {
    fn default() -> Self {
        serde_json::from_str(DEFAULT_THRESHOLDS_JSON).unwrap_or(Self {
            excellent: GradeLimit { avg_ms: 50.0, jitter_ms: 4.0, loss_pct: 0.0 },
            good: GradeLimit { avg_ms: 90.0, jitter_ms: 10.0, loss_pct: 2.0 },
            playable: GradeLimit { avg_ms: 150.0, jitter_ms: 25.0, loss_pct: 5.0 },
            problem_hop: ProblemHopLimit { jump_ms: 25.0, loss_pct: 5.0 },
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum Grade {
    Excellent,
    Good,
    Playable,
    Bad,
}

impl Grade {
    pub fn as_str(self) -> &'static str {
        match self {
            Grade::Excellent => "Excellent",
            Grade::Good => "Good",
            Grade::Playable => "Playable",
            Grade::Bad => "Bad",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PingStats {
    pub sent: u32,
    pub received: u32,
    pub loss_pct: f64,
    pub min: Option<f64>,
    pub avg: Option<f64>,
    pub p95: Option<f64>,
    pub max: Option<f64>,
    pub jitter: Option<f64>,
    /// One entry per echo in send order; `None` is a lost echo.
    pub samples: Vec<Option<f64>>,
}

impl PingStats {
    pub fn from_samples(samples: Vec<Option<f64>>) -> Self {
        let received: Vec<f64> = samples.iter().flatten().copied().collect();
        let sent = samples.len() as u32;
        let got = received.len() as u32;
        let loss_pct = if sent == 0 { 100.0 } else { f64::from(sent - got) * 100.0 / f64::from(sent) };

        let mut sorted = received.clone();
        sorted.sort_by(f64::total_cmp);

        Self {
            sent,
            received: got,
            loss_pct,
            min: sorted.first().copied(),
            avg: mean(&received),
            p95: percentile(&sorted, 95.0),
            max: sorted.last().copied(),
            jitter: jitter(&received),
            samples,
        }
    }

    pub fn grade(&self, t: &Thresholds) -> Option<Grade> {
        let avg = self.avg?;
        let jitter = self.jitter.unwrap_or(0.0);
        let fits = |l: &GradeLimit| avg <= l.avg_ms && jitter <= l.jitter_ms && self.loss_pct <= l.loss_pct;
        Some(if fits(&t.excellent) {
            Grade::Excellent
        } else if fits(&t.good) {
            Grade::Good
        } else if fits(&t.playable) {
            Grade::Playable
        } else {
            Grade::Bad
        })
    }
}

fn mean(values: &[f64]) -> Option<f64> {
    (!values.is_empty()).then(|| values.iter().sum::<f64>() / values.len() as f64)
}

/// Nearest-rank percentile over an ascending slice.
pub fn percentile(sorted: &[f64], pct: f64) -> Option<f64> {
    if sorted.is_empty() {
        return None;
    }
    let rank = ((pct / 100.0) * sorted.len() as f64).ceil() as usize;
    sorted.get(rank.clamp(1, sorted.len()) - 1).copied()
}

/// Mean absolute difference between consecutive received RTTs (RFC 3550-style
/// inter-arrival variation, without smoothing). Lost echoes are skipped rather
/// than treated as a gap of zero.
pub fn jitter(received: &[f64]) -> Option<f64> {
    if received.len() < 2 {
        return if received.is_empty() { None } else { Some(0.0) };
    }
    let total: f64 = received.windows(2).map(|w| (w[1] - w[0]).abs()).sum();
    Some(total / (received.len() - 1) as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(v: &[f64]) -> Vec<Option<f64>> {
        v.iter().map(|x| Some(*x)).collect()
    }

    #[test]
    fn default_thresholds_parse_from_config_file() {
        let parsed: Thresholds = serde_json::from_str(DEFAULT_THRESHOLDS_JSON).expect("config parses");
        assert_eq!(parsed, Thresholds::default());
        assert!(parsed.excellent.avg_ms < parsed.good.avg_ms);
        assert!(parsed.good.avg_ms < parsed.playable.avg_ms);
    }

    #[test]
    fn jitter_is_mean_abs_consecutive_difference() {
        assert_eq!(jitter(&[80.0, 84.0, 82.0, 90.0]), Some((4.0 + 2.0 + 8.0) / 3.0));
        assert_eq!(jitter(&[82.0; 20]), Some(0.0));
        assert_eq!(jitter(&[82.0]), Some(0.0));
        assert_eq!(jitter(&[]), None);
    }

    #[test]
    fn jitter_skips_lost_echoes() {
        let st = PingStats::from_samples(vec![Some(80.0), None, Some(90.0), Some(85.0)]);
        assert_eq!(st.jitter, Some((10.0 + 5.0) / 2.0));
    }

    #[test]
    fn p95_uses_nearest_rank() {
        let sorted: Vec<f64> = (1..=20).map(f64::from).collect();
        assert_eq!(percentile(&sorted, 95.0), Some(19.0));
        assert_eq!(percentile(&sorted, 100.0), Some(20.0));
        assert_eq!(percentile(&[5.0], 95.0), Some(5.0));
        assert_eq!(percentile(&[], 95.0), None);
        let sorted: Vec<f64> = (1..=10).map(f64::from).collect();
        assert_eq!(percentile(&sorted, 95.0), Some(10.0));
    }

    #[test]
    fn stats_min_avg_max_loss() {
        let mut samples = s(&[82.0, 81.0, 83.0, 82.0]);
        samples.push(None);
        let st = PingStats::from_samples(samples);
        assert_eq!(st.sent, 5);
        assert_eq!(st.received, 4);
        assert_eq!(st.loss_pct, 20.0);
        assert_eq!(st.min, Some(81.0));
        assert_eq!(st.max, Some(83.0));
        assert_eq!(st.avg, Some(82.0));
    }

    #[test]
    fn all_lost_has_no_numbers_and_no_grade() {
        let st = PingStats::from_samples(vec![None; 20]);
        assert_eq!(st.loss_pct, 100.0);
        assert_eq!(st.avg, None);
        assert_eq!(st.grade(&Thresholds::default()), None);
    }

    #[test]
    fn grading_follows_config_thresholds() {
        let t = Thresholds::default();
        assert_eq!(PingStats::from_samples(s(&[30.0; 20])).grade(&t), Some(Grade::Excellent));
        assert_eq!(PingStats::from_samples(s(&[82.0; 20])).grade(&t), Some(Grade::Good));
        assert_eq!(PingStats::from_samples(s(&[120.0; 20])).grade(&t), Some(Grade::Playable));
        assert_eq!(PingStats::from_samples(s(&[180.0; 20])).grade(&t), Some(Grade::Bad));
    }

    #[test]
    fn worst_metric_decides_grade() {
        let t = Thresholds::default();
        let mut lossy = s(&[30.0; 19]);
        lossy.push(None);
        assert_eq!(PingStats::from_samples(lossy).grade(&t), Some(Grade::Playable));

        let jittery: Vec<f64> = (0..20).map(|i| if i % 2 == 0 { 30.0 } else { 70.0 }).collect();
        assert_eq!(PingStats::from_samples(s(&jittery)).grade(&t), Some(Grade::Bad));

        let mut two_lost = s(&[82.0; 18]);
        two_lost.extend([None, None]);
        assert_eq!(PingStats::from_samples(two_lost).grade(&t), Some(Grade::Bad));
    }

    #[test]
    fn grade_ordering_is_best_first() {
        assert!(Grade::Excellent < Grade::Good && Grade::Good < Grade::Playable && Grade::Playable < Grade::Bad);
    }
}
