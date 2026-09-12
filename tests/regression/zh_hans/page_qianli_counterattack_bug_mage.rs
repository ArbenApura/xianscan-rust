// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_qianli_counterattack_bug_mage` (RESOLUTION: 800 × 1868)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 DIALOGUE BUBBLES**:
///   - Top left bubble: `"咦？"` (DialogueBubble)
///   - Top right bubble: `"这……"` (DialogueBubble)
/// - **PANEL 2 SPIKY DIALOGUE BUBBLES**:
///   - Upper left spiky bubble: `"怪好像一次都\n没有打到他。"` (DialogueBubble)
///   - Middle right spiky bubble: `"躲的过程中甚\n至还有机会反\n攻回去？！"` (DialogueBubble)
/// - **PANEL 3 SPIKY DIALOGUE BUBBLES**:
///   - Left spiky bubble: `"千里到底是个什么样的怪物……"` (DialogueBubble with ellipsis recovery)
///   - Right spiky bubble: `"难道他知道\n越级刷怪的\nBUG？"` (DialogueBubble with Latin 'BUG？' recovery, not '三')
///   - Bottom spiky bubble: `"法师怎么会这么\n敏捷暴力……"` (DialogueBubble with bubble association and ellipsis recovery)
/// - **NEGATIVE GUARDS**:
///   - Zero FreeText regions (all 7 regions must be dialogue bubbles).
///   - No watermark `"漫客栈"` in regions.
///   - Region 5 must contain `"BUG"` and must not be cut off as `"三"`.
#[test]
fn test_regression_page_qianli_counterattack_bug_mage() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_qianli_counterattack_bug_mage") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_qianli_counterattack_bug_mage: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Qianli Counterattack Bug Mage Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, bubble_box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.bubble_box, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 0. EXACT ELEMENT COUNTS: EXACTLY 7 REGIONS (7 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT)
    crate::assert_element_counts!(res, 7, 7, 0);

    // 1. TOP LEFT BUBBLE: '咦？'
    let b0 = res.regions.iter().find(|r| r.text.contains("咦"));
    assert!(b0.is_some(), "Must detect top left bubble '咦？'");
    let b0 = b0.unwrap();
    assert_eq!(b0.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b0, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 113, 123, 65, 46, 20);
    crate::assert_bubble_bounds!(b0, 97, 119, 95, 60, 25);

    // 2. TOP RIGHT BUBBLE: '这……'
    let b1 = res.regions.iter().find(|r| r.text.contains('这'));
    assert!(b1.is_some(), "Must detect top right bubble '这……'");
    let b1 = b1.unwrap();
    assert_eq!(b1.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 573, 171, 110, 49, 20);
    crate::assert_bubble_bounds!(b1, 557, 154, 146, 79, 25);

    // 3. UPPER LEFT SPIKY BUBBLE: '怪好像一次都没有打到他。'
    let b2 = res.regions.iter().find(|r| r.text.contains("一次都") || r.text.contains("打到他"));
    assert!(b2.is_some(), "Must detect upper left spiky bubble '怪好像一次都没有打到他。'");
    let b2 = b2.unwrap();
    assert_eq!(b2.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b2, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 128, 314, 202, 76, 15);
    crate::assert_bubble_bounds!(b2, 101, 260, 247, 192, 20);

    // 4. MIDDLE RIGHT SPIKY BUBBLE: '躲的过程中甚至还有机会反攻回去？！'
    let b3 = res.regions.iter().find(|r| r.text.contains("躲的过程") || r.text.contains("反攻回去"));
    assert!(b3.is_some(), "Must detect middle right spiky bubble '躲的过程中甚至还有机会反攻回去？！'");
    let b3 = b3.unwrap();
    assert_eq!(b3.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b3, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 468, 845, 201, 111, 15);
    crate::assert_bubble_bounds!(b3, 465, 823, 205, 142, 25);

    // 5. BOTTOM LEFT SPIKY BUBBLE: '千里到底是个什么样的怪物……'
    let b4 = res.regions.iter().find(|r| r.text.contains("千里到底") || r.text.contains("什么样的怪物"));
    assert!(b4.is_some(), "Must detect bottom left spiky bubble '千里到底是个什么样的怪物'");
    let b4 = b4.unwrap();
    assert_eq!(b4.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b4, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 26, 1312, 176, 115, 15);
    crate::assert_bubble_bounds!(b4, 2, 1280, 221, 192, 25);

    // 6. BOTTOM RIGHT SPIKY BUBBLE: '难道他知道越级刷怪的BUG？'
    let b5 = res.regions.iter().find(|r| r.text.contains("难道他知道") || r.text.contains("越级刷怪"));
    assert!(b5.is_some(), "Must detect bottom right spiky bubble '难道他知道越级刷怪的BUG？'");
    let b5 = b5.unwrap();
    assert_eq!(b5.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(b5.text.to_uppercase().contains("BUG"), "Bubble 5 must capture Latin text 'BUG', got: '{}'", b5.text);
    crate::assert_region_bounds!(b5, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 554, 1364, 170, 109, 15);
    crate::assert_bubble_bounds!(b5, 544, 1332, 193, 181, 20);

    // 7. BOTTOM LOWER SPIKY BUBBLE: '法师怎么会这么敏捷暴力……'
    let b6 = res.regions.iter().find(|r| r.text.contains("法师怎么会") || r.text.contains("敏捷暴力"));
    assert!(b6.is_some(), "Must detect bottom lower spiky bubble '法师怎么会这么敏捷暴力……'");
    let b6 = b6.unwrap();
    assert_eq!(b6.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, "Bubble 6 must be DialogueBubble, not FreeText");
    assert!(b6.bubble_box.is_some(), "Bubble 6 must have an associated bubble_box container");
    crate::assert_region_bounds!(b6, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 358, 1671, 232, 76, 15);
    crate::assert_bubble_bounds!(b6, 362, 1644, 289, 109, 25);

    // 8. NEGATIVE GUARDS:
    assert!(!res.regions.iter().any(|r| r.text.contains("漫客")), "Must suppress publisher watermark '漫客栈'");
}
