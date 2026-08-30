// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_yu_family_spear_technique_slash` (RESOLUTION: 690 × 1943)
///
/// ## CONTEXT & PURPOSE:
/// - Source: `Ch_01_P088_source.webp`
/// - Scene: Action panel with background dynamic diagonal slash and stylized calligraphy technique name (`"유가창법"`).
/// - Invariant: Stylized calligraphy lettered one syllable per OCR line (`유\n가\n창\n법` pattern) is artwork-integrated
///   display calligraphy — it must be suppressed so retypesetting never destroys the artwork. Real narration
///   (multi-glyph lines) is never affected.
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 0 REGIONS (CALLIGRAPHY PRESERVED AS ARTWORK)
    crate::assert_element_counts!(res, 0, 0, 0, 0);

    // 2. NEGATIVE GUARD: NO GARBLED TECHNIQUE CALLIGRAPHY EXTRACTION
    assert!(
        !res.regions.iter().any(|r| r.text.contains("법") || r.text.contains("게") || r.text.contains("장")),
        "Stylized technique calligraphy must not leak as FreeText dialogue"
    );
}
