//! OCR CONFIDENCE SCALES (FEAT-003).
//!
//! THE RECOGNISER EMITS A SOFTMAX ROW PER TIME STEP. THE LEGACY SCORE APPLIES A SIGMOID ON TOP OF THE WINNING
//! PROBABILITY, SO IT LIVES IN (0.5, 0.7311]. THE CALIBRATED SCORE IS THE MEAN OF THE WINNING PROBABILITIES
//! THEMSELVES, IN [0, 1]. BOTH ARE CARRIED SIDE BY SIDE UNTIL EVERY THRESHOLD HAS MOVED (ADR-001).

/// LOWEST LEGACY SCORE A DECODED CHARACTER CAN GET (SIGMOID OF A PROBABILITY OF 0).
pub const LEGACY_MIN: f32 = 0.5;
/// HIGHEST LEGACY SCORE A DECODED CHARACTER CAN GET (SIGMOID OF 1).
pub const LEGACY_MAX: f32 = 0.731_058_6;
/// NAME OF THE CALIBRATED SCALE, REPORTED IN OcrStats.confidence_scale.
pub const SCALE_TAG: &str = "softmax_mean_v1";

/// THE LEGACY PER-CHARACTER SCORE. BYTE-FOR-BYTE THE ORIGINAL DECODER EXPRESSION, SO OUTPUT STAYS BIT-IDENTICAL.
pub fn legacy_from_prob(v: f32) -> f32 {
    (1.0 / (1.0 + (-v.max(-20.0).min(20.0)).exp())).clamp(0.0, 1.0)
}

/// INVERSE OF THE SIGMOID, CLAMPED TO A FINITE VALUE.
pub fn logit(t: f32) -> f32 {
    let v = (t / (1.0 - t)).ln();
    if v.is_nan() {
        0.0
    } else {
        v.clamp(-20.0, 20.0)
    }
}

/// APPROXIMATE PROBABILITY FOR A LEGACY SCORE. EXACT FOR ONE CHARACTER, AN APPROXIMATION FOR AVERAGED SCORES
/// (ADR-004). NaN MAPS TO 0.
pub fn prob_from_legacy(s: f32) -> f32 {
    if s.is_nan() {
        return 0.0;
    }
    logit(s).clamp(0.0, 1.0)
}

/// TRUE WHEN A TIME-STEP ROW LOOKS LIKE A PROBABILITY DISTRIBUTION (EVERY VALUE IN [0, 1], SUM CLOSE TO 1).
pub(crate) fn row_is_probability(row: &[f32]) -> bool {
    if row.is_empty() {
        return false;
    }
    let mut sum = 0.0_f64;
    for &v in row {
        if !(-1e-6..=1.0 + 1e-6).contains(&v) {
            return false;
        }
        sum += v as f64;
    }
    (sum - 1.0).abs() <= 1e-3
}
