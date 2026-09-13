// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_museum_calligraphy_wall_art_scroll` (RESOLUTION: 900 × 1653)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **BACKGROUND CALLIGRAPHY ART SUPPRESSION**:
///   TWO CALLIGRAPHY SCROLLS HANGING ON A MUSEUM/GALLERY WALL ARE BACKGROUND PROPS.
///   THEY MUST NOT BE DETECTED AS FREE-TEXT STORY REGIONS.
/// - **EXACT COUNTS**: 2 DIALOGUE BUBBLES ONLY. 0 FREE TEXT REGIONS FROM THE CALLIGRAPHY ART.
#[test]
fn test_regression_page_museum_calligraphy_wall_art_scroll() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_museum_calligraphy_wall_art_scroll/page.webp") {
        Some(i) => i,
        None => { eprintln!("[INFO] Skipping: fixture not found"); return; }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("Detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, vertical={}, conf={:.3}, text='{}'", i, r.kind, r.angle, r.vertical, r.confidence, r.text.replace('\n', "\\n"));
    }

    // 1. DIALOGUE BUBBLES MUST BE DETECTED
    crate::assert_element_counts!(res, 2, 2, 0, 0);

    // 2. STORY DIALOGUE MUST BE PRESENT
    assert!(res.regions.iter().any(|r| r.text.contains("脆弱不堪")), "Must detect '却是那么\\n脆弱不堪。' bubble");
    assert!(res.regions.iter().any(|r| r.text.contains("放心吧") || r.text.contains("结婚后")), "Must detect '放心吧语萱' bubble");

    // 3. BACKGROUND CALLIGRAPHY ART MUST NOT BE DETECTED
    assert!(
        !res.regions.iter().any(|r| r.kind == RegionKind::FreeText && r.vertical && r.angle.abs() >= 4.0),
        "Vertical slanted calligraphy wall art must not be detected as story free-text"
    );
}
