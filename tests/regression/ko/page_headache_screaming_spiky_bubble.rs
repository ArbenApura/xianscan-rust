// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_headache_screaming_spiky_bubble` (RESOLUTION: 690 × 1679)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **SPIKY DIALOGUE BUBBLE**: Full vertical screaming dialogue (`"으\n아\n아\n아\n악\n!!"` or `"으아아악!!"`).
/// - **NO TRUNCATION TO EXCLAMATION**: Must not truncate the bubble content down to just `"!!"`.
/// - **SFX SUPPRESSION**: Giant background calligraphy sound effects (`"쩌"`, `"잉"`) must not be parsed as dialogue regions.
#[test]
fn test_regression_page_headache_screaming_spiky_bubble() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_headache_screaming_spiky_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_headache_screaming_spiky_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Headache Screaming Spiky Bubble Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 1 REGION (1 DIALOGUE BUBBLE, 0 SFX, 0 FREETEXT)
    crate::assert_element_counts!(res, 1, 1, 0);

    // 2. SPIKY DIALOGUE BUBBLE: [X: 91, Y: 763, W: 194, H: 550]
    let bubble = &res.regions[0];
    assert_eq!(bubble.kind, RegionKind::DialogueBubble);
    assert!(
        bubble.text.contains('아') || bubble.text.contains("알") || bubble.text.contains("!!"),
        "Must contain scream text, got: '{}'",
        bubble.text.replace('\n', "\\n")
    );
    assert!(
        bubble.text.len() >= 3,
        "Bubble text must not be truncated to punctuation only, got: '{}'",
        bubble.text.replace('\n', "\\n")
    );
    crate::assert_region_bounds!(bubble, RegionKind::DialogueBubble, 91, 763, 194, 550, 25);
    crate::assert_bubble_bounds!(bubble, 57, 624, 280, 761, 25);
}
