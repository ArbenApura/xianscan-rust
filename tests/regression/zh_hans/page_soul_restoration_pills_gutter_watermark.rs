// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_soul_restoration_pills_gutter_watermark` (RESOLUTION: 900 × 1645)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 DIALOGUE BUBBLE**: `"糟了！\n续魂丹吃\n完了么？！"` (DialogueBubble)
/// - **NEGATIVE GUARDS**:
///   - Aggregator watermark `"云数据"` / `"集云数据"` in the inter-panel gutter must be suppressed.
///   - Sound effects `"掏空"` and `"嗡"` on background artwork must not be extracted as free text.
#[test]
fn test_regression_page_soul_restoration_pills_gutter_watermark() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_soul_restoration_pills_gutter_watermark") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_soul_restoration_pills_gutter_watermark: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Soul Restoration Pills Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 0. EXACT ELEMENT COUNTS: EXACTLY 1 REGION (1 DIALOGUE BUBBLE, 0 SFX, 0 FREE TEXT)
    crate::assert_element_counts!(res, 1, 1, 0);

    // 1. DIALOGUE BUBBLE: '糟了！\n续魂丹吃\n完了么？！'
    let b1 = res.regions.iter().find(|r| r.text.contains("糟了") || r.text.contains("续魂丹") || r.text.contains("完了么"));
    assert!(b1.is_some(), "Must detect dialogue bubble '糟了！续魂丹吃完了么？！'");
    let b1 = b1.unwrap();
    assert_eq!(b1.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 102, 359, 144, 120, 25);
    crate::assert_bubble_bounds!(b1, 68, 225, 207, 380, 25);
    crate::assert_region_angle!(b1, 0.0, 5.0);

    // 2. NEGATIVE GUARDS
    assert!(!res.regions.iter().any(|r| r.text.contains("数据") || r.text.contains("集云") || r.text.contains("ACloud")), "Must suppress aggregator watermark '云数据'");
}
