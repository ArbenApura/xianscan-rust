// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_dagger_catch_thought_bubble_split` (RESOLUTION: 900 × 2294)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 SFX**: `"接"` (SoundEffect)
/// - **PANEL 2 SFX**: `"啊！"` (SoundEffect, tightly bounded without motion arc dilation)
/// - **PANEL 3 DIALOGUE BUBBLE**: `"你可不要\n乱动……"` (DialogueBubble, silent `......` bubble ignored)
/// - **PANEL 4 SPLIT THOUGHT BUBBLES**:
///   1. Upper thought bubble: `"这小子近战太\n可怕了！"` (DialogueBubble)
///   2. Lower thought bubble: `"我不能硬拼，跟\n他拉开距离然后\n迂回作战，这样\n才有机会反守为\n攻！"` (DialogueBubble)
/// - **EXACT COUNTS**: Exactly 5 regions (3 dialogue/thought bubbles, 2 sound effects, 0 free text).
#[test]
fn test_regression_page_dagger_catch_thought_bubble_split() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_dagger_catch_thought_bubble_split.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_dagger_catch_thought_bubble_split: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Dagger Catch Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 3 REGIONS (3 DIALOGUEBUBBLES, 0 FREETEXT)
    crate::assert_element_counts!(res, 3, 3, 0);

    // 2. NEGATIVE GUARDS: NO PANEL 1 SFX '接' OR PANEL 2 SFX '啊！' EXTRACTED AS FREETEXT
    assert!(!res.regions.iter().any(|r| r.text.trim() == "接"), "Must NOT extract panel 1 SFX '接'");
    assert!(!res.regions.iter().any(|r| r.text.contains("啊")), "Must NOT extract panel 2 SFX '啊！'");

    // 3. PANEL 3 DIALOGUE BUBBLE: '你可不要\n乱动……' -> [X: 56, Y: 1174, W: 176, H: 98]
    let b1 = res.regions.iter().find(|r| r.text.contains("你可不要") || r.text.contains("乱动"));
    assert!(b1.is_some(), "Must detect panel 3 dialogue bubble '你可不要乱动……'");
    let b1 = b1.unwrap();
    assert_eq!(b1.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 56, 1174, 176, 98, 8);
    crate::assert_bubble_bounds!(b1, 46, 1162, 199, 125, 8);
    crate::assert_region_angle!(b1, 0.0, 2.0);

    // 5. PANEL 4 UPPER THOUGHT BUBBLE: '这小子近战太\n可怕了！' -> [X: 204, Y: 1856, W: 226, H: 98]
    let b2 = res.regions.iter().find(|r| r.text.contains("这小子近战太") || r.text.contains("可怕了"));
    assert!(b2.is_some(), "Must detect panel 4 upper thought bubble '这小子近战太可怕了！'");
    let b2 = b2.unwrap();
    assert_eq!(b2.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!b2.text.contains("硬拼") && !b2.text.contains("反守为攻"), "Upper thought bubble must NOT merge with lower thought bubble");
    crate::assert_region_bounds!(b2, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 204, 1856, 226, 98, 8);
    crate::assert_bubble_bounds!(b2, 186, 1836, 318, 360, 10);
    crate::assert_region_angle!(b2, 0.0, 2.0);

    // 6. PANEL 4 LOWER THOUGHT BUBBLE: '我不能硬拼，跟\n他拉开距离然后\n迂回作战，这样\n才有机会反守为\n攻！' -> [X: 193, Y: 1987, W: 267, H: 210]
    let b3 = res.regions.iter().find(|r| r.text.contains("硬拼") || r.text.contains("反守为攻") || r.text.contains("拉开距离"));
    assert!(b3.is_some(), "Must detect panel 4 lower thought bubble '我不能硬拼...'");
    let b3 = b3.unwrap();
    assert_eq!(b3.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!b3.text.contains("这小子近战太"), "Lower thought bubble must NOT contain upper bubble text");
    crate::assert_region_bounds!(b3, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 193, 1987, 267, 210, 8);
    crate::assert_bubble_bounds!(b3, 186, 1836, 318, 360, 10);
    crate::assert_region_angle!(b3, 0.0, 2.0);

    // 7. EXPLICIT NEGATIVE GUARDS AGAINST WATERMARKS & UNIFIED GIANT BOX
    assert!(!res.regions.iter().any(|r| r.text.contains("漫客")), "Must filter platform corner watermark");
    assert!(
        !res.regions.iter().any(|r| r.text.contains("这小子近战太") && r.text.contains("反守为攻")),
        "Must NOT produce giant merged 7-line thought bubble"
    );
}
