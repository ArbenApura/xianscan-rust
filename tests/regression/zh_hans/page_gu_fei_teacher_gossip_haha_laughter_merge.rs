// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_gu_fei_teacher_gossip_haha_laughter_merge` (RESOLUTION: 800 × 1861)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP DIALOGUE BUBBLE**:
///   `"阿发，你\n过来。"` (DialogueBubble).
/// - **PANEL 1 AF-A REACTION BUBBLE**:
///   `"啊？"` (DialogueBubble).
/// - **PANEL 2 STUDENTS GOSSIP DIALOGUE BUBBLE**:
///   `"大家有没有觉得顾飞老\n师最近好正常啊，都不\n再提他的功夫了，这样\n就没意思了！"` (DialogueBubble).
///   - MUST NOT merge external laughter `"哈哈"` into the bubble text.
///   - Typeset box must stay clamped within the speech balloon container (height ≤ 270px).
/// - **PANEL 2 EXTERNAL BACKGROUND LAUGHTER**:
///   `"哈哈"` (FreeText / SoundEffect, independent region on background below bubble).
/// - **PANEL 3 A-FA DEVOTION DIALOGUE BUBBLE**:
///   `"老师，别听他们\n胡扯，我可是亲\n眼看到老师您真\n功夫的！我是您\n铁杆儿粉丝！"` (DialogueBubble).
/// - **EXPLICIT NEGATIVE GUARDS**:
///   - MUST NOT MERGE '哈哈' INTO GOSSIP SPEECH BUBBLE.
///   - MUST NOT DILATE SPEECH BUBBLE TYPESET ENVELOPE ACROSS BUBBLE BORDER.
///   - MUST NOT DETECT '漫客栈' PUBLISHER WATERMARK.
/// - **EXACT COUNTS**: EXACTLY 5 REGIONS TOTAL (4 DIALOGUE BUBBLES, 1 SFX / FREE TEXT).
#[test]
fn test_regression_page_gu_fei_teacher_gossip_haha_laughter_merge() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_gu_fei_teacher_gossip_haha_laughter_merge/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_gu_fei_teacher_gossip_haha_laughter_merge: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Gu Fei Teacher Gossip Page detected {} regions:",
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 5 REGIONS TOTAL (4 DIALOGUE BUBBLES)
    assert_eq!(
        res.regions.len(),
        5,
        "Expected exactly 5 regions total (4 dialogue bubbles + 1 laughter), got {}",
        res.regions.len()
    );
    let bubble_count = res
        .regions
        .iter()
        .filter(|r| r.kind == RegionKind::DialogueBubble)
        .count();
    assert_eq!(
        bubble_count, 4,
        "Expected exactly 4 dialogue bubbles, got {}",
        bubble_count
    );

    // 2. PANEL 1 TOP DIALOGUE BUBBLE: '阿发，你过来。'
    let bubble_afa = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("阿发")
    });
    assert!(bubble_afa.is_some(), "Must detect panel 1 top bubble '阿发，你过来。'");
    let bubble_afa = bubble_afa.unwrap();
    crate::assert_region_bounds!(bubble_afa, RegionKind::DialogueBubble, 376, 81, 152, 86, 15);

    // 3. PANEL 1 AF-A REACTION BUBBLE: '啊？'
    let bubble_a = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.trim() == "啊？"
    });
    assert!(bubble_a.is_some(), "Must detect panel 1 reaction bubble '啊？'");
    let bubble_a = bubble_a.unwrap();
    crate::assert_region_bounds!(bubble_a, RegionKind::DialogueBubble, 520, 363, 76, 54, 15);

    // 4. PANEL 2 GOSSIP DIALOGUE BUBBLE: '大家有没有觉得顾飞老师...' (MUST NOT CONTAIN '哈哈')
    let bubble_gossip = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("顾飞老")
    });
    assert!(bubble_gossip.is_some(), "Must detect panel 2 gossip bubble");
    let bubble_gossip = bubble_gossip.unwrap();
    assert!(
        !bubble_gossip.text.contains("哈哈"),
        "Gossip bubble must NOT merge external laughter '哈哈', got '{}'",
        bubble_gossip.text
    );
    assert!(
        bubble_gossip.box_.h <= 270,
        "Gossip bubble box height must not dilate across container border to swallow laughter (expected <= 270px), got {}px",
        bubble_gossip.box_.h
    );
    crate::assert_bubble_bounds!(bubble_gossip, 28, 604, 407, 258, 20);

    // 5. PANEL 2 EXTERNAL BACKGROUND LAUGHTER: '哈哈'
    let text_haha = res.regions.iter().find(|r| r.text.contains("哈哈"));
    assert!(
        text_haha.is_some(),
        "Must detect external background laughter '哈哈' as its own region"
    );
    let text_haha = text_haha.unwrap();
    assert_ne!(
        text_haha.kind,
        RegionKind::DialogueBubble,
        "External laughter '哈哈' must be FreeText or SoundEffect, not DialogueBubble"
    );

    // 6. PANEL 3 A-FA DEVOTION DIALOGUE BUBBLE: '老师，别听他们胡扯...'
    let bubble_fan = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("铁杆")
    });
    assert!(bubble_fan.is_some(), "Must detect panel 3 A-Fa bubble");
    let bubble_fan = bubble_fan.unwrap();
    assert!(
        bubble_fan.text.contains("胡扯") && bubble_fan.text.contains("粉丝"),
        "Panel 3 bubble must contain full speech, got '{}'",
        bubble_fan.text
    );
    crate::assert_region_bounds!(bubble_fan, RegionKind::DialogueBubble, 197, 1151, 235, 182, 20);
    crate::assert_bubble_bounds!(bubble_fan, 199, 1132, 250, 273, 20);

    // 7. EXPLICIT NEGATIVE GUARDS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客栈")),
        "Must NOT detect publisher watermark '漫客栈'"
    );
}
