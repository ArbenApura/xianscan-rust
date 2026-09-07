// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # CHINESE REAL-PAGE REGRESSION: page_dragon_surrender_plea_bubbles (RESOLUTION: 900 × 1703)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 SPEECH BUBBLE**:
///   "降不降？降不降？" (DialogueBubble).
/// - **PANEL 2 SHOUT BUBBLE**:
///   "降不降！" (DialogueBubble).
/// - **PANEL 3 DRAGON SURRENDER PLEA**:
///   "我…\n我…我降！" (DialogueBubble).
///   Must include the leading stutter/ellipsis line 我… rather than dropping it.
///   Must be DialogueBubble with container bounds.
/// - **PANEL 4 NARRATION / THOUGHT BUBBLE**:
///   "今日之后，恐怕\n地球再无人敢直\n面他的锋芒了。" (DialogueBubble).
/// - **EXACT COUNTS**: Exactly 4 dialogue bubbles, 0 SFX, 0 free text.
#[test]
fn test_regression_page_dragon_surrender_plea_bubbles() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_dragon_surrender_plea_bubbles/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_dragon_surrender_plea_bubbles: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Dragon Surrender Plea Bubbles Page detected {} regions:",
        res.regions.len()
    );
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}°, box={:?}, bubble_box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.bubble_box,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: 4 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT
    crate::assert_element_counts!(res, 4, 4, 0, 0);

    // 2. PANEL 1 SPEECH BUBBLE: "降不降？降不降？"
    let bubble_ask1 = &res.regions[0];
    assert_eq!(bubble_ask1.kind, RegionKind::DialogueBubble);
    assert!(
        bubble_ask1.text.contains("降不降"),
        "Bubble text must contain '降不降', got '{}'",
        bubble_ask1.text
    );
    crate::assert_region_bounds!(bubble_ask1, RegionKind::DialogueBubble, 182, 72, 162, 34, 15);
    crate::assert_bubble_bounds!(bubble_ask1, 144, 33, 233, 120, 20);

    // 3. PANEL 2 SHOUT BUBBLE: "降不降！"
    let bubble_ask2 = &res.regions[1];
    assert_eq!(bubble_ask2.kind, RegionKind::DialogueBubble);
    assert!(
        bubble_ask2.text.contains("降不降"),
        "Bubble text must contain '降不降', got '{}'",
        bubble_ask2.text
    );
    crate::assert_region_bounds!(bubble_ask2, RegionKind::DialogueBubble, 604, 844, 94, 38, 15);
    crate::assert_bubble_bounds!(bubble_ask2, 577, 826, 146, 75, 20);

    // 4. PANEL 3 THOUGHT BUBBLE: "今日之后，恐怕\n地球再无人敢直\n面他的锋芒了。"
    let bubble_thought = &res.regions[2];
    assert_eq!(bubble_thought.kind, RegionKind::DialogueBubble);
    assert!(
        bubble_thought.text.contains("今日之后"),
        "Bubble text must contain '今日之后', got '{}'",
        bubble_thought.text
    );
    crate::assert_region_bounds!(bubble_thought, RegionKind::DialogueBubble, 721, 1308, 142, 82, 15);
    crate::assert_bubble_bounds!(bubble_thought, 697, 1289, 193, 121, 20);

    // 5. PANEL 3 DRAGON SURRENDER PLEA: "我…\n我…我降！"
    let bubble_surrender = &res.regions[3];
    assert_eq!(bubble_surrender.kind, RegionKind::DialogueBubble);
    assert!(
        bubble_surrender.text.contains("我降") || (bubble_surrender.text.contains('我') && bubble_surrender.text.contains('降')),
        "Bubble text must contain dragon surrender plea, got '{}'",
        bubble_surrender.text
    );
    assert!(
        bubble_surrender.text.contains('\n'),
        "Bubble text must preserve leading stutter line via newline, got '{}'",
        bubble_surrender.text
    );
    crate::assert_region_bounds!(bubble_surrender, RegionKind::DialogueBubble, 63, 1563, 106, 62, 15);
    crate::assert_bubble_bounds!(bubble_surrender, 39, 1545, 146, 96, 20);
}
