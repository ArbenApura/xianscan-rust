// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_calligraphy_painting_background` (RESOLUTION: 900 × 1312)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **BACKGROUND CALLIGRAPHY PAINTING SUPPRESSION**:
///   A SLANTED CALLIGRAPHY PAINTING PANEL IS VISIBLE IN THE BACKGROUND. TWO TINY FREE-TEXT
///   FRAGMENTS FROM THE CALLIGRAPHY (`家诗\n膳` AND `短好感意`) MUST NOT BE DETECTED.
/// - **EXACT COUNTS**: 1 DIALOGUE BUBBLE ONLY. 0 FREE TEXT FROM THE PAINTING.
#[test]
fn test_regression_page_calligraphy_painting_background() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_calligraphy_painting_background/page.webp") {
        Some(i) => i,
        None => { eprintln!("[INFO] Skipping: fixture not found"); return; }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("Detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, vertical={}, conf={:.3}, text='{}'", i, r.kind, r.angle, r.vertical, r.confidence, r.text.replace('\n', "\\n"));
    }

    // 1. ONLY THE MAIN DIALOGUE BUBBLE SHOULD BE DETECTED
    crate::assert_element_counts!(res, 1, 1, 0, 0);

    // 2. DIALOGUE CONTENT MUST BE PRESENT
    assert!(res.regions.iter().any(|r| r.text.contains("斜阳") || r.text.contains("秋风")), "Must detect the poem dialogue bubble");

    // 3. BACKGROUND CALLIGRAPHY FRAGMENTS MUST NOT APPEAR
    assert!(
        !res.regions.iter().any(|r| r.kind == RegionKind::FreeText && r.vertical && r.angle.abs() >= 4.0),
        "Background calligraphy painting fragments must not be detected"
    );
}
