// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: page_zhang_jiuya_immortals_gods_hmph_bubble (RESOLUTION: 900 × 1441)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 UPPER-RIGHT BUBBLE**:
///   Circular speech bubble with single-character exclamation "哼！" (DialogueBubble).
///   Must NOT be rejected as isolated single-glyph noise when enclosed in a speech bubble.
/// - **PANEL 3 LOWER DIALOGUE BUBBLE**:
///   "我等是仙人神灵，\n怎容你们这些蝼蚁\n质疑？" (DialogueBubble, 3 lines).
/// - **NEGATIVE GUARD**:
///   Large artwork SFX "嘭" drawn on character action art must not be rescued as free text.
/// - **EXACT COUNTS**: Exactly 2 regions (2 dialogue bubbles, 0 sound effects, 0 free text).
#[test]
fn test_regression_page_zhang_jiuya_immortals_gods_hmph_bubble() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_zhang_jiuya_immortals_gods_hmph_bubble/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_zhang_jiuya_immortals_gods_hmph_bubble: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Immortals and Gods Hmph Bubble Page detected {} regions:",
        res.regions.len()
    );
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}°, box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 2 REGIONS (2 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT)
    crate::assert_element_counts!(res, 2, 2, 0, 0);

    // 2. PANEL 1 UPPER-RIGHT BUBBLE: '哼！'
    let b1 = res.regions.iter().find(|r| {
        r.box_.y <= 300
            && r.box_.x >= 650
            && (r.text.contains("哼") || r.text.contains('!'))
    });
    assert!(
        b1.is_some(),
        "Must detect panel 1 upper-right circular bubble '哼！'"
    );
    let b1 = b1.unwrap();
    assert_eq!(b1.kind, RegionKind::DialogueBubble);

    // 3. PANEL 3 LOWER DIALOGUE BUBBLE: '我等是仙人神灵...'
    let b2 = res.regions.iter().find(|r| r.text.contains("仙人神灵") || r.text.contains("蝼蚁"));
    assert!(
        b2.is_some(),
        "Must detect panel 3 dialogue bubble '我等是仙人神灵...'"
    );
    let b2 = b2.unwrap();
    assert_eq!(b2.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b2, RegionKind::DialogueBubble, 582, 944, 159, 92, 20);
}
