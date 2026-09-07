// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # CHINESE REAL-PAGE REGRESSION: page_dragon_neck_slash_scream_bubble (RESOLUTION: 900 × 1355)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 2 BLACK CLOUD SCREAM BUBBLE**:
///   "啊！！！" (DialogueBubble).
///   Must not be dropped despite white text on black background / dark panel artwork.
/// - **EXACT COUNTS**: Exactly 1 dialogue bubble, 0 SFX, 0 free text.
#[test]
fn test_regression_page_dragon_neck_slash_scream_bubble() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_dragon_neck_slash_scream_bubble/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_dragon_neck_slash_scream_bubble: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Dragon Neck Slash Scream Bubble Page detected {} regions:",
        res.regions.len()
    );
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}°, box={:?}, bubble_box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.bubble_box,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: 1 DIALOGUE BUBBLE, 0 SFX, 0 FREE TEXT
    crate::assert_element_counts!(res, 1, 1, 0, 0);

    // 2. PANEL 2 BLACK CLOUD SCREAM BUBBLE: "啊！！！"
    let bubble = &res.regions[0];
    assert_eq!(bubble.kind, RegionKind::DialogueBubble);
    assert!(
        bubble.text.contains('啊'),
        "Bubble text must contain '啊', got '{}'",
        bubble.text
    );
    crate::assert_region_bounds!(bubble, RegionKind::DialogueBubble, 303, 567, 82, 36, 15);
    crate::assert_bubble_bounds!(bubble, 282, 537, 120, 90, 20);
}
