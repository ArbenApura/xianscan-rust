// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_chariot_easy_to_block_sfx` (RESOLUTION: 900 × 1387)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 SFX**: `"哒"` (SoundEffect, upper right bridge onomatopoeia)
/// - **PANEL 1 FREE TEXT / NARRATION**: `"明车易挡……"` (FreeText)
/// - **ORIENTATION INVARIANT**: FreeText narration `"明车易挡……"` is horizontally upright and must have zero rotation angle (`angle ≈ 0.0°`).
/// - **EXACT COUNTS**: Exactly 2 regions (0 dialogue bubbles, 1 sound effect, 1 free text).
#[test]
fn test_regression_page_chariot_easy_to_block_sfx() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_chariot_easy_to_block_sfx.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_chariot_easy_to_block_sfx: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Chariot SFX Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 2 REGIONS (0 DIALOGUEBUBBLES, 1 SOUNDEFFECT, 1 FREETEXT)
    crate::assert_element_counts!(res, 2, 0, 1, 1);

    // 2. PANEL 1 SFX: '哒' -> UPPER RIGHT BRIDGE ONOMATOPOEIA [X: 664, Y: 346, W: 179, H: 163]
    let sfx = res.regions.iter().find(|r| r.text.contains("哒") || r.kind == xianscan_rust::ml::schemas::RegionKind::SoundEffect);
    assert!(sfx.is_some(), "Must detect panel 1 SFX '哒'");
    let sfx = sfx.unwrap();
    crate::assert_region_bounds!(sfx, xianscan_rust::ml::schemas::RegionKind::SoundEffect, 664, 346, 179, 163, 8);
    crate::assert_region_angle!(sfx, 0.0, 1.0);

    // 3. PANEL 1 NARRATION: '明车易挡……' -> ZERO ROTATION ANGLE [X: 247, Y: 723, W: 382, H: 136]
    let narration = res.regions.iter().find(|r| r.text.contains("明车易挡"));
    assert!(narration.is_some(), "Must detect narration '明车易挡……'");
    let narration = narration.unwrap();
    crate::assert_region_bounds!(narration, xianscan_rust::ml::schemas::RegionKind::FreeText, 247, 723, 382, 136, 8);
    crate::assert_region_angle!(narration, 0.0, 1.0);
}
