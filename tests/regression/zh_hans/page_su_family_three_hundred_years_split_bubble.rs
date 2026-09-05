// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_su_family_three_hundred_years_split_bubble` (RESOLUTION: 900 × 2636)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP-LEFT DIALOGUE**: `"我不仅是小琼的\n男朋友，还是她\n老公，"`
/// - **PANEL 1 QUESTION BUBBLE**: `"你有异议吗？"`
/// - **PANEL 1 SPIKY SHOUT**: `"你!"`
/// - **PANEL 2 LEFT DIALOGUE**: `"哼，你什么你。要不\n是看在你是小琼长\n辈的份上，"`
/// - **PANEL 2 RIGHT DIALOGUE**: `"凭你也有资格\n与我说话？"`
/// - **PANEL 3 UPPER LOBE**: `"素素，这就是你和方明\n德选的女婿吗？不敬长\n辈，目无尊长，"`
/// - **PANEL 3 LOWER ATTACHED LOBE**: `"也配的上我三百\n年苏家的门风？"`
/// - **PANEL 3 RIGHT THOUGHT**: `"糟了"`
/// - **PANEL 4 UPPER LOBE**: `"什么三百年苏家？自\n己给自己脸上贴金罢\n了。你们苏家，就苏\n养浩一人可以看看"`
/// - **PANEL 4 LOWER LOBE**: `"也就靠他一人\n撑着罢了。"`
/// - **EXACT COUNTS**: Exactly 10 dialogue bubbles (10 Dialogue Bubbles, 0 Free Text).
#[test]
fn test_regression_page_su_family_three_hundred_years_split_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_su_family_three_hundred_years_split_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_su_family_three_hundred_years_split_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Su Family Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 10 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 10, 10, 0);

    // 2. PANEL 3 UPPER LOBE (ELDER ACCUSING SUSU OF CHOOSING DISRESPECTFUL SON-IN-LAW)
    let panel3_upper = res.regions.iter().find(|r| r.text.contains("素素") && (r.text.contains("女婿") || r.text.contains("目无尊长")));
    assert!(panel3_upper.is_some(), "Must detect panel 3 upper lobe (素素，这就是你和方明德选的女婿吗...)");
    let panel3_upper = panel3_upper.unwrap();
    assert_eq!(panel3_upper.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!panel3_upper.text.contains("门风"), "Panel 3 upper lobe must NOT contain lower lobe text (门风)");
    assert!(!panel3_upper.text.contains("也配"), "Panel 3 upper lobe must NOT contain lower lobe text (也配)");
    crate::assert_region_bounds!(panel3_upper, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 267, 777, 258, 91, 6);

    // 3. PANEL 3 LOWER ATTACHED LOBE (THREE HUNDRED YEARS SU FAMILY REPUTATION)
    let panel3_lower = res.regions.iter().find(|r| r.text.contains("门风") || r.text.contains("三百") || r.text.contains("也配"));
    assert!(panel3_lower.is_some(), "Must detect panel 3 lower attached lobe (也配的上我三百年的门风？)");
    let panel3_lower = panel3_lower.unwrap();
    assert_eq!(panel3_lower.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!panel3_lower.text.contains("女婿"), "Panel 3 lower lobe must NOT contain upper lobe text (女婿)");
    assert!(!panel3_lower.text.contains("方明"), "Panel 3 lower lobe must NOT contain upper lobe text (方明)");
    crate::assert_region_bounds!(panel3_lower, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 390, 871, 181, 60, 6);

    // 4. PANEL 4 CONNECTED BUBBLE SPLIT VERIFICATION (UPPER AND LOWER LOBES MUST REMAIN SEPARATED)
    let panel4_upper = res.regions.iter().find(|r| r.text.contains("三百年苏家") || r.text.contains("苏养浩"));
    assert!(panel4_upper.is_some(), "Must detect panel 4 upper lobe (什么三百年苏家...)");
    let panel4_upper = panel4_upper.unwrap();
    assert_eq!(panel4_upper.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!panel4_upper.text.contains("撑着罢了"), "Panel 4 upper lobe must NOT contain lower lobe text");

    let panel4_lower = res.regions.iter().find(|r| r.text.contains("撑着罢了") || r.text.contains("靠他一人"));
    assert!(panel4_lower.is_some(), "Must detect panel 4 lower lobe (也就靠他一人撑着罢了。)");
    let panel4_lower = panel4_lower.unwrap();
    assert_eq!(panel4_lower.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!panel4_lower.text.contains("三百年苏家"), "Panel 4 lower lobe must NOT contain upper lobe text");

    // 5. VERIFY BUBBLE CAVITY CLEANING & BOUNDARY PRESERVATION
    crate::assert_bubble_cleaned!(&img, &res);
}
