// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_father_practice_sparring_beatdown` (RESOLUTION: 800 × 1724)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP DIALOGUE BUBBLE (PANEL 1)**:
///   `"练了又不让\n用，逗我玩\n吗？"` (DialogueBubble).
/// - **MIDDLE DIALOGUE BUBBLE (PANEL 2)**:
///   `"你可以和\n我练啊！"` (DialogueBubble, round bubble with tail, must NOT fall back to FreeText).
/// - **BOTTOM SPARK DIALOGUE BUBBLE (PANEL 3)**:
///   `"让你放\n肆！"` (DialogueBubble).
/// - **BOTTOM-LEFT NARRATION (PANEL 3)**:
///   `"顾飞的功夫很厉害，\n但比起老爹来还是差\n好多——"` (FreeText, must NOT garble '好多——' into '好名').
/// - **BOTTOM-RIGHT NARRATION (PANEL 3)**:
///   `"所以，这就\n是那天发生\n的真相。"` (FreeText).
/// - **EXPLICIT NEGATIVE GUARDS**:
///   - MUST NOT FALL BACK MIDDLE CIRCLE BUBBLE TO FREETEXT.
///   - MUST NOT MISREAD '好多' AS '好名'.
///   - MUST NOT DETECT '漫客栈' WATERMARK.
/// - **EXACT COUNTS**: EXACTLY 5 REGIONS TOTAL (3 DIALOGUE BUBBLE, 0 SFX, 2 FREE TEXT).
#[test]
fn test_regression_page_father_practice_sparring_beatdown() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_father_practice_sparring_beatdown/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_father_practice_sparring_beatdown: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Father Practice Sparring Beatdown Page detected {} regions:",
        res.regions.len()
    );
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}°, box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 5 REGIONS (3 DIALOGUE BUBBLES, 0 SFX, 2 FREE TEXT)
    crate::assert_element_counts!(res, 5, 3, 0, 2);

    // 2. TOP DIALOGUE BUBBLE: '练了又不让\n用，逗我玩\n吗？'
    let bubble_lian = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("练了又不让")
    });
    assert!(
        bubble_lian.is_some(),
        "Must detect top panel dialogue bubble '练了又不让用，逗我玩吗？'"
    );
    let bubble_lian = bubble_lian.unwrap();
    assert!(
        bubble_lian.text.contains("逗我玩"),
        "Top bubble must contain '逗我玩', got '{}'",
        bubble_lian.text
    );
    crate::assert_region_bounds!(bubble_lian, RegionKind::DialogueBubble, 188, 86, 191, 125, 12);
    crate::assert_bubble_bounds!(bubble_lian, 145, 77, 277, 142, 15);

    // 3. MIDDLE CIRCULAR DIALOGUE BUBBLE: '你可以和\n我练啊！' (Must be DialogueBubble, not FreeText)
    let bubble_circle = res.regions.iter().find(|r| r.text.contains("你可以和"));
    assert!(
        bubble_circle.is_some(),
        "Must detect middle panel dialogue '你可以和我练啊！'"
    );
    let bubble_circle = bubble_circle.unwrap();
    assert_eq!(
        bubble_circle.kind,
        RegionKind::DialogueBubble,
        "Middle panel speech bubble must be DialogueBubble, not FreeText"
    );
    assert!(
        bubble_circle.bubble_box.is_some(),
        "Middle panel speech bubble must have an associated bubble container"
    );
    assert!(
        bubble_circle.text.contains("我练啊"),
        "Middle bubble must contain '我练啊', got '{}'",
        bubble_circle.text
    );
    crate::assert_region_bounds!(bubble_circle, RegionKind::DialogueBubble, 471, 762, 152, 83, 15);

    // 4. BOTTOM SPARK DIALOGUE BUBBLE: '让你放\n肆！'
    let bubble_fangsi = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("让你放")
    });
    assert!(
        bubble_fangsi.is_some(),
        "Must detect bottom spiky dialogue bubble '让你放肆！'"
    );
    let bubble_fangsi = bubble_fangsi.unwrap();
    assert!(
        bubble_fangsi.text.contains("肆"),
        "Spiky bubble must contain '肆', got '{}'",
        bubble_fangsi.text
    );
    crate::assert_region_bounds!(bubble_fangsi, RegionKind::DialogueBubble, 578, 1362, 106, 74, 12);
    crate::assert_bubble_bounds!(bubble_fangsi, 559, 1350, 171, 101, 15);

    // 5. BOTTOM-LEFT NARRATION: '顾飞的功夫很厉害，\n但比起老爹来还是差\n好多——' (FreeText)
    let narration_left = res.regions.iter().find(|r| r.text.contains("顾飞的功夫很厉害"));
    assert!(
        narration_left.is_some(),
        "Must detect bottom-left narration '顾飞的功夫很厉害，但比起老爹来还是差好多——'"
    );
    let narration_left = narration_left.unwrap();
    assert_eq!(narration_left.kind, RegionKind::FreeText);
    assert!(
        narration_left.text.contains("好多"),
        "Narration must contain '好多', must not garble into '好名', got '{}'",
        narration_left.text
    );
    crate::assert_region_bounds!(narration_left, RegionKind::FreeText, 8, 1377, 294, 101, 15);

    // 6. BOTTOM-RIGHT NARRATION: '所以，这就\n是那天发生\n的真相。' (FreeText)
    let narration_right = res.regions.iter().find(|r| r.text.contains("那天发生"));
    assert!(
        narration_right.is_some(),
        "Must detect bottom-right narration '所以，这就是那天发生的真相。'"
    );
    let narration_right = narration_right.unwrap();
    assert_eq!(narration_right.kind, RegionKind::FreeText);
    assert!(
        narration_right.text.contains("真相"),
        "Narration must contain '真相', got '{}'",
        narration_right.text
    );
    crate::assert_region_bounds!(narration_right, RegionKind::FreeText, 613, 1506, 171, 118, 15);

    // 7. EXPLICIT NEGATIVE GUARDS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("好名")),
        "Must NOT misread '好多' as '好名'"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客栈")),
        "Must NOT detect publisher watermark '漫客栈'"
    );
}
