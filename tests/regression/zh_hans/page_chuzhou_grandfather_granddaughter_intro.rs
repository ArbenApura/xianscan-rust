// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # CHINESE REAL-PAGE REGRESSION: `page_chuzhou_grandfather_granddaughter_intro` (RESOLUTION: 827 x 1292)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **VALID DIALOGUE & NARRATION**: 6 real regions (2 FreeText narration boxes, 4 DialogueBubbles).
/// - **HALLUCINATED CLOTHING SEAM / ZIPPER CHARACTER SUPPRESSION**: Stray single character (`"阿"`) on boy's jacket collar must be suppressed.
/// - **STRICT REGION COUNT**: Exactly 6 regions (4 DialogueBubble, 0 SoundEffect, 2 FreeText).
#[test]
fn test_regression_page_chuzhou_grandfather_granddaughter_intro() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_chuzhou_grandfather_granddaughter_intro/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_chuzhou_grandfather_granddaughter_intro: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh"));
    println!("Chinese Grandfather Granddaughter Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 6 REGIONS (4 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 2 FREETEXT)
    crate::assert_element_counts!(res, 6, 4, 0, 2);

    // 2. NEGATIVE GUARD: ZERO HALLUCINATED "阿" ON CLOTHING SEAMS
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "阿"),
        "Hallucinated single character '阿' on clothing collar/zipper must be suppressed"
    );

    // 3. VERIFY BUBBLE CAVITY CLEANING & BOUNDARY PRESERVATION
    crate::assert_bubble_cleaned!(&img, &res);
}
