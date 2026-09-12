// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_glowing_relic_narration_false_bubble` (RESOLUTION: 800 × 1763)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP NARRATION (TWO LINES)**:
///   `"钱倒是不重要，不过那玩意\n可自有妙用！"` (Must cover both Line 1 and Line 2, starting around y ~ 38..40).
///   - Must NOT be truncated or shifted downwards into the glowing lantern / relic pedestal at y ~ 87..176.
/// - **PANEL 1 TOP-RIGHT BUBBLE**:
///   `"那东西，\n一定要拿到！"` (DialogueBubble).
/// - **PANEL 1 ACTION TAG**:
///   `"起身"` (DialogueBubble / FreeText).
/// - **PANEL 2 SPEECH BUBBLE**:
///   `"你好！\n我想加入你们\n的队伍！"` (DialogueBubble).
/// - **PANEL 3 OVAL BUBBLE**:
///   `"嗯？"` (DialogueBubble).
/// - **PANEL 3 LEFT BUBBLE**:
///   `"不知\n陈少\n是否\n愿意？"` (DialogueBubble).
/// - **PANEL 4 TOP BUBBLE**:
///   `"小子，你有青\n铜级别了吗？"` (DialogueBubble).
/// - **PANEL 4 GESTURE TAG**:
///   `"示意"` (DialogueBubble / FreeText).
/// - **PANEL 4 BOTTOM-LEFT BUBBLE**:
///   `"别在这\n里瞎凑\n热闹！"` (DialogueBubble).
/// - **PANEL 5 BOTTOM BUBBLE**:
///   `"等等，"` (DialogueBubble).
/// - **EXPLICIT NEGATIVE GUARDS**:
///   - MUST NOT DETECT '漫客栈' GUTTER WATERMARK.
///   - PANEL 1 NARRATION MUST ENCOMPASS LINE 1 '钱倒是不重要' AND START ABOVE y <= 55.
#[test]
fn test_regression_page_glowing_relic_narration_false_bubble() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_glowing_relic_narration_false_bubble/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_glowing_relic_narration_false_bubble: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Glowing Relic Page detected {} regions:",
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

    // 1. EXACT ELEMENT COUNTS: 10 REGIONS TOTAL
    assert_eq!(
        res.regions.len(),
        10,
        "Expected exactly 10 regions total, got {}",
        res.regions.len()
    );

    // 2. PANEL 1 TOP NARRATION: '钱倒是不重要，不过那玩意\n可自有妙用！'
    let narration = res.regions.iter().find(|r| {
        r.text.contains("钱倒是不重要") || r.text.contains("不过那玩意") || r.text.contains("自有妙用")
    });
    assert!(
        narration.is_some(),
        "Must detect panel 1 top narration '钱倒是不重要，不过那玩意\n可自有妙用！'"
    );
    let narration = narration.unwrap();
    assert!(
        narration.text.contains("钱倒是不重要") && narration.text.contains("自有妙用"),
        "Panel 1 narration must contain both lines ('钱倒是不重要' and '自有妙用'), got '{}'",
        narration.text
    );
    // Crucial check: Box must cover Line 1 (y=59) and Line 2 (down to y=129). If y >= 70, Line 1 was severed!
    crate::assert_region_bounds!(narration, RegionKind::FreeText, 74, 59, 244, 70, 8);

    // 3. PANEL 1 RIGHT BUBBLE: '那东西，\n一定要拿到！'
    let bubble_item = res.regions.iter().find(|r| r.text.contains("那东西") || r.text.contains("一定要拿到"));
    assert!(
        bubble_item.is_some(),
        "Must detect panel 1 right bubble '那东西，一定要拿到！'"
    );
    let bubble_item = bubble_item.unwrap();
    crate::assert_region_bounds!(bubble_item, RegionKind::DialogueBubble, 409, 75, 132, 86, 15);

    // 4. ACTION TAG '起身'
    let tag_stand = res.regions.iter().find(|r| r.text.trim() == "起身");
    assert!(tag_stand.is_some(), "Must detect action tag '起身'");

    // 5. PANEL 2 BUBBLE: '你好！\n我想加入你们\n的队伍！'
    let bubble_join = res.regions.iter().find(|r| r.text.contains("我想加入你们"));
    assert!(bubble_join.is_some(), "Must detect bubble '我想加入你们的队伍！'");
    let bubble_join = bubble_join.unwrap();
    crate::assert_region_bounds!(bubble_join, RegionKind::DialogueBubble, 91, 488, 175, 158, 20);

    // 6. PANEL 3 OVAL BUBBLE: '嗯？'
    let bubble_hmm = res.regions.iter().find(|r| r.text.contains("嗯"));
    assert!(bubble_hmm.is_some(), "Must detect bubble '嗯？'");

    // 7. PANEL 3 LEFT BUBBLE: '不知\n陈少\n是否\n愿意？'
    let bubble_chen = res.regions.iter().find(|r| r.text.contains("陈少"));
    assert!(bubble_chen.is_some(), "Must detect bubble '不知陈少是否愿意？'");

    // 8. PANEL 4 TOP BUBBLE: '小子，你有青\n铜级别了吗？'
    let bubble_bronze = res.regions.iter().find(|r| r.text.contains("青") && r.text.contains("铜级别"));
    assert!(bubble_bronze.is_some(), "Must detect bubble '小子，你有青铜级别了吗？'");

    // 9. GESTURE TAG '示意'
    let tag_gesture = res.regions.iter().find(|r| r.text.trim() == "示意");
    assert!(tag_gesture.is_some(), "Must detect gesture tag '示意'");

    // 10. PANEL 4 BOTTOM-LEFT BUBBLE: '别在这\n里瞎凑\n热闹！'
    let bubble_crowd = res.regions.iter().find(|r| r.text.contains("瞎") || r.text.contains("热闹"));
    assert!(bubble_crowd.is_some(), "Must detect bubble '别在这里瞎凑热闹！'");

    // 11. PANEL 5 BOTTOM BUBBLE: '等等，'
    let bubble_wait = res.regions.iter().find(|r| r.text.contains("等等"));
    assert!(bubble_wait.is_some(), "Must detect bubble '等等，'");

    // 12. EXPLICIT NEGATIVE GUARDS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客栈") || r.text.contains("漫客")),
        "Must NOT detect publisher watermark '漫客栈'"
    );
}
