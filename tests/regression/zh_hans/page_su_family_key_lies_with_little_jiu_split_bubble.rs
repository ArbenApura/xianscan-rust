// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_su_family_key_lies_with_little_jiu_split_bubble` (RESOLUTION: 827 × 1749)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP APOLOGY**: `"迟了，晚了啊。我苏\n家终究错过了。陈家\n有此龙，十年后华夏\n谁能不知陈家？"`
/// - **PANEL 2 TOP-LEFT LAMENT**: `"苏家失此龙，\n我死之后，苏\n家还会在吗？"`
/// - **PANEL 2 COMFORT BUBBLE**: `"爷爷，事情\n可能没你想\n的那么严重。"`
/// - **PANEL 3 LEFT OBSERVATION**: `"从陈凡出现的那一刻，\n他就始终将小九护在\n身后，"`
/// - **PANEL 3 RIGHT OBSERVATION**: `"把大部分目光和\n注意力都放在小九\n身上。"`
/// - **PANEL 4 QUESTION BUBBLE**: `"你的意思是？"`
/// - **PANEL 5 UPPER LOBE**: `"在我们眼中，苏家无比重要，\n但在陈凡的眼里，这一切都\n比不上小九的感受，"`
/// - **PANEL 5 LOWER ATTACHED LOBE**: `"一切的关键，还\n在小九身上。"`
/// - **EXACT COUNTS**: Exactly 8 dialogue bubbles (8 Dialogue Bubbles, 0 Free Text).
#[test]
fn test_regression_page_su_family_key_lies_with_little_jiu_split_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_su_family_key_lies_with_little_jiu_split_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_su_family_key_lies_with_little_jiu_split_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Key Lies With Little Jiu Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 8 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 8, 8, 0);

    // 2. PANEL 5 UPPER LOBE (SU FAMILY IMPORTANT BUT NOT COMPARED TO LITTLE JIU'S FEELINGS)
    let p5_upper = res.regions.iter().find(|r| r.text.contains("苏家无比重要") || r.text.contains("小九的感受"));
    assert!(p5_upper.is_some(), "Must detect panel 5 upper lobe (在我们眼中，苏家无比重要...)");
    let p5_upper = p5_upper.unwrap();
    assert_eq!(p5_upper.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!p5_upper.text.contains("一切的关键"), "Panel 5 upper lobe must NOT contain lower lobe text");
    crate::assert_region_bounds!(p5_upper, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 123, 1563, 315, 89, 6);

    // 3. PANEL 5 LOWER ATTACHED LOBE (THE KEY TO EVERYTHING LIES WITH LITTLE JIU)
    let p5_lower = res.regions.iter().find(|r| r.text.contains("一切的关键") || (r.text.contains("关键") && r.text.contains("身上")));
    assert!(p5_lower.is_some(), "Must detect panel 5 lower attached lobe (一切的关键，还在小九身上。)");
    let p5_lower = p5_lower.unwrap();
    assert_eq!(p5_lower.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!p5_lower.text.contains("无比重要"), "Panel 5 lower lobe must NOT contain upper lobe text");
    crate::assert_region_bounds!(p5_lower, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 295, 1653, 183, 61, 6);

    // 4. VERIFY OTHER DIALOGUE BUBBLES ARE INTACT
    assert!(res.regions.iter().any(|r| r.text.contains("迟了，晚了啊")), "Must detect panel 1 regret bubble");
    assert!(res.regions.iter().any(|r| r.text.contains("苏家失此龙")), "Must detect panel 2 lament bubble");
    assert!(res.regions.iter().any(|r| r.text.contains("护在身后") || r.text.contains("那一刻")), "Must detect panel 3 shield bubble");
    assert!(res.regions.iter().any(|r| r.text.contains("你的意思是")), "Must detect panel 4 question bubble");

    // 5. VERIFY BUBBLE CAVITY CLEANING & BOUNDARY PRESERVATION
    crate::assert_bubble_cleaned!(&img, &res);
}
