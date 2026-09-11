// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_zui_ge_wide_dash_ni_shei_a` (RESOLUTION: 800 × 1280)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP WIDE SHOUT BUBBLE**:
///   `"醉——————————哥！"` (DialogueBubble, wide speech balloon with prolonged horizontal dash).
///   - MUST NOT be pruned by sparse giant or low character-density filters.
///   - MUST contain both `"醉"` and `"哥"`.
/// - **PANEL 1 RIGHT REACTION NARRATION**:
///   `"你谁啊！"` (FreeText, sits near the right margin next to character's sweaty face).
///   - MUST NOT be pruned by right margin truncation filters.
/// - **PANEL 2 DIALOGUE BUBBLE**:
///   `"刚才剑鬼隐身你是\n怎么知道他在你背\n后啊？"` (DialogueBubble).
/// - **EXPLICIT NEGATIVE GUARDS**:
///   - MUST NOT DROP '醉——————————哥！'.
///   - MUST NOT DROP RIGHT-MARGIN TEXT '你谁啊！'.
///   - MUST NOT DETECT '漫客栈' PUBLISHER WATERMARK.
/// - **EXACT COUNTS**: EXACTLY 3 REGIONS TOTAL (2 DIALOGUE BUBBLES, 0 SFX, 1 FREE TEXT).
#[test]
fn test_regression_page_zui_ge_wide_dash_ni_shei_a() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_zui_ge_wide_dash_ni_shei_a/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_zui_ge_wide_dash_ni_shei_a: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Zui Ge Wide Dash Page detected {} regions:",
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 3 REGIONS (2 DIALOGUE BUBBLES, 0 SFX, 1 FREE TEXT)
    crate::assert_element_counts!(res, 3, 2, 0, 1);

    // 2. PANEL 1 TOP WIDE SHOUT BUBBLE: '醉——————————哥！'
    let bubble_zui = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.box_.y < 300 && r.text.contains("醉")
    });
    assert!(
        bubble_zui.is_some(),
        "Must detect panel 1 wide shout bubble '醉——————————哥！'"
    );
    let bubble_zui = bubble_zui.unwrap();
    assert!(
        bubble_zui.text.contains("醉") && bubble_zui.text.contains("哥"),
        "Wide shout bubble must contain both '醉' and '哥', got '{}'",
        bubble_zui.text
    );
    crate::assert_region_bounds!(bubble_zui, RegionKind::DialogueBubble, 60, 50, 680, 100, 30);

    // 3. PANEL 1 RIGHT REACTION TEXT: '你谁啊！' (FreeText)
    let text_who = res.regions.iter().find(|r| r.text.contains("你谁啊"));
    assert!(
        text_who.is_some(),
        "Must detect right margin reaction text '你谁啊！'"
    );
    let text_who = text_who.unwrap();
    assert_eq!(text_who.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(text_who, RegionKind::FreeText, 700, 270, 95, 45, 25);

    // 4. PANEL 2 DIALOGUE BUBBLE: '刚才剑鬼隐身你是怎么知道他在你背后啊？'
    let bubble_jiangui = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("剑鬼隐身")
    });
    assert!(
        bubble_jiangui.is_some(),
        "Must detect panel 2 dialogue bubble '刚才剑鬼隐身你是怎么知道他在你背后啊？'"
    );
    let bubble_jiangui = bubble_jiangui.unwrap();
    assert!(
        bubble_jiangui.text.contains("剑鬼隐身") && bubble_jiangui.text.contains("背后"),
        "Panel 2 bubble must contain full sentence, got '{}'",
        bubble_jiangui.text
    );
    crate::assert_region_bounds!(bubble_jiangui, RegionKind::DialogueBubble, 90, 621, 278, 126, 15);
    crate::assert_bubble_bounds!(bubble_jiangui, 60, 591, 342, 208, 15);

    // 5. EXPLICIT NEGATIVE GUARDS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客栈")),
        "Must NOT detect publisher watermark '漫客栈'"
    );
}
