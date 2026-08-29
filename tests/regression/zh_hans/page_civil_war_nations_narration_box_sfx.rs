// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_civil_war_nations_narration_box_sfx` (RESOLUTION: 900 × 1959)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 RECTANGULAR NARRATION BOX**: `"各国在内战的消耗中\n最终被凶兽潮逐一消灭…"` (FreeText / Narration)
/// - **NEGATIVE GUARDS**:
///   - Onomatopoeia / SFX character (`"錄"` / `"簌"`) in mid artwork must be suppressed.
///   - Background explosion and sword slash speedlines must not be detected as text.
#[test]
fn test_regression_page_civil_war_nations_narration_box_sfx() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_civil_war_nations_narration_box_sfx") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_civil_war_nations_narration_box_sfx: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Civil War Nations Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 0. EXACT ELEMENT COUNTS: EXACTLY 1 REGION (0 DIALOGUE BUBBLES, 0 SFX, 1 FREE TEXT / NARRATION)
    crate::assert_element_counts!(res, 1, 0, 1);

    // 1. RECTANGULAR NARRATION BOX: '各国在内战的消耗中\n最终被凶兽潮逐一消灭…'
    let b1 = res.regions.iter().find(|r| r.text.contains("各国在内战") || r.text.contains("凶兽潮"));
    assert!(b1.is_some(), "Must detect narration box '各国在内战的消耗中...'");
    let b1 = b1.unwrap();
    assert_eq!(b1.kind, xianscan_rust::ml::schemas::RegionKind::FreeText);
    crate::assert_region_bounds!(b1, xianscan_rust::ml::schemas::RegionKind::FreeText, 499, 87, 303, 64, 25);
    crate::assert_region_angle!(b1, 0.0, 5.0);

    // 2. NEGATIVE GUARDS
    assert!(!res.regions.iter().any(|r| r.text.trim() == "錄" || r.text.trim() == "簌"), "Must suppress isolated SFX '錄'");
}
