// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_mecha_stellar_color_shift_border_noise` (RESOLUTION: 900 × 1373)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 DIALOGUE BUBBLE**: `"星辰色\n变换"` (DialogueBubble)
/// - **NEGATIVE GUARDS**:
///   - Border shadow stroke echo (`"日"`) overlapping bubble outer bounds must be suppressed.
///   - Watermark `"集云数据 ACloudMerge.com 腾讯动漫"` must be filtered out.
#[test]
fn test_regression_page_mecha_stellar_color_shift_border_noise() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_mecha_stellar_color_shift_border_noise") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_mecha_stellar_color_shift_border_noise: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Mecha Stellar Color Shift Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 0. EXACT ELEMENT COUNTS: EXACTLY 1 REGION (1 DIALOGUE BUBBLE, 0 SFX, 0 FREE TEXT)
    crate::assert_element_counts!(res, 1, 1, 0);

    // 1. DIALOGUE BUBBLE: '星辰色\n变换'
    let b1 = res.regions.iter().find(|r| r.text.contains("星辰色") || r.text.contains("变换"));
    assert!(b1.is_some(), "Must detect dialogue bubble '星辰色\n变换'");
    let b1 = b1.unwrap();
    assert_eq!(b1.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 92, 255, 145, 130, 25);
    crate::assert_bubble_bounds!(b1, 44, 122, 236, 378, 25);
    crate::assert_region_angle!(b1, 0.0, 5.0);

    // 2. NEGATIVE GUARDS: No ghost "日" border stroke echo
    assert!(!res.regions.iter().any(|r| r.text.trim() == "日"), "Must suppress border stroke echo '日'");
    assert!(!res.regions.iter().any(|r| r.text.contains("集云") || r.text.contains("腾讯") || r.text.contains("ACloudMerge")), "Must suppress aggregator watermark");
}
