// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_omniscient_reader_phone_chapter_list` (RESOLUTION: 690 x 1699)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PHONE UI CHAPTER LIST / STATUS BAR SCREEN SUPPRESSION**: Dense tabular / repetitive chapter list interface text on phone screen must be suppressed.
/// - **BOTTOM NARRATION BOX**: `"나는 이 소설을\n중학교 3학년\n때부터 봐왔다."`
/// - **STRICT REGION COUNT**: Exactly 1 region (0 DialogueBubble, 0 SoundEffect, 1 FreeText).
#[test]
fn test_regression_page_omniscient_reader_phone_chapter_list() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_omniscient_reader_phone_chapter_list/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_omniscient_reader_phone_chapter_list: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Omniscient Reader Phone Chapter List Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 1 REGION (0 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 1 FREETEXT)
    crate::assert_element_counts!(res, 1, 0, 0, 1);

    // 2. BOTTOM NARRATION: [X: ~239, Y: ~1390, W: ~206, H: ~126]
    let r0 = &res.regions[0];
    assert_eq!(r0.kind, xianscan_rust::ml::schemas::RegionKind::FreeText);
    assert!(r0.text.contains("나는") && r0.text.contains("소설") && r0.text.contains("중학교"), "Bottom narration must contain '나는 이 소설을 중학교...'");
    crate::assert_region_bounds!(r0, xianscan_rust::ml::schemas::RegionKind::FreeText, 239, 1390, 206, 126, 12);

    // 3. NEGATIVE GUARD: ZERO PHONE UI CHAPTER LIST HALLUCINATIONS / SPAM / SCREEN HEADERS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("3125") || r.text.contains("조회수") || r.text.contains("댓글") || r.text.contains("멸망한")),
        "Phone screen graphic (header, chapter list, comment counters) must be completely ignored as background illustration prop"
    );
}
