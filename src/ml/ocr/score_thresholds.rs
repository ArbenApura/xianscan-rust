//! OCR SCORE THRESHOLDS (FEAT-003 ADR-003).
//!
//! EVERY ABSOLUTE OCR-SCORE CUT THE PIPELINE MAKES LIVES HERE, ONE CONSTANT PER PURPOSE, SO EACH CAN BE MOVED TO THE
//! CALIBRATED SCALE AND RE-TUNED ON ITS OWN. SITE IDS (E1, F7, R5, L13 ...) REFER TO THE INVENTORY IN
//! docs/features/ocr-confidence-calibration/SPEC.md SECTION 8.
//!
//! SCALE: EVERY ENTRY IS WRITTEN AS ITS LEGACY SIGMOID-SCALE LITERAL (A LINE SCORE LIVES IN [0.5, 0.7311] THERE).
//! A `Legacy` ENTRY IS A PLAIN CONSTANT COMPARED AGAINST THE LEGACY score. A `Prob` ENTRY (FEAT-003 PHASE 6) IS A
//! LazyLock HOLDING logit(<LEGACY LITERAL>) AND IS COMPARED AGAINST THE CALIBRATED PROBABILITY; logit MAPS THE LEGACY
//! RANGE ONTO [0, 1], SO A FORMERLY DEAD CUT LANDS OUTSIDE [0, 1] AND STAYS DEAD UNTIL PHASE 7 RE-TUNES IT.
//! EVERY ENTRY IS `Legacy` FOR NOW: PHASE 6 IS BLOCKED ON THE OWNER (THE PHASE 4 FIXTURE MATCH RATE WAS 75.4%, UNDER
//! THE 95% GATE), SO NO SITE READS THE CALIBRATED PROBABILITY YET.
//! A CUT OUTSIDE ITS SCALE'S RANGE CAN NEVER BE TRUE OR IS ALWAYS TRUE; REGISTRY RECORDS WHICH, AND tier1 TEST
//! ocr_score_thresholds_registry_status KEEPS THE RECORD HONEST. THE COMPARISON OPERATOR AT EACH SITE IS UNCHANGED.
//!
//! MARGINS AND RATIOS (RELATIVE COMPARISONS) ARE PLAIN CONSTANTS AT THE END; THEY HAVE NO REACHABILITY OF THEIR OWN.


use super::confidence::logit;

/// THE COMPARISON A SITE APPLIES: `score <op> threshold`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cmp {
    Lt,
    Le,
    Ge,
    Gt,
}

/// WHETHER A THRESHOLD CAN DECIDE ANYTHING FOR SCORES ON ITS SCALE.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Reachable,
    NeverTrue,
    AlwaysTrue,
}

/// WHICH SCORE A THRESHOLD IS COMPARED AGAINST.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scale {
    /// THE LEGACY SIGMOID score, RANGE [LEGACY_MIN, LEGACY_MAX].
    Legacy,
    /// THE CALIBRATED PROBABILITY (prob_or_derived / ocr_confidence), RANGE [0, 1].
    Prob,
}

/// ONE REGISTERED THRESHOLD.
#[derive(Debug, Clone, Copy)]
pub struct ThresholdInfo {
    pub name: &'static str,
    /// THE LITERAL AS WRITTEN (LEGACY SCALE).
    pub legacy_value: f32,
    pub scale: Scale,
    pub op: Cmp,
    pub sites: &'static str,
    pub documented_status: Status,
}

impl ThresholdInfo {
    /// THE VALUE THE SITES ACTUALLY COMPARE AGAINST.
    pub fn value(&self) -> f32 {
        match self.scale {
            Scale::Legacy => self.legacy_value,
            Scale::Prob => logit(self.legacy_value),
        }
    }
}

macro_rules! threshold_item {
    ($(#[$meta:meta])* $name:ident, $value:literal, Legacy) => {
        $(#[$meta])*
        pub const $name: f32 = $value;
    };
    ($(#[$meta:meta])* $name:ident, $value:literal, Prob) => {
        $(#[$meta])*
        pub static $name: std::sync::LazyLock<f32> = std::sync::LazyLock::new(|| logit($value));
    };
}

macro_rules! thresholds {
    ($( $(#[$meta:meta])* $name:ident = $value:literal, $op:ident, $sites:literal, $status:ident, $scale:ident; )*) => {
        $( threshold_item!($(#[$meta])* $name, $value, $scale); )*

        /// EVERY ABSOLUTE THRESHOLD ABOVE, WITH ITS SCALE, OPERATOR, SITES AND DOCUMENTED REACHABILITY.
        pub const REGISTRY: &[ThresholdInfo] = &[
            $( ThresholdInfo {
                name: stringify!($name),
                legacy_value: $value,
                scale: Scale::$scale,
                op: Cmp::$op,
                sites: $sites,
                documented_status: Status::$status,
            }, )*
        ];
    };
}

thresholds! {
    // -- src/ml/ocr/engine.rs -- //
    /// E1: ACCEPT AN UPRIGHT-SLICED VERTICAL RESULT FOR NON-CHINESE TEXT (`score >= `).
    VERT_UPRIGHT_ACCEPT_MIN = 0.60, Ge, "E1", Reachable, Legacy;
    /// E3: TRUST A VERTICAL-PATH RESULT FOR NON-CJK TEXT (`score >= `).
    VERT_RESULT_ACCEPT_MIN = 0.65, Ge, "E3", Reachable, Legacy;
    /// E4: KEEP A PROJECTION-STRIP LINE (`score >= `).
    PROJ_STRIP_LINE_MIN = 0.55, Ge, "E4", Reachable, Legacy;
    /// E6: REJECT A TILED SUB-IMAGE LINE ON A CHINESE PAGE (`score < `). NEVER TRUE ON THE LEGACY SCALE.
    TILE_LINE_MIN_CN = 0.50, Lt, "E6", NeverTrue, Legacy;
    /// E6: REJECT A TILED SUB-IMAGE LINE ON OTHER PAGES (`score < `).
    TILE_LINE_MIN_OTHER = 0.70, Lt, "E6", Reachable, Legacy;
    /// E7: A CONFIDENT TILED LINE REPLACES AN UNSURE OVERLAPPING ONE (`new >= ` AND `old < `).
    /// ON REAL PROBABILITIES THIS CUT CHANGED 3 OF 28 LIVE-FUSION PAGES IN THE PHASE 6 TRIAL (PHASE 7 ITEM).
    TILE_REPLACE_CONFIDENT = 0.70, Ge, "E7", Reachable, Legacy;
    /// E8: DROP THIN OPTICAL-BOUNDARY SLIVERS (`score < `).
    THIN_SLIVER_MAX = 0.65, Lt, "E8", Reachable, Legacy;

    // -- src/pipeline/fusion.rs -- //
    /// F1: A GIANT ARTWORK LINE IS DROPPED ONLY WHEN UNSURE (`score < `). ALWAYS TRUE ON THE LEGACY SCALE.
    FUSED_GIANT_ART_MAX = 0.75, Lt, "F1", AlwaysTrue, Legacy;
    /// F2: DROP A HIGH-TILT LOW-CONFIDENCE LINE (`score < `).
    FUSED_HIGH_TILT_MAX = 0.60, Lt, "F2", Reachable, Legacy;
    /// F3: DROP A MARGIN-FLUSH NON-NATIVE LINE ONLY WHEN UNSURE (`score < `). ALWAYS TRUE ON THE LEGACY SCALE.
    FUSED_MARGIN_NON_NATIVE_MAX = 0.75, Lt, "F3", AlwaysTrue, Legacy;
    /// F4: DROP ANY MARGIN-FLUSH LOW-CONFIDENCE LINE (`score < `).
    FUSED_MARGIN_MAX = 0.65, Lt, "F4", Reachable, Legacy;
    /// F5: A "NORMAL" REFERENCE LINE FOR THE SLIVER CHECK (`score >= `).
    FUSED_NORMAL_LINE_MIN = 0.65, Ge, "F5", Reachable, Legacy;
    /// F6: COUNT CONFIDENT LINES INSIDE A COMIC BOX (`score >= `).
    COMIC_BOX_CONFIDENT_LINE_MIN = 0.72, Ge, "F6", Reachable, Legacy;
    /// F7: A HIGH-QUALITY FULL-PAGE LINE USES THE STRICT WIDER/TALLER RULE (`score >= `). NEVER TRUE ON THE LEGACY SCALE.
    FULLPAGE_HIGH_QUALITY_MIN = 0.78, Ge, "F7", NeverTrue, Legacy;
    /// F8: A LOW-CONFIDENCE LINE NEEDS A RESCUE CROP (`score < `).
    RESCUE_LOW_CONF_MAX = 0.68, Lt, "F8", Reachable, Legacy;
    /// F9: EXCESSIVE MULTI-LINE BLEED GUARD (`score >= `).
    MULTILINE_BLEED_LINE_MIN = 0.70, Ge, "F9", Reachable, Legacy;
    /// F12: ACCEPT AN UNMATCHED-BOX CROP RESULT, PER LINE OR WHOLE CROP (`score >= `).
    UNMATCHED_CROP_ACCEPT_MIN = 0.60, Ge, "F12", Reachable, Legacy;
    /// F13: ACCEPT A STRIP LINE RECOGNITION (`score >= `).
    STRIP_LINE_ACCEPT_MIN = 0.55, Ge, "F13", Reachable, Legacy;
    /// F14: ACCEPT A BATCHED SINGLE-LINE CROP (`score >= `).
    BATCHED_LINE_ACCEPT_MIN = 0.65, Ge, "F14", Reachable, Legacy;

    // -- src/pipeline/analyzer.rs -- //
    /// A1: DROP JUNK LINES BEFORE FUSION (`score < `). NEVER TRUE ON THE LEGACY SCALE.
    PRE_FUSION_JUNK_FLOOR = 0.50, Lt, "A1", NeverTrue, Legacy;
    /// A4: RESCUE AN OFF-ANCHOR LINE ONLY WHEN CONFIDENT; REJECTED BELOW (`score < `).
    OFF_ANCHOR_RESCUE_MIN = 0.70, Lt, "A4", Reachable, Legacy;
    /// A4: THE SAME FOR KOREAN (`score < `).
    OFF_ANCHOR_RESCUE_MIN_KO = 0.72, Lt, "A4", Reachable, Legacy;
    /// A5: A TINY NON-CJK LINE RESCUE NEEDS HIGH CONFIDENCE (`score < ` REJECTS). ALWAYS TRUE ON THE LEGACY SCALE.
    TINY_RESCUE_MIN_LATIN = 0.85, Lt, "A5", AlwaysTrue, Legacy;
    /// A5: THE SAME FOR CJK (`score < ` REJECTS).
    TINY_RESCUE_MIN_CJK = 0.70, Lt, "A5", Reachable, Legacy;
    /// A7: NO-DETECTOR FALLBACK JUNK FLOOR (`score < `). NEVER TRUE ON THE LEGACY SCALE.
    FALLBACK_JUNK_FLOOR = 0.50, Lt, "A7", NeverTrue, Legacy;
    /// A8: DROP SINGLE-CHARACTER BLUSH OR ARTWORK MARKS (`region confidence < `).
    SINGLE_CHAR_ART_MAX = 0.58, Lt, "A8", Reachable, Legacy;

    // -- src/pipeline/region_builder/builder.rs -- //
    /// B1: A DOMINANT LINE EXISTS, SO WEAK NOISE LINES BESIDE IT MAY GO (`max >= `).
    DOMINANT_LINE_MIN = 0.70, Ge, "B1", Reachable, Legacy;
    /// B1: A LINE BESIDE A DOMINANT ONE IS KEPT AT OR ABOVE THIS (`score >= `).
    WEAK_LINE_KEEP_MIN = 0.60, Ge, "B1", Reachable, Legacy;
    /// B2: A CONFIDENT NATIVE LINE EXISTS (`score >= `).
    NATIVE_LINE_PRESENT_MIN = 0.65, Ge, "B2", Reachable, Legacy;

    // -- src/pipeline/region_builder/refine.rs -- //
    /// R1: A CLEAN SINGLE FREE-TEXT LINE SKIPS THE CROP (`cluster >= `).
    CLEAN_SINGLE_LINE_MIN = 0.70, Ge, "R1", Reachable, Legacy;
    /// R2: A CLEAN DENSE MULTI-LINE CLUSTER SKIPS THE CROP (`cluster >= `).
    CLEAN_DENSE_MULTILINE_MIN = 0.65, Ge, "R2", Reachable, Legacy;
    /// R3: CLEAN EXPRESSIVE PUNCTUATION SKIPS THE CROP (`cluster >= `).
    CLEAN_PUNCT_MIN = 0.65, Ge, "R3", Reachable, Legacy;
    /// R4: AN OVERSIZED SINGLE GLYPH IS SUSPICIOUS ONLY WHEN UNSURE (`cluster < `). ALWAYS TRUE ON THE LEGACY SCALE.
    OVERSIZED_SINGLE_MAX = 0.75, Lt, "R4", AlwaysTrue, Legacy;
    /// R5: THE BUBBLE IS ALREADY COMPLETE, SKIP THE CROP (`cluster >= `). NEVER TRUE ON THE LEGACY SCALE.
    BUBBLE_COMPLETE_MIN = 0.75, Ge, "R5", NeverTrue, Legacy;
    /// R6: DROP SHORT ALPHANUMERIC CROP NOISE ONLY WHEN UNSURE (`score < `). ALWAYS TRUE ON THE LEGACY SCALE.
    CROP_ALNUM_NOISE_MAX = 0.85, Lt, "R6", AlwaysTrue, Legacy;
    /// R7: AN EDGE SLIVER IN A CROP (`score < `).
    CROP_EDGE_SLIVER_MAX = 0.70, Lt, "R7", Reachable, Legacy;
    /// R8: A DOMINANT CROP LINE EXISTS, SO WEAK NOISE BESIDE IT MAY GO (`max >= `).
    CROP_DOMINANT_MIN = 0.70, Ge, "R8", Reachable, Legacy;
    /// R8: A CROP LINE BESIDE A DOMINANT ONE IS KEPT AT OR ABOVE THIS (`score >= `).
    CROP_WEAK_KEEP_MIN = 0.62, Ge, "R8", Reachable, Legacy;
    /// R9: CLEAN VERTICAL CLUSTER ORIENTATION GUARD (`cluster >= `).
    CLEAN_VERTICAL_CLUSTER_MIN = 0.70, Ge, "R9", Reachable, Legacy;
    /// R10: A SINGLE CLEAN LINE VERSUS A MULTI-LINE CROP (`cluster >= `).
    SINGLE_LINE_CLEAN_MIN = 0.70, Ge, "R10", Reachable, Legacy;
    /// R11: A CONFIDENT CROP RESCUES A WEAK CLUSTER (`crop >= `).
    CROP_RESCUE_MIN = 0.70, Ge, "R11", Reachable, Legacy;
    /// R11: ... WHEN THE CLUSTER IS THIS WEAK (`cluster < `).
    CROP_RESCUE_BASE_MAX = 0.60, Lt, "R11", Reachable, Legacy;

    // -- src/pipeline/region_builder/filter.rs (should_reject_candidate_region, ALL CLUSTER avg_score) -- //
    /// L1: GIANT ARTWORK BOX (`< `).
    FILTER_GIANT_ART_MAX = 0.65, Lt, "L1", Reachable, Legacy;
    /// L2: SENTENCE DIALOGUE GUARD (`>= `).
    FILTER_SENTENCE_DIALOGUE_MIN = 0.70, Ge, "L2", Reachable, Legacy;
    /// L3: WIDE ARTWORK HALLUCINATION (`< `, BOTH SITES).
    FILTER_WIDE_ART_MAX = 0.68, Lt, "L3", Reachable, Legacy;
    /// L4: HIGH-TILT NON-DIALOGUE (`< `).
    FILTER_HIGH_TILT_MAX = 0.65, Lt, "L4", Reachable, Legacy;
    /// L4: HIGH-TILT SHORT CHROMATIC TEXT (`< `). ALWAYS TRUE ON THE LEGACY SCALE.
    FILTER_HIGH_TILT_SHORT_MAX = 0.75, Lt, "L4", AlwaysTrue, Legacy;
    /// L5: PURE DIGITS IN A BUBBLE (`< `). ALWAYS TRUE ON THE LEGACY SCALE.
    FILTER_BUBBLE_DIGITS_MAX = 0.85, Lt, "L5", AlwaysTrue, Legacy;
    /// L6: CJK GARBAGE WITHOUT CJK CHARACTERS (`< `).
    FILTER_CJK_GARBAGE_MAX = 0.70, Lt, "L6", Reachable, Legacy;
    /// L7: DIGIT-CORRUPTED NOISE (`< `).
    FILTER_DIGIT_NOISE_MAX = 0.68, Lt, "L7", Reachable, Legacy;
    /// L7: LOW-CONFIDENCE NON-NATIVE NOISE (`< `).
    FILTER_LOW_CONF_NOISE_MAX = 0.68, Lt, "L7", Reachable, Legacy;
    /// L8: NON-BUBBLE TEXT THAT IS NOT A VALID SFX (`< `).
    FILTER_NON_BUBBLE_NON_SFX_MAX = 0.72, Lt, "L8", Reachable, Legacy;
    /// L9: LOW-CONFIDENCE BUBBLE GARBAGE (`< `).
    FILTER_BUBBLE_GARBAGE_MAX = 0.70, Lt, "L9", Reachable, Legacy;
    /// L9: NON-BUBBLE INVALID SFX (`< `).
    FILTER_INVALID_SFX_MAX = 0.70, Lt, "L9", Reachable, Legacy;
    /// L9: MIXED-SCRIPT DEBRIS (`< `).
    FILTER_MIXED_SCRIPT_DEBRIS_MAX = 0.70, Lt, "L9", Reachable, Legacy;
    /// L10: ALIEN SCRIPT MIX (`< `).
    FILTER_ALIEN_MIX_MAX = 0.72, Lt, "L10", Reachable, Legacy;
    /// L11: EXPRESSIVE PUNCTUATION MICRO NOISE (`< `).
    FILTER_PUNCT_MICRO_NOISE_MAX = 0.60, Lt, "L11", Reachable, Legacy;
    /// L12: SHORT LOW-CONFIDENCE TEXT (`< `). ALWAYS TRUE ON THE LEGACY SCALE.
    FILTER_SHORT_LOW_CONF_MAX = 0.75, Lt, "L12", AlwaysTrue, Legacy;
    /// L13: VERTICAL NARRATION BY CONFIDENCE (`>= `). NEVER TRUE ON THE LEGACY SCALE.
    FILTER_VERT_NARRATION_MIN = 0.75, Ge, "L13", NeverTrue, Legacy;
    /// L14: SIGN OR NARRATION BOX (`>= `).
    FILTER_SIGN_BOX_MIN = 0.70, Ge, "L14", Reachable, Legacy;
    /// L14: TALL PURE-CJK SIGN OR NARRATION BOX (`>= `).
    FILTER_SIGN_BOX_TALL_MIN = 0.62, Ge, "L14", Reachable, Legacy;
    /// L15: MARGIN-ISOLATED CHARACTER (`< `). ALWAYS TRUE ON THE LEGACY SCALE.
    FILTER_MARGIN_ISOLATED_MAX = 0.75, Lt, "L15", AlwaysTrue, Legacy;
    /// L16: VALID CJK GLYPH (`>= `, TWO SITES).
    FILTER_VALID_GLYPH_MIN = 0.70, Ge, "L16", Reachable, Legacy;
    /// L16: VALID SHORT CJK GLYPH (`>= `).
    FILTER_VALID_GLYPH_SHORT_MIN = 0.72, Ge, "L16", Reachable, Legacy;
    /// L17: LOW-CONFIDENCE SINGLE CHARACTER (`< `).
    FILTER_LOW_CONF_SINGLE_CHAR_MAX = 0.70, Lt, "L17", Reachable, Legacy;
    /// L17: COMPACT CHROMATIC SINGLE GLYPH (`< `).
    FILTER_COMPACT_GLYPH_MAX = 0.72, Lt, "L17", Reachable, Legacy;
    /// L18: ISOLATED SFX (`< `).
    FILTER_ISOLATED_SFX_MAX = 0.65, Lt, "L18", Reachable, Legacy;
    /// L18: ISOLATED SINGLE-GLYPH SFX (`< `). KNIFE EDGE: JUST BELOW THE LEGACY CEILING.
    FILTER_ISOLATED_SFX_SINGLE_MAX = 0.73, Lt, "L18", Reachable, Legacy;
    /// L19: TINY BOX FALLBACK (`< `). ALWAYS TRUE ON THE LEGACY SCALE.
    FILTER_TINY_BOX_MAX = 0.75, Lt, "L19", AlwaysTrue, Legacy;
    /// L20: SINGLE GLYPH OUTSIDE A BUBBLE (`< `). KNIFE EDGE: JUST BELOW THE LEGACY CEILING.
    FILTER_SINGLE_GLYPH_MAX = 0.73, Lt, "L20", Reachable, Legacy;
    /// L21: CHROMATIC SFX (`< `).
    FILTER_CHROMATIC_SFX_MAX = 0.65, Lt, "L21", Reachable, Legacy;
    /// L22: CHROMATIC CJK NOISE (`< `).
    FILTER_CHROMATIC_CJK_MAX = 0.70, Lt, "L22", Reachable, Legacy;
    /// L23: VALID CJK GLYPH ON A CLEAN BACKGROUND (`>= `).
    FILTER_CLEAN_BG_GLYPH_MIN = 0.70, Ge, "L23", Reachable, Legacy;
    /// L24: OPTICAL BORDER SLIVER (`< `).
    FILTER_BORDER_SLIVER_MAX = 0.60, Lt, "L24", Reachable, Legacy;
    /// L25: CHROMATIC PSEUDO-WORD ON ARTWORK (`< `).
    FILTER_PSEUDO_WORD_CHROMATIC_MAX = 0.65, Lt, "L25", Reachable, Legacy;
    /// L25: SHORT SINGLE-LINE PSEUDO-WORD (`< `).
    FILTER_PSEUDO_WORD_SHORT_MAX = 0.68, Lt, "L25", Reachable, Legacy;
    /// L26: MARGIN NOISE SLICE (`< `). ALWAYS TRUE ON THE LEGACY SCALE.
    FILTER_MARGIN_NOISE_MAX = 0.75, Lt, "L26", AlwaysTrue, Legacy;

    // -- src/pipeline/region_builder/dedup.rs -- //
    /// D3: LARGE LOW-CONFIDENCE SLANTED VERTICAL ARTWORK (`region confidence < `).
    SLANTED_ART_LARGE_MAX = 0.70, Lt, "D3", Reachable, Legacy;
    /// D4: SMALL SLANTED ARTWORK FRAGMENT (`region confidence < `). ALWAYS TRUE ON THE LEGACY SCALE.
    SLANTED_ART_FRAGMENT_MAX = 0.75, Lt, "D4", AlwaysTrue, Legacy;
}

// -- RELATIVE COMPARISONS (MARGINS AND RATIOS, LEGACY SCALE) -- //

/// E7: A TILED LINE REPLACES AN OVERLAPPING ONE WHEN IT SCORES THIS MUCH HIGHER.
pub const TILE_REPLACE_MARGIN: f32 = 0.05;
/// F10: A CROP REPLACES A LINE WITH THE SAME CHARACTER COUNT WHEN IT SCORES THIS MUCH HIGHER.
pub const CROP_REPLACE_MARGIN: f32 = 0.05;
/// B1: A LINE BESIDE A DOMINANT ONE IS ALSO KEPT AT THIS FRACTION OF THE DOMINANT SCORE.
pub const WEAK_LINE_KEEP_RATIO: f32 = 0.85;
/// R8: A CROP LINE BESIDE A DOMINANT ONE IS ALSO KEPT AT THIS FRACTION OF THE DOMINANT SCORE.
pub const CROP_WEAK_KEEP_RATIO: f32 = 0.85;
/// R11: A CROP MUST BEAT THE CLUSTER BY THIS MUCH TO REPLACE IT.
pub const CROP_IMPROVE_MARGIN: f32 = 0.02;
/// R11: A CROP THAT MATCHES THE CONTAINER ORIENTATION MAY SCORE THIS MUCH LOWER THAN THE CLUSTER.
pub const CROP_CONTRARY_SLACK: f32 = 0.05;

/// THE STATUS A THRESHOLD ACTUALLY HAS FOR SCORES IN [lo, hi].
pub fn computed_status(value: f32, op: Cmp, lo: f32, hi: f32) -> Status {
    let (always, never) = match op {
        Cmp::Lt => (value > hi, value <= lo),
        Cmp::Le => (value >= hi, value < lo),
        Cmp::Ge => (value <= lo, value > hi),
        Cmp::Gt => (value < lo, value >= hi),
    };
    if always {
        Status::AlwaysTrue
    } else if never {
        Status::NeverTrue
    } else {
        Status::Reachable
    }
}
