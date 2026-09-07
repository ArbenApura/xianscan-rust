// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_fairy_cleared_demonic_beasts_squelch` (RESOLUTION: 900 × 1255)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 2 BURST SHOUT BUBBLE**: `[677, 538, 192, 132]` (`"噗嗤"`).
///   A wide burst shout bubble with onomatopoeia dialogue.
///   Previously, the asymmetry guard treated the horizontal aspect ratio (1.45) with offset margins as
///   an uncentered candidate, locking typeset_box to x = 706 and leaving the right half empty.
///   With the guard refined, typeset_box centers horizontally inside the burst bubble cavity (cx ≈ 773).
/// - **EXACT COUNTS**: 3 REGIONS (3 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT).
#[test]
fn test_regression_page_fairy_cleared_demonic_beasts_squelch() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_fairy_cleared_demonic_beasts_squelch/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_fairy_cleared_demonic_beasts_squelch, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));

    // 1. EXACT ELEMENT COUNTS
    crate::assert_element_counts!(res, 3, 3, 0);

    // 2. PANEL 2 BURST BUBBLE: "噗嗤"
    let r0 = res.regions.iter().find(|r| r.text.contains("噗嗤")).expect("Must detect r0");
    assert_eq!(r0.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    let bb0 = r0.bubble_box.as_ref().expect("bubble box must exist");
    let tb0 = r0.typeset_box.as_ref().expect("typeset box must exist");

    // Typeset box must center horizontally inside the bubble cavity
    let tb_cx = tb0.x + tb0.w / 2;
    let bb_cx = bb0.x + bb0.w / 2;
    assert!((tb_cx - bb_cx).abs() <= 3, "Typeset center ({}) must align with bubble center ({})", tb_cx, bb_cx);

    // 3. PANEL 3 FAIRY DIALOGUE: "由此向东的妖兽已被我清除，你们速速离去吧。"
    let r1 = res.regions.iter().find(|r| r.text.contains("速速离去")).expect("Must detect r1");
    assert_eq!(r1.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 4. PANEL 3 RESCUED CULTIVATORS: "多谢仙子救\n命之恩。"
    let r2 = res.regions.iter().find(|r| r.text.contains("仙子")).expect("Must detect r2");
    assert_eq!(r2.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
}
