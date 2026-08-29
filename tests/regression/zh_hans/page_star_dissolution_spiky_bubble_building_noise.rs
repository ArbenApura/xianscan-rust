// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_star_dissolution_spiky_bubble_building_noise` (RESOLUTION: 900 × 1824)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 SPIKY DIALOGUE BUBBLE**: `"星解！"` (DialogueBubble)
/// - **NEGATIVE GUARDS**:
///   - Ghost building / smoke texture sliver (`"K\n2"`) overlapping bubble outer bounds must be suppressed.
///   - Watermark `"集云数据 ACloudMerge 腾讯动漫"` must be filtered out.
#[test]
fn test_regression_page_star_dissolution_spiky_bubble_building_noise() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_star_dissolution_spiky_bubble_building_noise") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_star_dissolution_spiky_bubble_building_noise: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Star Dissolution Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 0. EXACT ELEMENT COUNTS: EXACTLY 1 REGION (1 DIALOGUE BUBBLE, 0 SFX, 0 FREE TEXT)
    crate::assert_element_counts!(res, 1, 1, 0);

    // 1. SPIKY DIALOGUE BUBBLE: '星解！'
    let b1 = res.regions.iter().find(|r| r.text.contains("星解"));
    assert!(b1.is_some(), "Must detect spiky dialogue bubble '星解！'");
    let b1 = b1.unwrap();
    assert_eq!(b1.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 223, 803, 124, 58, 25);
    crate::assert_bubble_bounds!(b1, 151, 655, 254, 346, 25);
    crate::assert_region_angle!(b1, 0.0, 5.0);

    // 2. NEGATIVE GUARDS: No ghost "K 2" building sliver
    assert!(!res.regions.iter().any(|r| r.text.contains('K') || r.text.contains('2')), "Must suppress building texture noise 'K 2'");
    assert!(!res.regions.iter().any(|r| r.text.contains("集云") || r.text.contains("腾讯")), "Must suppress aggregator watermark");
}
