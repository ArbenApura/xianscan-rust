// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_chen_fan_ordinary_friend_split` (RESOLUTION: 827 × 1169)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 2 LEFT UPPER LOBE**: `"这个陈凡\n人如其名，\n只能做个\n普通朋友，"`
/// - **PANEL 2 LEFT LOWER LOBE**: `"相比起李\n易晨他们\n差远了。"`
/// - **PANEL 2 CENTER UPPER LOBE**: `"小凡，然\n然也要上\n高三了，"`
/// - **PANEL 2 CENTER LOWER LOBE**: `"以后你可\n要好好照\n顾她哦。"`
/// - **PANEL 3 RIGHT DIALOGUE BUBBLE**: `"放心吧，唐姨\n，以后然然就\n是我的妹妹，\n我会保护她的。"`
/// - **EXACT COUNTS**: Exactly 5 dialogue bubbles (5 Dialogue Bubbles, 0 Free Text).
#[test]
fn test_regression_page_chen_fan_ordinary_friend_split() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_chen_fan_ordinary_friend_split/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_chen_fan_ordinary_friend_split: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Chen Fan Car Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 5 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 5, 5, 0);

    // 2. PANEL 2 LEFT UPPER LOBE (4 LINES)
    let left_upper_lobe = res.regions.iter().find(|r| r.text.contains("这个陈凡") || r.text.contains("人如其名"));
    assert!(left_upper_lobe.is_some(), "Must detect panel 2 left upper lobe (这个陈凡...)");
    let left_upper_lobe = left_upper_lobe.unwrap();
    assert_eq!(left_upper_lobe.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!left_upper_lobe.text.contains("差远了"), "Left upper lobe must NOT contain lower lobe text");
    assert!(left_upper_lobe.text.contains("普通朋友"), "Left upper lobe must contain 普通朋友");

    // 3. PANEL 2 LEFT LOWER LOBE (3 LINES)
    let left_lower_lobe = res.regions.iter().find(|r| r.text.contains("相比起李") || r.text.contains("差远了"));
    assert!(left_lower_lobe.is_some(), "Must detect panel 2 left lower lobe (相比起李...)");
    let left_lower_lobe = left_lower_lobe.unwrap();
    assert_eq!(left_lower_lobe.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!left_lower_lobe.text.contains("这个陈凡"), "Left lower lobe must NOT contain upper lobe text");
    assert!(left_lower_lobe.text.contains("差远了"), "Left lower lobe must contain 差远了");

    // 4. PANEL 2 CENTER UPPER LOBE
    let center_upper_lobe = res.regions.iter().find(|r| r.text.contains("小凡，然"));
    assert!(center_upper_lobe.is_some(), "Must detect panel 2 center upper lobe");
    let center_upper_lobe = center_upper_lobe.unwrap();
    assert_eq!(center_upper_lobe.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(center_upper_lobe.text.contains("高三了"));

    // 5. PANEL 2 CENTER LOWER LOBE
    let center_lower_lobe = res.regions.iter().find(|r| r.text.contains("以后你可"));
    assert!(center_lower_lobe.is_some(), "Must detect panel 2 center lower lobe");
    let center_lower_lobe = center_lower_lobe.unwrap();
    assert_eq!(center_lower_lobe.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(center_lower_lobe.text.contains("顾她哦") || center_lower_lobe.text.contains("好好照"));

    // 6. PANEL 3 RIGHT DIALOGUE BUBBLE
    let right_bubble = res.regions.iter().find(|r| r.text.contains("放心吧，唐姨") || r.text.contains("保护她的"));
    assert!(right_bubble.is_some(), "Must detect panel 3 right dialogue bubble");
    let right_bubble = right_bubble.unwrap();
    assert_eq!(right_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 7. VERIFY BUBBLE CAVITY CLEANING & BOUNDARY PRESERVATION
    crate::assert_bubble_cleaned!(&img, &res);
}
