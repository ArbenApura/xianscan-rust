// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_one_chance_fuzzy_bubble` (RESOLUTION: 690 × 1740)
///
/// ## CONTEXT & LOGS:
/// - Source: `Ch_01_P082_source.webp`
/// - Speech bubble contains Korean text: `"기회는 오직\n한번 뿐!!"`
/// - Unconstrained test to inspect exact model detections, raw boxes, and pipeline behavior.
#[test]
fn test_regression_page_one_chance_fuzzy_bubble() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_one_chance_fuzzy_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_one_chance_fuzzy_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("=== Korean One Chance Fuzzy Bubble Page ===");
    // 1. EXACT ELEMENT COUNTS: EXACTLY 1 DIALOGUE BUBBLE (0 SFX, 0 FREE TEXT)
    crate::assert_element_counts!(res, 1, 1, 0, 0);

    // 2. DIALOGUE BUBBLE BOUNDS: TIGHT TEXT ENVELOPE [X: 95, Y: 588, W: 404, H: 236] INSIDE BUBBLE [37, 447, 523, 472]
    let bubble = &res.regions[0];
    assert_eq!(
        bubble.kind,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        "Region must be DialogueBubble"
    );
    assert!(
        bubble.text.contains("기회는 오직") && bubble.text.contains("한번 뿐"),
        "Must contain Korean dialogue text, got: '{}'",
        bubble.text
    );
    crate::assert_region_bounds!(
        bubble,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        95,
        588,
        404,
        236,
        15
    );
    crate::assert_bubble_bounds!(bubble, 37, 447, 523, 472, 15);
    crate::assert_region_angle!(bubble, 0.0, 2.0);

    // 3. TYPESET BOX BOUNDS: MUST NOT OVER-EXPAND INTO EMPTY WHITESPACE (H <= 250, BOT <= 840)
    if let Some(tb) = &bubble.typeset_box {
        assert!(
            tb.h <= 250,
            "Typeset box height must be compact (<= 250px), got: {}",
            tb.h
        );
        assert!(
            tb.y + tb.h <= 840,
            "Typeset box bottom must not bleed down to bubble safe floor (<= 840px), got: {}",
            tb.y + tb.h
        );
    }
}