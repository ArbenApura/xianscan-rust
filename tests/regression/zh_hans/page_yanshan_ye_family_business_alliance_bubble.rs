// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_yanshan_ye_family_business_alliance_bubble` (RESOLUTION: 827 × 1533)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP-LEFT SPEECH BUBBLE**: MUST UNIFY ALL LINES INTO A SINGLE DIALOGUE REGION:
///   `"只有整合半个\n华夏的商界与\n地下世界，才\n有与燕山叶家\n一战之力。"`
///   MUST NOT SPLIT INTO 2 SEPARATE FRAGMENTS SHARING THE SAME BUBBLE BOX.
/// - **EXACT COUNTS**: 5 DIALOGUE REGIONS TOTAL.
#[test]
fn test_regression_page_yanshan_ye_family_business_alliance_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_yanshan_ye_family_business_alliance_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_yanshan_ye_family_business_alliance_bubble, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Yanshan Ye Family Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 5 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 5, 5, 0);

    // 2. PANEL 1 TOP-LEFT SPEECH BUBBLE: UNIFIED MULTI-LINE DIALOGUE
    let p1_left = res.regions.iter().find(|r| r.text.contains("燕山叶家") || r.text.contains("商界") || r.text.contains("整合半个"));
    assert!(p1_left.is_some(), "Must detect panel 1 top-left dialogue bubble");
    let p1_left = p1_left.unwrap();
    assert_eq!(p1_left.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(p1_left.text.contains("整合半个") || p1_left.text.contains("商界"), "Must contain opening line");
    assert!(p1_left.text.contains("燕山叶家") || p1_left.text.contains("一战之力"), "Must contain concluding clause in the same unified bubble");

    // NEGATIVE CHECK: ZERO SPLIT REGIONS STARTING WITH "有与燕山叶家"
    assert!(
        !res.regions.iter().any(|r| r.text.trim().starts_with("有与燕山叶家")),
        "Must NOT split after line 2"
    );

    // 3. PANEL 1 TOP-RIGHT BUBBLE
    let p1_right = res.regions.iter().find(|r| r.text.contains("只是太子") || r.text.contains("陈家"));
    assert!(p1_right.is_some(), "Must detect panel 1 top-right dialogue bubble");

    // 4. PANEL 2 TOP-LEFT BUBBLE
    let p2_left = res.regions.iter().find(|r| r.text.contains("陈北玄") && r.text.contains("林家"));
    assert!(p2_left.is_some(), "Must detect panel 2 top-left dialogue bubble");

    // 5. PANEL 2 BOTTOM-RIGHT BUBBLE
    let p2_right = res.regions.iter().find(|r| r.text.contains("那是那是"));
    assert!(p2_right.is_some(), "Must detect panel 2 bottom-right dialogue bubble");

    // 6. PANEL 3 EXCLAMATION BUBBLE
    let p3_bubble = res.regions.iter().find(|r| r.text.contains("中海商盟") || r.text.contains("宰割"));
    assert!(p3_bubble.is_some(), "Must detect panel 3 exclamation bubble");
}
