// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_jiang_churan_car_relatives_lunch` (RESOLUTION: 827 × 1169)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 NARRATION FREE TEXT**: `"姜初然，这个自己\n前世曾经喜欢过\n被伤过，又淡忘的\n女孩。"`
/// - **PANEL 2 LEFT DIALOGUE BUBBLE**: `"然然，以后\n你有什么事\n情，尽管找\n我。"`
/// - **PANEL 2 RIGHT DIALOGUE BUBBLE**: `"好啊，到时\n候你可别忘\n记自己说的\n话哦。"`
/// - **PANEL 3 LEFT THOUGHT FREE TEXT**: `"我父亲是政府\n高官，母亲有\n资产千万的公\n司，追求我的\n人都是有权有\n势的，有什么\n事会劳烦到\n你？装逼犯。"`
/// - **PANEL 3 RIGHT UPPER LOBE DIALOGUE BUBBLE**: `"咱们先去你\n家，你把行\n李放下，然\n后再去我们\n家吃中午饭"`
/// - **PANEL 3 RIGHT LOWER LOBE DIALOGUE BUBBLE**: `"把你叔叔\n介绍给你\n认识。"`
/// - **PANEL 3 BOTTOM RIGHT FLOATING BUBBLE**: `"好的"`
/// - **EXACT COUNTS**: Exactly 7 regions (5 Dialogue Bubbles, 2 Free Text).
#[test]
fn test_regression_page_jiang_churan_car_relatives_lunch() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_jiang_churan_car_relatives_lunch/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_jiang_churan_car_relatives_lunch: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Jiang Churan Car Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 7 TOTAL REGIONS (5 BUBBLES, 2 FREE TEXT)
    crate::assert_element_counts!(res, 7, 5, 2);

    // 2. PANEL 1 NARRATION FREE TEXT
    let narration = res.regions.iter().find(|r| r.text.contains("姜初然"));
    assert!(narration.is_some(), "Must detect panel 1 narration free text");
    let narration = narration.unwrap();
    assert_eq!(narration.kind, xianscan_rust::ml::schemas::RegionKind::FreeText);
    assert!(narration.text.contains("前世曾经喜欢过"));

    // 3. PANEL 2 LEFT BUBBLE
    let left_bubble = res.regions.iter().find(|r| r.text.contains("然然，以后"));
    assert!(left_bubble.is_some(), "Must detect panel 2 left dialogue bubble");
    let left_bubble = left_bubble.unwrap();
    assert_eq!(left_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(left_bubble.text.contains("尽管找"));

    // 4. PANEL 2 RIGHT BUBBLE
    let right_bubble = res.regions.iter().find(|r| r.text.contains("好啊，到时"));
    assert!(right_bubble.is_some(), "Must detect panel 2 right dialogue bubble");
    let right_bubble = right_bubble.unwrap();
    assert_eq!(right_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(right_bubble.text.contains("自己说的"));

    // 5. PANEL 3 LEFT THOUGHT FREE TEXT
    let thought_grid = res.regions.iter().find(|r| r.text.contains("我父亲是政府"));
    assert!(thought_grid.is_some(), "Must detect panel 3 left thought free text");
    let thought_grid = thought_grid.unwrap();
    assert_eq!(thought_grid.kind, xianscan_rust::ml::schemas::RegionKind::FreeText);
    assert!(thought_grid.text.contains("装逼犯"));

    // 6. PANEL 3 RIGHT UPPER LOBE (5 LINES)
    let upper_lunch_lobe = res.regions.iter().find(|r| r.text.contains("咱们先去你"));
    assert!(upper_lunch_lobe.is_some(), "Must detect panel 3 upper lunch bubble lobe");
    let upper_lunch_lobe = upper_lunch_lobe.unwrap();
    assert_eq!(upper_lunch_lobe.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!upper_lunch_lobe.text.contains("把你叔叔"), "Upper lunch lobe must NOT contain lower lobe text");
    assert!(upper_lunch_lobe.text.contains("吃中午饭"), "Upper lunch lobe must contain 吃中午饭");

    // 7. PANEL 3 RIGHT LOWER LOBE (3 LINES)
    let lower_uncle_lobe = res.regions.iter().find(|r| r.text.contains("把你叔叔"));
    assert!(lower_uncle_lobe.is_some(), "Must detect panel 3 lower uncle bubble lobe");
    let lower_uncle_lobe = lower_uncle_lobe.unwrap();
    assert_eq!(lower_uncle_lobe.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!lower_uncle_lobe.text.contains("咱们先去"), "Lower uncle lobe must NOT contain upper lobe text");
    assert!(lower_uncle_lobe.text.contains("介绍给你") || lower_uncle_lobe.text.contains("认识"), "Lower uncle lobe must contain 介绍给你认识");

    // 8. PANEL 3 FLOATING OKAY BUBBLE
    let okay_bubble = res.regions.iter().find(|r| r.text.contains("好的"));
    assert!(okay_bubble.is_some(), "Must detect panel 3 bottom right floating okay bubble");
    let okay_bubble = okay_bubble.unwrap();
    assert_eq!(okay_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
}
