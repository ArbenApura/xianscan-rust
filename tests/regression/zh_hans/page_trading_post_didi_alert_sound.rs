// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_trading_post_didi_alert_sound` (RESOLUTION: 800 × 1866)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 DIALOGUE BUBBLE**:
///   `"这次谢谢你了，\n不然我都不知道\n还有交易行这地\n方。"` (DialogueBubble).
/// - **PANEL 2 MESSAGE ALERT SOUND EFFECT**:
///   `"嘀！\n嘀！"` (SoundEffect / FreeText, communicator alert inside diamond indicator).
///   - MUST NOT be discarded by single glyph or punctuation filters.
///   - MUST capture the stacked alert sound.
/// - **PANEL 3 DIALOGUE BUBBLE**:
///   `"已经解决了吗，你要\n不要把骗子的信息给\n我？我帮你直接处理\n掉。"` (DialogueBubble).
/// - **EXPLICIT NEGATIVE GUARDS**:
///   - MUST NOT DROP PANEL 2 ALERT SOUND '嘀！\n嘀！'.
///   - MUST NOT DETECT '漫客栈' PUBLISHER WATERMARK.
/// - **EXACT COUNTS**: EXACTLY 3 REGIONS TOTAL (2 DIALOGUE BUBBLES, 1 SFX / FREE TEXT).
#[test]
fn test_regression_page_trading_post_didi_alert_sound() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_trading_post_didi_alert_sound/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_trading_post_didi_alert_sound: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Trading Post DiDi Alert Page detected {} regions:",
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 3 REGIONS TOTAL (2 DIALOGUE BUBBLES)
    assert_eq!(
        res.regions.len(),
        3,
        "Expected exactly 3 regions total (2 bubbles + 1 sound alert), got {}",
        res.regions.len()
    );
    let bubble_count = res
        .regions
        .iter()
        .filter(|r| r.kind == RegionKind::DialogueBubble)
        .count();
    assert_eq!(
        bubble_count, 2,
        "Expected exactly 2 dialogue bubbles, got {}",
        bubble_count
    );

    // 2. PANEL 1 DIALOGUE BUBBLE: '这次谢谢你了...'
    let bubble_thanks = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("交易行")
    });
    assert!(
        bubble_thanks.is_some(),
        "Must detect panel 1 dialogue bubble '这次谢谢你了...'"
    );
    let bubble_thanks = bubble_thanks.unwrap();
    assert!(
        bubble_thanks.text.contains("谢谢你了") && bubble_thanks.text.contains("交易行"),
        "Panel 1 bubble must contain full speech, got '{}'",
        bubble_thanks.text
    );
    crate::assert_region_bounds!(bubble_thanks, RegionKind::DialogueBubble, 154, 81, 233, 141, 15);
    crate::assert_bubble_bounds!(bubble_thanks, 146, 64, 248, 174, 15);

    // 3. PANEL 2 MESSAGE ALERT SOUND EFFECT: '嘀！\n嘀！'
    let sfx_alert = res.regions.iter().find(|r| r.text.contains('嘀'));
    assert!(
        sfx_alert.is_some(),
        "Must detect panel 2 communicator alert sound '嘀！\n嘀！'"
    );
    let sfx_alert = sfx_alert.unwrap();
    assert!(
        sfx_alert.text.contains('嘀'),
        "Alert sound must contain '嘀', got '{}'",
        sfx_alert.text
    );
    crate::assert_region_bounds!(sfx_alert, sfx_alert.kind, 260, 420, 80, 90, 30);

    // 4. PANEL 3 DIALOGUE BUBBLE: '已经解决了吗...'
    let bubble_solve = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("骗子的信息")
    });
    assert!(
        bubble_solve.is_some(),
        "Must detect panel 3 dialogue bubble '已经解决了吗...'"
    );
    let bubble_solve = bubble_solve.unwrap();
    assert!(
        bubble_solve.text.contains("已经解决了") && bubble_solve.text.contains("直接处理掉"),
        "Panel 3 bubble must contain full speech, got '{}'",
        bubble_solve.text
    );
    crate::assert_region_bounds!(bubble_solve, RegionKind::DialogueBubble, 353, 1240, 319, 155, 15);
    crate::assert_bubble_bounds!(bubble_solve, 327, 1194, 371, 246, 15);

    // 5. EXPLICIT NEGATIVE GUARDS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客栈")),
        "Must NOT detect publisher watermark '漫客栈'"
    );
}
