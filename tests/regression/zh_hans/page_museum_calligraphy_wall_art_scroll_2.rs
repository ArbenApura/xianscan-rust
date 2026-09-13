// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_museum_calligraphy_wall_art_scroll_2` (RESOLUTION: 900 × 1839)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **BACKGROUND CALLIGRAPHY SCROLL SUPPRESSION (LARGE ARTWORK)**:
///   A LARGE FRAMED CALLIGRAPHY SCROLL OCCUPIES THE LOWER HALF OF THE PAGE AS BACKGROUND ART.
///   THREE OVERLAPPING FREE-TEXT DETECTIONS FROM THE SCROLL MUST ALL BE SUPPRESSED.
/// - **EXACT COUNTS**: 2 DIALOGUE BUBBLES ONLY. NO FREE TEXT FROM THE SCROLL.
#[test]
fn test_regression_page_museum_calligraphy_wall_art_scroll_2() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_museum_calligraphy_wall_art_scroll_2/page.webp") {
        Some(i) => i,
        None => { eprintln!("[INFO] Skipping: fixture not found"); return; }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("Detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, vertical={}, conf={:.3}, text='{}'", i, r.kind, r.angle, r.vertical, r.confidence, r.text.replace('\n', "\\n"));
    }

    // 1. ONLY DIALOGUE BUBBLES EXPECTED
    crate::assert_element_counts!(res, 2, 2, 0, 0);

    // 2. STORY TEXT MUST BE DETECTED
    assert!(res.regions.iter().any(|r| r.text.contains("生个") || r.text.contains("博物馆")), "Must detect main dialogue bubble");
    assert!(res.regions.iter().any(|r| r.text.contains("为了它") || r.text.contains("馆内")), "Must detect second dialogue bubble");

    // 3. CALLIGRAPHY SCROLL DETECTIONS MUST BE SUPPRESSED
    assert!(
        !res.regions.iter().any(|r| r.kind == RegionKind::FreeText && r.vertical && r.angle.abs() >= 4.0),
        "Vertical slanted calligraphy scroll regions must not be detected"
    );
}
