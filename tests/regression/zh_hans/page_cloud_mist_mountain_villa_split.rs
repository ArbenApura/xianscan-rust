// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_cloud_mist_mountain_villa_split` (RESOLUTION: 827 × 1169)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP-RIGHT LOBE**: `"据说早晨起\n来，开门就\n是云雾缭绕，\n云山云海。"`
/// - **PANEL 1 BOTTOM-LEFT LOBE**: `"真正的高档\n豪宅都在云\n雾山的半山\n腰。"`
/// - **PANEL 2 LEFT UPPER LOBE**: `"不过我觉\n得我这房\n子已经挺\n好了，"`
/// - **PANEL 2 LEFT LOWER LOBE**: `"云雾山庄\n什么的都\n是随便想\n想。"`
/// - **PANEL 2 RIGHT UPPER LOBE**: `"嗯……唐姨\n要是真的喜\n欢，以后我\n赚钱了"`
/// - **PANEL 2 RIGHT LOWER LOBE**: `"送您几套，\n让您天天都\n能一起床就\n看到云海。"`
/// - **PANEL 3 LEFT SMALL BUBBLE**: `"啊?"`
/// - **EXACT COUNTS**: Exactly 7 dialogue bubbles (7 Dialogue Bubbles, 0 Free Text).
#[test]
fn test_regression_page_cloud_mist_mountain_villa_split() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_cloud_mist_mountain_villa_split/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_cloud_mist_mountain_villa_split: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Cloud Mist Mountain Villa Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 7 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 7, 7, 0);

    // 2. PANEL 1 TOP-RIGHT LOBE (4 LINES)
    let p1_right_lobe = res.regions.iter().find(|r| r.text.contains("据说早晨起"));
    assert!(p1_right_lobe.is_some(), "Must detect panel 1 top-right lobe (据说早晨起...)");
    let p1_right_lobe = p1_right_lobe.unwrap();
    assert_eq!(p1_right_lobe.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!p1_right_lobe.text.contains("真正的高档"), "P1 top-right lobe must NOT contain left lobe text");
    assert!(p1_right_lobe.text.contains("云山云海"), "P1 top-right lobe must contain 云山云海");

    // 3. PANEL 1 BOTTOM-LEFT LOBE (4 LINES)
    let p1_left_lobe = res.regions.iter().find(|r| r.text.contains("真正的高档"));
    assert!(p1_left_lobe.is_some(), "Must detect panel 1 bottom-left lobe (真正的高档...)");
    let p1_left_lobe = p1_left_lobe.unwrap();
    assert_eq!(p1_left_lobe.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!p1_left_lobe.text.contains("据说早晨起"), "P1 bottom-left lobe must NOT contain right lobe text");
    assert!(p1_left_lobe.text.contains("半山") || p1_left_lobe.text.contains("腰"), "P1 bottom-left lobe must contain 半山腰");

    // 4. PANEL 2 LEFT UPPER LOBE (4 LINES)
    let p2_left_upper = res.regions.iter().find(|r| r.text.contains("不过我觉"));
    assert!(p2_left_upper.is_some(), "Must detect panel 2 left upper lobe (不过我觉得...)");
    let p2_left_upper = p2_left_upper.unwrap();
    assert_eq!(p2_left_upper.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!p2_left_upper.text.contains("云雾山庄"), "P2 left upper lobe must NOT contain lower lobe text");
    assert!(p2_left_upper.text.contains("挺好了") || p2_left_upper.text.contains("好了"), "P2 left upper lobe must contain 好了");

    // 5. PANEL 2 LEFT LOWER LOBE (4 LINES)
    let p2_left_lower = res.regions.iter().find(|r| r.text.contains("云雾山庄"));
    assert!(p2_left_lower.is_some(), "Must detect panel 2 left lower lobe (云雾山庄...)");
    let p2_left_lower = p2_left_lower.unwrap();
    assert_eq!(p2_left_lower.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!p2_left_lower.text.contains("不过我觉"), "P2 left lower lobe must NOT contain upper lobe text");
    assert!(p2_left_lower.text.contains("随便想") || p2_left_lower.text.contains("想"), "P2 left lower lobe must contain 随便想想");

    // 6. PANEL 2 RIGHT UPPER LOBE
    let p2_right_upper = res.regions.iter().find(|r| r.text.contains("唐姨") || r.text.contains("赚钱了"));
    assert!(p2_right_upper.is_some(), "Must detect panel 2 right upper lobe");
    let p2_right_upper = p2_right_upper.unwrap();
    assert_eq!(p2_right_upper.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 7. PANEL 2 RIGHT LOWER LOBE
    let p2_right_lower = res.regions.iter().find(|r| r.text.contains("送您几套") || r.text.contains("看到云海"));
    assert!(p2_right_lower.is_some(), "Must detect panel 2 right lower lobe");
    let p2_right_lower = p2_right_lower.unwrap();
    assert_eq!(p2_right_lower.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 8. PANEL 3 LEFT SMALL BUBBLE
    let p3_huh = res.regions.iter().find(|r| r.text.contains("啊"));
    assert!(p3_huh.is_some(), "Must detect panel 3 huh bubble");
    let p3_huh = p3_huh.unwrap();
    assert_eq!(p3_huh.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
}
