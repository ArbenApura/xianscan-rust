// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_grandfather_saner_mooncake_split_bubble` (RESOLUTION: 827 × 1729)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 2 UPPER LOBE**: `"嗯……三儿，你和小九从小\n关系最好。从现在起，家族支\n持你，"`
/// - **PANEL 2 LOWER ATTACHED LOBE**: `"去努力修复和\n小九的关系。"`
/// - **PANEL 3 UPPER LOBE**: `"今天吃了鲜肉月饼、蜜汁豆\n腐干、三拼生煎、猪油年糕、\n枣泥拉糕，"`
/// - **PANEL 3 LOWER ATTACHED LOBE**: `"还有什么好\n吃的呢?"`
/// - **PANEL 4 RIGHT QUESTION BUBBLE**: `"好了好了，你不就想问\n我关于陈北玄的事情嘛，\n你问吧。"`
/// - **EXACT COUNTS**: Exactly 5 dialogue bubbles (5 Dialogue Bubbles, 0 Free Text).
#[test]
fn test_regression_page_grandfather_saner_mooncake_split_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_grandfather_saner_mooncake_split_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_grandfather_saner_mooncake_split_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Grandfather San'er Mooncake Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 5 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 5, 5, 0);

    // 2. PANEL 2 UPPER LOBE (GRANDFATHER URGING SAN'ER)
    let p2_upper = res.regions.iter().find(|r| r.text.contains("三儿") || r.text.contains("家族支持你") || r.text.contains("关系最好"));
    assert!(p2_upper.is_some(), "Must detect panel 2 upper lobe (嗯……三儿，你和小九从小...)");
    let p2_upper = p2_upper.unwrap();
    assert_eq!(p2_upper.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!p2_upper.text.contains("修复"), "Panel 2 upper lobe must NOT contain lower lobe text");
    crate::assert_region_bounds!(p2_upper, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 487, 151, 320, 93, 6);

    // 3. PANEL 2 LOWER ATTACHED LOBE (MEND RELATIONSHIP WITH LITTLE JIU)
    let p2_lower = res.regions.iter().find(|r| r.text.contains("修复") || (r.text.contains("小九") && r.text.contains("关系") && !r.text.contains("三儿")));
    assert!(p2_lower.is_some(), "Must detect panel 2 lower attached lobe (去努力修复和小九的关系。)");
    let p2_lower = p2_lower.unwrap();
    assert_eq!(p2_lower.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!p2_lower.text.contains("三儿"), "Panel 2 lower lobe must NOT contain upper lobe text");
    crate::assert_region_bounds!(p2_lower, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 447, 258, 158, 62, 6);

    // 4. PANEL 3 UPPER LOBE (FOOD LIST / MOONCAKE)
    let p3_upper = res.regions.iter().find(|r| r.text.contains("鲜肉月饼") || r.text.contains("枣泥拉糕") || r.text.contains("生煎"));
    assert!(p3_upper.is_some(), "Must detect panel 3 upper lobe (今天吃了鲜肉月饼...)");
    let p3_upper = p3_upper.unwrap();
    assert_eq!(p3_upper.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!p3_upper.text.contains("吃的呢"), "Panel 3 upper lobe must NOT contain lower lobe text");
    crate::assert_region_bounds!(p3_upper, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 167, 886, 298, 93, 6);

    // 5. PANEL 3 LOWER ATTACHED LOBE (WHAT ELSE IS GOOD TO EAT)
    let p3_lower = res.regions.iter().find(|r| r.text.contains("还有什么好") || r.text.contains("吃的呢"));
    assert!(p3_lower.is_some(), "Must detect panel 3 lower attached lobe (还有什么好吃的呢?)");
    let p3_lower = p3_lower.unwrap();
    assert_eq!(p3_lower.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!p3_lower.text.contains("月饼") && !p3_lower.text.contains("拉糕"), "Panel 3 lower lobe must NOT contain upper lobe text");
    crate::assert_region_bounds!(p3_lower, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 324, 976, 132, 63, 6);

    // 6. PANEL 4 CHEN BEIXUAN QUESTION BUBBLE
    let p4 = res.regions.iter().find(|r| r.text.contains("陈北玄") || r.text.contains("好了好了"));
    assert!(p4.is_some(), "Must detect panel 4 question bubble (关于陈北玄的事情嘛...)");
    let p4 = p4.unwrap();
    assert_eq!(p4.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 7. VERIFY BUBBLE CAVITY CLEANING & BOUNDARY PRESERVATION
    crate::assert_bubble_cleaned!(&img, &res);
}
