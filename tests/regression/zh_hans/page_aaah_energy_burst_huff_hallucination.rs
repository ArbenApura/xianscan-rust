// -- INTERNAL IMPORTS -- //
use crate::common::{get_or_analyze_fixture_with_lang, get_or_analyze_fixture_with_opts};
use xianscan_rust::ml::schemas::AnalyzeOptions;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_aaah_energy_burst_huff_hallucination` (RESOLUTION: 900 × 1260)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **DRAMATIC ACTION PAGE**: A character screaming with energy-burst lightning glyphs radiating
///   outward from the scene. The left and right edges contain large vertical 啊×7！ scream SFX.
/// - **NOISE SUPPRESSION (OCR ARTIFACT GLYPHS)**: The decorative lightning-style energy-burst
///   glyphs at the top-left of the artwork produced a spurious `"1呼\n呼t.1"` hallucination
///   (OCR confidence 0.662). These stylized artistic glyphs are NOT readable SFX text.
///   The pipeline MUST NOT emit a region for this noise.
/// - **EXACT COUNTS**: Exactly 2 regions (0 dialogue bubbles, 2 sound effects, 0 free text).
///   The two legitimate SFX are the flanking `啊啊啊啊啊啊啊！` vertical screams.
/// - **NEGATIVE GUARD**: Must NOT hallucinate `呼` (hū / "huff/breathe") from decorative
///   energy-burst artwork lightning glyphs with mixed digit/Latin OCR artifacts.
#[test]
fn test_regression_page_aaah_energy_burst_huff_hallucination() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_aaah_energy_burst_huff_hallucination/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_aaah_energy_burst_huff_hallucination: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "ZH-Hans Energy Burst Huff Hallucination page detected {} regions:",
        res.regions.len()
    );
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.4}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: 2 REGIONS (0 DIALOGUE BUBBLES, 2 SOUND EFFECTS, 0 FREE TEXT)
    // The only legitimate content is the flanking 啊x7! vertical SFX on left and right edges.
    crate::assert_element_counts!(res, 2, 0, 2, 0);

    // 2. LEFT SFX: 啊啊啊啊啊啊啊！ (left edge, tall vertical, x ≈ 0, y ≈ 351)
    let sfx_left = res.regions.iter().find(|r| {
        r.text.contains("啊") && r.box_.x <= 30
    });
    assert!(sfx_left.is_some(), "Must detect left-edge 啊啊啊啊啊啊啊！ SFX");
    let sfx_left = sfx_left.unwrap();
    crate::assert_region_bounds!(
        sfx_left,
        xianscan_rust::ml::schemas::RegionKind::SoundEffect,
        0, 351, 147, 416,
        12
    );

    // 3. RIGHT SFX: 啊啊啊啊啊啊啊！ (right edge, tall vertical, x ≈ 754, y ≈ 254)
    let sfx_right = res.regions.iter().find(|r| {
        r.text.contains("啊") && r.box_.x >= 700
    });
    assert!(sfx_right.is_some(), "Must detect right-edge 啊啊啊啊啊啊啊！ SFX");
    let sfx_right = sfx_right.unwrap();
    crate::assert_region_bounds!(
        sfx_right,
        xianscan_rust::ml::schemas::RegionKind::SoundEffect,
        754, 254, 146, 434,
        12
    );

    // 4. NEGATIVE GUARD: Must NOT hallucinate 呼 (breath/huff) from energy-burst artwork glyphs
    assert!(
        !res.regions.iter().any(|r| r.text.contains("呼")),
        "Must NOT hallucinate '呼' (huff) from decorative energy-burst lightning artwork glyphs"
    );

    // 5. NEGATIVE GUARD: Must NOT produce any spurious region in the top-left energy-burst zone
    //    (x: 23-265, y: 54-461) that is not one of the two legitimate SFX screams
    assert!(
        !res.regions.iter().any(|r| {
            r.box_.x >= 23 && r.box_.x <= 265
                && r.box_.y >= 54 && r.box_.y <= 200
                && !r.text.contains("啊")
        }),
        "Must NOT produce a spurious region in the top-left energy-burst artwork zone"
    );
}

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_aaah_energy_burst_huff_hallucination` (SFX DISABLED)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **SFX SUPPRESSION**: When `enable_sfx = false`, both flanking `啊啊啊啊啊啊啊！` vertical
///   screams must be fully suppressed (0 sound effects).
/// - **NO FREE-TEXT FALLBACK**: The suppressed 啊×7！ SFX must NOT be reclassified into
///   `FreeText` regions. The page has no dialogue bubbles, so 0 regions total is the only
///   correct outcome.
/// - **NEGATIVE GUARD**: Must NOT hallucinate `呼` from artwork glyphs regardless of SFX setting.
/// - **EXACT COUNTS**: Exactly 0 regions (0 dialogue bubbles, 0 sound effects, 0 free text).
#[test]
fn test_regression_page_aaah_energy_burst_huff_hallucination_sfx_disabled() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_aaah_energy_burst_huff_hallucination/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_aaah_energy_burst_huff_hallucination_sfx_disabled: fixture not found");
            return;
        }
    };

    let opts_sfx_off = AnalyzeOptions {
        source_lang: Some("zh-Hans".to_string()),
        target_lang: Some("en".to_string()),
        enable_sfx: Some(false),
        enable_watermark_inpaint: Some(false),
        inpaint_padding_pct: Some(0.06),
        typeset_padding_pct: Some(0.12),
        ..Default::default()
    };
    let res = get_or_analyze_fixture_with_opts(&img, &opts_sfx_off);
    println!(
        "ZH-Hans Energy Burst (SFX OFF) detected {} regions:",
        res.regions.len()
    );
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  [SFX OFF] Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.4}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: 0 REGIONS - PAGE IS PURE ACTION ARTWORK WITH NO DIALOGUE
    //    BOTH 啊x7！ SFX MUST BE SUPPRESSED; NEITHER MAY FALL BACK TO FREE TEXT
    crate::assert_element_counts!(res, 0, 0, 0, 0);

    // 2. NEGATIVE GUARD: 啊啊啊啊啊啊啊！ must NOT survive as free text when SFX is off
    assert!(
        !res.regions.iter().any(|r| r.text.contains("啊")),
        "啊啊啊啊啊啊啊！ SFX must be fully suppressed when enable_sfx=false and must NOT become free text"
    );

    // 3. NEGATIVE GUARD: Must NOT hallucinate 呼 regardless of SFX setting
    assert!(
        !res.regions.iter().any(|r| r.text.contains("呼")),
        "Must NOT hallucinate '呼' from decorative energy-burst artwork glyphs even with SFX disabled"
    );
}

