// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_yu_family_spear_technique_slash` (RESOLUTION: 690 × 1943)
///
/// ## CONTEXT & PURPOSE:
/// - Source: `Ch_01_P088_source.webp`
/// - Scene: Action panel with background dynamic diagonal slash and stylized calligraphy technique name (`"유가창법"`).
/// - Invariant: Background stylized SFX / technique calligraphy cut by dynamic brushstrokes must not be extracted as FreeText dialogue.
/// - EXPECTED: Exactly 0 regions (0 bubbles, 0 SFX, 0 free text).
#[test]
fn test_regression_page_yu_family_spear_technique_slash() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_yu_family_spear_technique_slash/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_yu_family_spear_technique_slash: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("=== Korean Yu Family Spear Technique Page ===");
    println!("Detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  [Region {}] id={}, kind={:?}, text=\"{}\", conf={:.3}, angle={:.2}, box={:?}, bubble_box={:?}, typeset_box={:?}, inpaint_box={:?}",
            i,
            r.id,
            r.kind,
            r.text.replace('\n', "\\n"),
            r.confidence,
            r.angle,
            r.box_,
            r.bubble_box,
            r.typeset_box,
            r.inpaint_box
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 1 FREE TEXT REGION
    crate::assert_element_counts!(res, 1, 0, 0, 1);

    // 2. VERTICAL TECHNIQUE CALLIGRAPHY: CAPTURES FREE TEXT
    let technique = &res.regions[0];
    assert_eq!(
        technique.kind,
        xianscan_rust::ml::schemas::RegionKind::FreeText,
        "Technique region must be classified as FreeText"
    );
    crate::assert_region_bounds!(
        technique,
        xianscan_rust::ml::schemas::RegionKind::FreeText,
        11,
        1150,
        203,
        728,
        15
    );
    crate::assert_region_angle!(technique, 0.0, 2.0);
    assert!(
        technique.text.contains("법") || technique.text.contains("게") || technique.text.contains("장"),
        "Technique region must capture syllables, got: '{}'",
        technique.text
    );
}