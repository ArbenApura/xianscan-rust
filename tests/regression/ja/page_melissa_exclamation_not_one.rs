// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_melissa_exclamation_not_one` (RESOLUTION: 1125 × 1336 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **EXCLAMATION MARK OCR RECOGNITION (`！` NOT `一.`)**:
///   IN PANEL 2, THE REACTION BUBBLE ABOVE MELISSA CONTAINS A SINGLE EXCLAMATION MARK `！`.
///   OCR MUST NOT MISRECOGNIZE IT AS KANJI `一.` (WHICH CRITICALLY TRANSLATES TO `1.`).
/// - **CLEAN DIALOGUE EXTRACTION**:
///   VERIFIES BOTH KNIGHT DIALOGUE BUBBLES `まあアイツのことは今はどうでもいいが` AND `いよいよ明日からだぜ`.
#[test]
fn test_regression_page_melissa_exclamation_not_one() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_melissa_exclamation_not_one.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_melissa_exclamation_not_one: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 1125x1336 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, box={:?}, bubble_box={:?}, text='{}', conf={:.2}, vert={}",
            i, r.kind, r.box_, r.bubble_box, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. DIALOGUE BUBBLE ACCOUNTING: PURE EXCLAMATION BUBBLE '！' IS SUPPRESSED, LEAVING 2 STORY DIALOGUES
    let dialogue_bubbles: Vec<_> = res.regions.iter().filter(|r| r.kind == xianscan_rust::ml::schemas::RegionKind::DialogueBubble).collect();
    assert_eq!(dialogue_bubbles.len(), 2, "Expected exactly 2 dialogue bubbles (pure exclamation bubble skipped), found {}", dialogue_bubbles.len());

    // 1. PANEL 2 REACTION BUBBLE: '！' MUST BE SUPPRESSED (ISOLATED EXCLAMATION MARKS REQUIRE NO TRANSLATION)
    let excl_bubble = res.regions.iter().find(|r| r.box_.y >= 500 && r.box_.y <= 650 && r.box_.x >= 250 && r.box_.x <= 360);
    assert!(excl_bubble.is_none(), "Pure exclamation reaction bubble must be suppressed");

    // 2. PANEL 2 RIGHT BUBBLE: 'まあ アイツのことは 今はどうでもいいが'
    let well_bubble = res.regions.iter().find(|r| r.text.contains("アイツのこと") || r.text.contains("どうでもいい"));
    assert!(well_bubble.is_some(), "Must detect panel 2 right dialogue bubble");

    // 3. PANEL 3 BOTTOM BUBBLE: 'いよいよ 明日からだぜ'
    let tomorrow_bubble = res.regions.iter().find(|r| r.text.contains("明日から") || r.text.contains("いよいよ"));
    assert!(tomorrow_bubble.is_some(), "Must detect panel 3 tomorrow dialogue bubble");
}
