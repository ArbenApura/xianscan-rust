// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_omniscient_reader_chapter_view_counts` (RESOLUTION: 690 x 1807)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP THOUGHT BUBBLE**: `"1화의 조회수가\n1200대, 10화\n지나면서 20으로 급감,\n50화 지나면서 12."`
/// - **MIDDLE SLANTED NARRATION**: `"그 뒤로..."` handwritten slanted free text.
/// - **BOTTOM NARRATION BOX**: `"이건 그야말로\n나만을 위한\n이야기가 아닌가."`
/// - **BACKGROUND REPETITIVE TABLE SUPPRESSION**: Stray background chapter list rows / comment counts (`"댓글: 1"`, `"조회수: 1"`, `"열람..."`) must be suppressed.
/// - **STRICT REGION COUNT**: Exactly 3 regions (2 DialogueBubble / 1 FreeText, or 1 DialogueBubble / 2 FreeText, with 0 SoundEffect).
#[test]
fn test_regression_page_omniscient_reader_chapter_view_counts() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_omniscient_reader_chapter_view_counts/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_omniscient_reader_chapter_view_counts: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Omniscient Reader Chapter View Counts Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: NO BACKGROUND TABLE NOISE (EXPECTED 3 REGIONS)
    assert_eq!(
        res.regions.len(),
        3,
        "Expected exactly 3 valid regions (top bubble, middle handwritten narration, bottom narration box), found {}",
        res.regions.len()
    );

    // 2. TOP THOUGHT BUBBLE
    let top_bubble = res
        .regions
        .iter()
        .find(|r| r.text.contains("1화") && r.text.contains("조회수") && r.text.contains("1200"))
        .expect("Top thought bubble must be detected");
    assert!(top_bubble.box_.y < 400, "Top bubble must be in the upper section");

    // 3. BOTTOM NARRATION BOX
    let bottom_narration = res
        .regions
        .iter()
        .find(|r| r.text.contains("그야말로") && r.text.contains("나만을") && r.text.contains("이야기"))
        .expect("Bottom narration box must be detected");
    assert!(bottom_narration.box_.y > 1000, "Bottom narration must be in the lower section");

    // 4. NEGATIVE GUARD: ZERO BACKGROUND TABLE / COMMENT NOISE
    assert!(
        !res.regions.iter().any(|r| {
            let t = r.text.trim();
            (t.contains("댓글: 1") || t.contains("것글:1") || t.contains("댓글:1")) && !r.text.contains("조회수가")
        }),
        "Background repetitive chapter table rows / comment count noise must be suppressed"
    );
}
