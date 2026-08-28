// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_ye_ziyun_noble_status_grow_up_vow` (RESOLUTION: 800 × 1590)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP BUBBLE**: `"怪人！"` (DialogueBubble)
/// - **PANEL 2 TOP BUBBLE**: `"我知道你肯定\n也是光辉之城的\n世家子弟，但我\n劝你，不要打那\n个女生的主意"` (DialogueBubble)
/// - **PANEL 2 BOTTOM BUBBLE**: `"她的身份很高贵很神秘\n据说她入学的时候，院长亲\n自帮她安排的宿舍"` (DialogueBubble)
/// - **PANEL 3 LEFT BUBBLE**: `"她是我的\n女人!"` (DialogueBubble)
/// - **PANEL 3 RIGHT NARRATION**: `"紫芸这小丫头\n，什么时候才\n会长成那个风\n情万种的美丽\n女人呢?"` (FreeText)
/// - **PANEL 4 LEFT BUBBLE**: `"我会守护着\n你一起慢慢\n长大的！"` (DialogueBubble)
/// - **PANEL 4 RIGHT BUBBLE**: `"这个纨绔子弟，从刚\n才开始就一直肆无忌惮\n的看我。哼！这家伙要\n是敢欺负我，我一定让\n他好看！"` (DialogueBubble)
/// - **EXACT COUNTS**: Exactly 7 regions (6 DialogueBubbles, 0 SoundEffects, 1 FreeText).
/// - **ZERO WATERMARK ARTIFACTS**: Suppress panel-corner watermark logo `"澳祥"` / `"漫客"`.
#[test]
fn test_regression_page_ye_ziyun_noble_status_grow_up_vow() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_ye_ziyun_noble_status_grow_up_vow") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_ye_ziyun_noble_status_grow_up_vow: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Ye Ziyun Noble Status Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 6 BUBBLES, 0 SFX, 1 FREETEXT (7 TOTAL)
    crate::assert_element_counts!(res, 7, 6, 0, 1);

    // 2. PANEL 1 TOP BUBBLE: '怪人！'
    let r0 = res.regions.iter().find(|r| r.text.contains("怪人"));
    assert!(r0.is_some(), "Must detect panel 1 top bubble '怪人！'");
    let r0 = r0.unwrap();
    assert_eq!(r0.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r0, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 461, 60, 94, 38, 8);
    crate::assert_bubble_bounds!(r0, 431, 25, 170, 122, 12);
    crate::assert_region_angle!(r0, 0.0, 1.5);

    // 3. PANEL 2 TOP BUBBLE: '我知道你肯定也是光辉之城的世家子弟...'
    let r1 = res.regions.iter().find(|r| r.text.contains("世家子弟") || r.text.contains("光辉之城"));
    assert!(r1.is_some(), "Must detect panel 2 top bubble");
    let r1 = r1.unwrap();
    assert_eq!(r1.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 231, 444, 161, 144, 10);
    crate::assert_bubble_bounds!(r1, 225, 427, 176, 191, 12);
    crate::assert_region_angle!(r1, 0.0, 1.5);

    // 4. PANEL 2 BOTTOM BUBBLE: '她的身份很高贵很神秘...'
    let r2 = res.regions.iter().find(|r| r.text.contains("身份很高贵") || r.text.contains("安排的宿舍"));
    assert!(r2.is_some(), "Must detect panel 2 bottom bubble");
    let r2 = r2.unwrap();
    assert_eq!(r2.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r2, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 19, 730, 270, 86, 10);
    crate::assert_bubble_bounds!(r2, 1, 718, 309, 111, 12);
    crate::assert_region_angle!(r2, 0.0, 1.5);

    // 5. PANEL 3 LEFT BUBBLE: '她是我的女人!'
    let r3 = res.regions.iter().find(|r| r.text.contains("她是我的") || r.text.contains("女人"));
    assert!(r3.is_some(), "Must detect panel 3 left bubble '她是我的女人!'");
    let r3 = r3.unwrap();
    assert_eq!(r3.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r3, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 50, 949, 126, 88, 10);
    crate::assert_bubble_bounds!(r3, 37, 884, 163, 222, 12);
    crate::assert_region_angle!(r3, 0.0, 1.5);

    // 6. PANEL 3 RIGHT NARRATION: '紫芸这小丫头...'
    let r4 = res.regions.iter().find(|r| r.text.contains("紫芸这小丫头") || r.text.contains("风情万种"));
    assert!(r4.is_some(), "Must detect panel 3 right narration");
    let r4 = r4.unwrap();
    assert_eq!(r4.kind, xianscan_rust::ml::schemas::RegionKind::FreeText);
    crate::assert_region_bounds!(r4, xianscan_rust::ml::schemas::RegionKind::FreeText, 423, 875, 138, 172, 12);
    crate::assert_region_angle!(r4, 0.0, 1.5);

    // 7. PANEL 4 LEFT BUBBLE: '我会守护着你一起慢慢长大的！'
    let r5 = res.regions.iter().find(|r| r.text.contains("我会守护着") || r.text.contains("慢慢长大"));
    assert!(r5.is_some(), "Must detect panel 4 left bubble");
    let r5 = r5.unwrap();
    assert_eq!(r5.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r5, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 329, 1188, 150, 126, 10);
    crate::assert_bubble_bounds!(r5, 315, 1167, 184, 197, 12);
    crate::assert_region_angle!(r5, 0.0, 1.5);

    // 8. PANEL 4 RIGHT BUBBLE: '这个纨绔子弟...'
    let r6 = res.regions.iter().find(|r| r.text.contains("纨绔子弟") || r.text.contains("肆无忌惮"));
    assert!(r6.is_some(), "Must detect panel 4 right bubble");
    let r6 = r6.unwrap();
    assert_eq!(r6.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r6, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 522, 1188, 231, 148, 10);
    crate::assert_bubble_bounds!(r6, 507, 1176, 272, 172, 12);
    crate::assert_region_angle!(r6, 0.0, 1.5);

    // 9. NEGATIVE GUARDS: SUPPRESS WATERMARK AND NOISE CHARACTERS
    assert!(!res.regions.iter().any(|r| r.text.trim() == "澳祥" || r.text.trim() == "漫客"), "Must not detect watermark noise '澳祥' or '漫客'");
}
