// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_lin_wentian_giant_memorial_stele` (RESOLUTION: 900 × 1888)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **NO DIALOGUE BUBBLES**:
///   Depicts an outdoor stone memorial stele with no characters speaking.
///   Must detect 0 dialogue bubbles.
/// - **SCENERY PSEUDO-TEXT NOISE SUPPRESSION**:
///   Scrambled texture noise containing foreign Japanese kana and latin fragments
///   (`义一年4 VIVy之之3ミう3`) must NOT be detected as text.
#[test]
fn test_regression_page_lin_wentian_giant_memorial_stele() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_lin_wentian_giant_memorial_stele/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_lin_wentian_giant_memorial_stele, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));

    println!("Detected {} regions on page_lin_wentian_giant_memorial_stele:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, box={:?}, text='{}'",
            i, r.kind, r.box_, r.text.replace('\n', " ")
        );
    }

    // ZERO DIALOGUE BUBBLES MUST BE DETECTED
    let bubbles: Vec<_> = res.regions.iter().filter(|r| r.kind == RegionKind::DialogueBubble).collect();
    assert_eq!(bubbles.len(), 0, "Expected 0 dialogue bubbles on memorial stele page");

    // SCENERY PSEUDO-TEXT NOISE MUST BE SUPPRESSED
    assert!(!res.regions.iter().any(|r| r.text.contains("VIVy") || r.text.contains("ミ") || r.text.contains("う")),
        "Scenery pseudo-text noise with foreign kana must be suppressed");
}
