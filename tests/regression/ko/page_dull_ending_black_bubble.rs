// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_dull_ending_black_bubble` (RESOLUTION: 690 × 2264)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **BLACK OVAL DIALOGUE BUBBLE**:
///   `"시시한\n결말이구나."` (Unified 2-line dialogue bubble text)
/// - **EXACT COUNTS**: Exactly 1 region (1 bubble, 0 SFX, 0 free text).
#[test]
fn test_regression_page_dull_ending_black_bubble() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_dull_ending_black_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_dull_ending_black_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Dull Ending Black Bubble Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 1 REGION (0 DIALOGUEBUBBLE, 0 SOUNDEFFECT, 1 FREETEXT)
    crate::assert_element_counts!(res, 1, 0, 0, 1);

    // 2. DIALOGUE / TEXT BLOCK: MUST CONTAIN BOTH LINES
    let bubble = res
        .regions
        .iter()
        .find(|r| r.text.contains("시시한") || r.text.contains("결말이구나"));
    assert!(bubble.is_some(), "Must detect unified dialogue text");
    let bubble = bubble.unwrap();
    assert!(
        bubble.text.contains("시시한"),
        "Dialogue block must include first line '시시한', got: {:?}",
        bubble.text
    );
    assert!(
        bubble.text.contains("결말이구나"),
        "Dialogue block must include second line '결말이구나', got: {:?}",
        bubble.text
    );
    crate::assert_region_bounds!(
        bubble,
        xianscan_rust::ml::schemas::RegionKind::FreeText,
        169,
        443,
        347,
        184,
        25
    );
}
