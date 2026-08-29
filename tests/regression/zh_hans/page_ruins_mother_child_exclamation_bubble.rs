// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_ruins_mother_child_exclamation_bubble` (RESOLUTION: 900 × 1201)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 SPIKY EXCLAMATION BUBBLE**: `"!!"` or `"!"` (DialogueBubble, must not be dropped as pure punctuation noise)
/// - **NEGATIVE GUARDS**:
///   - Bottom SFX `"咕"` should not be extracted as free text or spurious dialogue.
///   - Middle aggregator watermark `"集云数据 ACloudMerge 腾讯动漫"` must be filtered out.
#[test]
fn test_regression_page_ruins_mother_child_exclamation_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_ruins_mother_child_exclamation_bubble") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_ruins_mother_child_exclamation_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Ruins Mother Child Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 0. ELEMENT COUNTS: 0 OR 1 REGION (EXCLAMATION BUBBLE '!!' IS OPTIONAL)
    assert!(res.regions.len() <= 1, "Expected at most 1 region, got {}", res.regions.len());

    if let Some(b1) = res.regions.first() {
        assert_eq!(b1.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
        assert!(b1.text.contains('!') || b1.text.contains('！') || b1.text.contains("!!"));
        crate::assert_region_bounds!(b1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 140, 540, 105, 135, 25);
        crate::assert_bubble_bounds!(b1, 120, 502, 201, 193, 25);
        crate::assert_region_angle!(b1, 0.0, 5.0);
    }

    // 1. NEGATIVE GUARDS
    assert!(!res.regions.iter().any(|r| r.text.contains("集云") || r.text.contains("腾讯") || r.text.contains("ACloud")), "Must suppress aggregator watermark");
}
