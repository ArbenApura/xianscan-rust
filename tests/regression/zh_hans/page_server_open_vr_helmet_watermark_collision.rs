// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_server_open_vr_helmet_watermark_collision` (RESOLUTION: 800 × 1825)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 LEFT DIALOGUE BUBBLE**:
///   `"哇！终于开服\n了！"` (DialogueBubble, must NOT have tail artifact 'Λ' appended).
/// - **PANEL 1 RIGHT DIALOGUE BUBBLE**:
///   `"真不知道游戏公司改\n什么东西改这么久，\n一维护就是一个多月！"` (or `"一维护就是一个月！"`, DialogueBubble).
/// - **PANEL 2 SLANTED SHOUT NARRATION**:
///   `"赶紧上游戏\n看看！"` (FreeText, tilted angle ~ -16.9°).
/// - **PANEL 3 BUTTON CLICK SOUND EFFECT**:
///   `"嘀"` (FreeText / SoundEffect, button press on VR helmet).
///   - Watermark `"漫客栈"` / `"客祥"` in the gutter above must NOT be merged with `"嘀"`.
/// - **EXPLICIT NEGATIVE GUARDS**:
///   - MUST NOT MERGE GUTTER WATERMARK '客祥 / 漫客栈' INTO SOUND EFFECT '嘀'.
///   - MUST NOT APPEND TAIL CARET 'Λ' TO '哇！终于开服了！'.
///   - MUST NOT DETECT '漫客栈' WATERMARKS IN GUTTERS.
/// - **EXACT COUNTS**: EXACTLY 4 REGIONS TOTAL (2 DIALOGUE BUBBLE, 0 SFX, 2 FREE TEXT; OR 2 BUBBLES, 1 SFX, 1 FREE TEXT).
#[test]
fn test_regression_page_server_open_vr_helmet_watermark_collision() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_server_open_vr_helmet_watermark_collision/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_server_open_vr_helmet_watermark_collision: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Server Open VR Helmet Page detected {} regions:",
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

    // 1. EXACT ELEMENT COUNTS: 5 REGIONS TOTAL WITH EXACTLY 2 DIALOGUE BUBBLES
    assert_eq!(
        res.regions.len(),
        5,
        "Expected exactly 5 regions total, got {}",
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

    // 2. PANEL 1 LEFT DIALOGUE BUBBLE: '哇！终于开服了！' (Must NOT have tail artifact 'Λ')
    let bubble_left = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("终于开服")
    });
    assert!(
        bubble_left.is_some(),
        "Must detect panel 1 left bubble '哇！终于开服了！'"
    );
    let bubble_left = bubble_left.unwrap();
    assert!(
        !bubble_left.text.contains('Λ') && !bubble_left.text.contains('^'),
        "Must NOT append bubble tail caret artifact 'Λ', got '{}'",
        bubble_left.text
    );
    crate::assert_region_bounds!(bubble_left, RegionKind::DialogueBubble, 111, 295, 224, 94, 15);

    // 3. PANEL 1 RIGHT DIALOGUE BUBBLE: '真不知道游戏公司改...'
    let bubble_right = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("游戏公司")
    });
    assert!(
        bubble_right.is_some(),
        "Must detect panel 1 right bubble '真不知道游戏公司改...'"
    );
    let bubble_right = bubble_right.unwrap();
    assert!(
        bubble_right.text.contains("改这么久") || bubble_right.text.contains("维护"),
        "Panel 1 right bubble must contain maintenance complaint, got '{}'",
        bubble_right.text
    );
    crate::assert_region_bounds!(bubble_right, RegionKind::DialogueBubble, 390, 297, 330, 132, 15);

    // 3b. PANEL 2 KEYBOARD CLACKING SOUND EFFECT: '咔啦咔啦'
    let sfx_kala = res.regions.iter().find(|r| r.text.contains("咔啦"));
    assert!(
        sfx_kala.is_some(),
        "Must detect panel 2 keyboard typing sound effect '咔啦咔啦'"
    );
    let sfx_kala = sfx_kala.unwrap();
    assert_eq!(sfx_kala.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(sfx_kala, RegionKind::FreeText, 105, 640, 143, 92, 20);
    crate::assert_region_angle!(sfx_kala, -23.12, 4.0);

    // 4. PANEL 2 SLANTED SHOUT NARRATION: '赶紧上游戏\n看看！'
    let shout = res.regions.iter().find(|r| r.text.contains("赶紧上游戏"));
    assert!(
        shout.is_some(),
        "Must detect panel 2 shout '赶紧上游戏看看！'"
    );
    let shout = shout.unwrap();
    assert!(
        shout.text.contains("看看"),
        "Shout must contain '看看', got '{}'",
        shout.text
    );
    crate::assert_region_bounds!(shout, RegionKind::FreeText, 101, 964, 201, 153, 20);
    crate::assert_region_angle!(shout, -16.91, 3.0);

    // 5. PANEL 3 BUTTON CLICK SOUND EFFECT: '嘀' (Must NOT contain '客祥' / '客栈')
    let sfx_di = res.regions.iter().find(|r| r.text.contains('嘀'));
    assert!(
        sfx_di.is_some(),
        "Must detect panel 3 button sound effect '嘀'"
    );
    let sfx_di = sfx_di.unwrap();
    assert!(
        !sfx_di.text.contains("客祥") && !sfx_di.text.contains("客栈"),
        "Sound effect '嘀' must NOT be merged with gutter watermark '客祥 / 客栈', got '{}'",
        sfx_di.text
    );
    assert_eq!(
        sfx_di.text.trim(),
        "嘀",
        "Panel 3 sound effect must be cleanly isolated as '嘀', got '{}'",
        sfx_di.text
    );
    crate::assert_region_angle!(sfx_di, 3.98, 1.0);

    // 6. EXPLICIT NEGATIVE GUARDS
    assert!(
        !res.regions.iter().any(|r| {
            r.text.contains("客祥") || r.text.contains("漫客栈") || r.text.contains("客栈")
        }),
        "Must NOT contain publisher watermark '漫客栈' or misread '客祥'"
    );
}
