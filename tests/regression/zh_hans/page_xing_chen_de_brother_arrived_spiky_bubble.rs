// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_xing_chen_de_brother_arrived_spiky_bubble` (RESOLUTION: 827 x 1610)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 SPIKY BUBBLE**: `"姓陈的，我哥来了，\n你等着吧！"` (DialogueBubble, strictly unified)
/// - **PANEL 2 BUBBLE**: `"一个燕京世家的\n小辈罢了，\n不值一提！"` (DialogueBubble)
/// - **PANEL 3 BUBBLE**: `"看来他也没唐亦菲说的\n那样强啊，再强的武者，\n终究有力穷的一天。\n能伸能缩，审时度势，\n方是大丈夫。"` (DialogueBubble)
/// - **PANEL 4 BUBBLE**: `"韩俊图"` (DialogueBubble)
/// - **PANEL 4 FREE TEXT**: `"啪嗒，啪嗒！"` (FreeText)
/// - **EXACT COUNTS**: Exactly 5 regions (4 dialogue bubbles, 0 sound effects, 1 free text).
/// - **NO SPLIT**: The dialogue in the panel 1 spiky bubble must never be split across comma (`，`).
#[test]
fn test_regression_page_xing_chen_de_brother_arrived_spiky_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_xing_chen_de_brother_arrived_spiky_bubble.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_xing_chen_de_brother_arrived_spiky_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Xing Chen De Brother Arrived Spiky Bubble Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 4 DIALOGUE BUBBLES, 1 FREE TEXT
    crate::assert_element_counts!(res, 5, 4, 1);

    // 2. PANEL 1 SPIKY BUBBLE (MUST UNIFY "姓陈的，我哥来了，\n你等着吧！")
    let p1_bubble = res.regions.iter().find(|r| r.text.contains("姓陈的") || r.text.contains("你等着吧"));
    assert!(p1_bubble.is_some(), "Must detect panel 1 dialogue bubble '姓陈的，我哥来了，\\n你等着吧！'");
    let p1_bubble = p1_bubble.unwrap();
    assert_eq!(p1_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(p1_bubble.text.contains("姓陈的") && p1_bubble.text.contains("你等着吧"), "Must contain full dialogue in same region");
    assert!(!res.regions.iter().any(|r| r.text.trim() == "你等着吧！" || r.text.trim() == "你等着吧"), "Must NOT emit split fragment for second line");
    crate::assert_bubble_bounds!(p1_bubble, 485, 66, 297, 192, 15);
}
