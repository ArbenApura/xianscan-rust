// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_suddenly_reality_check_bottom_narration` (RESOLUTION: 690 x 1923)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP DIALOGUE BUBBLE**: `"반가워요.\n이하린이에요."`
/// - **BOTTOM LARGE NARRATION / FREE TEXT**: `"갑자기 현타 오네."`
/// - **STRICT REGION COUNT**: Exactly 2 regions (1 DialogueBubble, 0 SoundEffect, 1 FreeText).
#[test]
fn test_regression_page_suddenly_reality_check_bottom_narration() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_suddenly_reality_check_bottom_narration/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_suddenly_reality_check_bottom_narration: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Suddenly Reality Check Bottom Narration Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 2 REGIONS (1 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 1 FREETEXT)
    crate::assert_element_counts!(res, 2, 1, 0, 1);

    // 2. TOP DIALOGUE BUBBLE: [X: ~351, Y: ~369, W: ~264, H: ~150]
    let r0 = &res.regions[0];
    assert_eq!(r0.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(r0.text.contains("반가워요") && r0.text.contains("이하린"), "Top bubble must contain '반가워요.\\n이하린이에요.'");
    crate::assert_region_bounds!(r0, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 351, 369, 264, 150, 10);

    // 3. BOTTOM LARGE NARRATION / FREE TEXT: [X: ~49, Y: ~1501, W: ~600, H: ~106]
    let r1 = &res.regions[1];
    assert_eq!(r1.kind, xianscan_rust::ml::schemas::RegionKind::FreeText);
    assert!(r1.text.contains("갑자기") && r1.text.contains("현타") && r1.text.contains("오네"), "Bottom narration must contain '갑자기 현타 오네.'");
    crate::assert_region_bounds!(r1, xianscan_rust::ml::schemas::RegionKind::FreeText, 49, 1501, 600, 106, 10);
}