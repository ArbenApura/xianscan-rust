// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_tang_jianfeng_cloud_mist_spring_split_bubble` (RESOLUTION: 827 × 1609)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP APOLOGY BUBBLE**: `"陈先生，我错了，求您\n放过我宁家一条生路吧。"`
/// - **PANEL 1 RIGHT QUESTION BUBBLE**: `"你儿子欲设陷阱诬\n我，我断他四肢，让\n他一生反省，你服吗？"`
/// - **PANEL 1 LEFT GASP BUBBLE**: `"啊！这……"`
/// - **PANEL 1 BOTTOM RIGHT REACTION**: `"居然会是这样\n的进展。"`
/// - **PANEL 2 SUBMISSION SHOUT**: `"我...心服口服！"`
/// - **PANEL 3 UPPER LOBE**: `"至于你，汤剑锋。我拒\n了你入股云雾灵泉，\n你如此记恨，"`
/// - **PANEL 3 LOWER ATTACHED LOBE**: `"我若今天放\n你走，"`
/// - **EXACT COUNTS**: Exactly 7 dialogue bubbles (7 Dialogue Bubbles, 0 Free Text).
#[test]
fn test_regression_page_tang_jianfeng_cloud_mist_spring_split_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_tang_jianfeng_cloud_mist_spring_split_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_tang_jianfeng_cloud_mist_spring_split_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Tang Jianfeng Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 7 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 7, 7, 0);

    // 2. PANEL 3 UPPER LOBE (AS FOR YOU TANG JIANFENG REJECTED CLOUD MIST SPIRIT SPRING)
    let panel3_upper = res.regions.iter().find(|r| r.text.contains("汤剑锋") || r.text.contains("云雾灵泉") || r.text.contains("至于你"));
    assert!(panel3_upper.is_some(), "Must detect panel 3 upper lobe (至于你，汤剑锋...)");
    let panel3_upper = panel3_upper.unwrap();
    assert_eq!(panel3_upper.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!panel3_upper.text.contains("放你走") && !panel3_upper.text.contains("今天放"), "Panel 3 upper lobe must NOT contain lower lobe text");
    crate::assert_region_bounds!(panel3_upper, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 308, 1130, 244, 92, 6);

    // 3. PANEL 3 LOWER ATTACHED LOBE (IF I LET YOU WALK AWAY TODAY)
    let panel3_lower = res.regions.iter().find(|r| r.text.contains("放你走") || (r.text.contains("今天放") && r.text.contains("你走")));
    assert!(panel3_lower.is_some(), "Must detect panel 3 lower attached lobe (我若今天放你走，)");
    let panel3_lower = panel3_lower.unwrap();
    assert_eq!(panel3_lower.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!panel3_lower.text.contains("汤剑锋") && !panel3_lower.text.contains("云雾灵泉"), "Panel 3 lower lobe must NOT contain upper lobe text");
    crate::assert_region_bounds!(panel3_lower, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 389, 1230, 156, 63, 6);

    // 4. VERIFY OTHER DIALOGUE BUBBLES ARE INTACT
    assert!(res.regions.iter().any(|r| r.text.contains("心服口服")), "Must detect submission bubble (我...心服口服！)");
    assert!(res.regions.iter().any(|r| r.text.contains("陷阱") || r.text.contains("四肢")), "Must detect question bubble (断他四肢...)");

    // 5. VERIFY BUBBLE CAVITY CLEANING & BOUNDARY PRESERVATION
    crate::assert_bubble_cleaned!(&img, &res);
}
