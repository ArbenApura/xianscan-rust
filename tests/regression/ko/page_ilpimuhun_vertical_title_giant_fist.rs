// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_ilpimuhun_vertical_title_giant_fist` (RESOLUTION: 640 × 1750)
///
/// ## CONTEXT & PURPOSE:
/// - Scene: White upper band with large stylized vertical title calligraphy `"일피무흔"` (black glyphs,
///   white outline, stacked square syllables) transitioning into an action panel of a bald giant taking a
///   white-haired fighter's fist.
/// - Invariant: Stacked one-syllable-per-line display calligraphy (`일\n파\n무\n흔` pattern) is
///   artwork-integrated lettering — it must be suppressed so retypesetting never destroys the artwork.
///   The giant-fist action panel must spawn zero hallucinated regions.
/// - EXPECTED: Exactly 0 regions (0 bubbles, 0 SFX, 0 free text).
#[test]
fn test_regression_page_ilpimuhun_vertical_title_giant_fist() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_ilpimuhun_vertical_title_giant_fist/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_ilpimuhun_vertical_title_giant_fist: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("=== Korean Ilpimuhun Vertical Title Giant Fist Page ===");
    println!("Detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  [Region {}] id={}, kind={:?}, text=\"{}\", conf={:.3}, angle={:.2}, vertical={}, box={:?}, bubble_box={:?}, typeset_box={:?}, inpaint_box={:?}",
            i,
            r.id,
            r.kind,
            r.text.replace('\n', "\\n"),
            r.confidence,
            r.angle,
            r.vertical,
            r.box_,
            r.bubble_box,
            r.typeset_box,
            r.inpaint_box
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 0 REGIONS (TITLE CALLIGRAPHY PRESERVED AS ARTWORK)
    crate::assert_element_counts!(res, 0, 0, 0, 0);

    // 2. NEGATIVE GUARDS: NO TITLE CALLIGRAPHY OR GIANT/FIGHTER ARTWORK HALLUCINATIONS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("일") || r.text.contains("무") || r.text.contains("파") || r.text.contains("피")),
        "Stacked calligraphy title must not leak as FreeText dialogue"
    );
    for r in &res.regions {
        assert!(
            r.box_.y + r.box_.h <= 1150,
            "No regions may dilate into the action panel artwork, got box={:?} for '{}'",
            r.box_,
            r.text.replace('\n', "\\n")
        );
    }
}
