// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_chen_family_martial_dao_clan` (RESOLUTION: 880 × 1272)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 3 BOTTOM-LEFT CONNECTED BUBBLE**: UPPER LOBE MUST UNIFY 5 LINES INTO A SINGLE REGION:
///   `"不错，以后我\n们陈家，渐渐\n转换成类似陆\n家顾家那样的\n武道世家。"`
///   MUST NOT SPLIT `"武道世家。"` INTO A STANDALONE 1-LINE REGION.
/// - **LOWER LOBE**: PRESERVED AS AN INDEPENDENT 4-LINE UTTERANCE:
///   `"像二伯这样的\n人，随便给他们\n点钱，打发他们\n当势力外围。"`
/// - **EXACT COUNTS**: EXACTLY 7 DIALOGUE BUBBLES (7 DIALOGUE BUBBLES, 0 FREE TEXT).
#[test]
fn test_regression_page_chen_family_martial_dao_clan() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_chen_family_martial_dao_clan/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_chen_family_martial_dao_clan, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Chen Family Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 7 DIALOGUE BUBBLES, 0 FREE TEXT
    crate::assert_element_counts!(res, 7, 7, 0);

    // 2. PANEL 1 TOP-LEFT DIALOGUE BUBBLE
    let p1_left = res.regions.iter().find(|r| r.text.contains("爷爷") && r.text.contains("关系不大"));
    assert!(p1_left.is_some(), "Must detect panel 1 top-left dialogue bubble");
    let p1_left = p1_left.unwrap();
    assert!(p1_left.text.replace('\n', "").contains("那些事就不提了") || p1_left.text.contains("不提了"));

    // 3. PANEL 1 TOP-RIGHT DIALOGUE BUBBLE
    let p1_right = res.regions.iter().find(|r| r.text.contains("势力金钱") || r.text.contains("永恒不易"));
    assert!(p1_right.is_some(), "Must detect panel 1 top-right dialogue bubble");
    let p1_right = p1_right.unwrap();
    assert_eq!(p1_right.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(p1_right.text.contains("虚妄"));

    // 4. PANEL 2 MIDDLE-LEFT DIALOGUE BUBBLE
    let p2_left = res.regions.iter().find(|r| r.text.contains("我们陈家") && r.text.contains("自强"));
    assert!(p2_left.is_some(), "Must detect panel 2 middle-left dialogue bubble");
    let p2_left = p2_left.unwrap();
    assert_eq!(p2_left.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 5. PANEL 2 MIDDLE-RIGHT DIALOGUE BUBBLE
    let p2_right = res.regions.iter().find(|r| r.text.trim().contains("自强？") || r.text.trim().contains("自强?"));
    assert!(p2_right.is_some(), "Must detect panel 2 middle-right question bubble");
    let p2_right = p2_right.unwrap();
    assert_eq!(p2_right.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 6. PANEL 3 BOTTOM-LEFT UPPER LOBE: UNIFIED 5-LINE DIALOGUE
    let upper_lobe = res.regions.iter().find(|r| r.text.contains("不错") && r.text.contains("陈家"));
    assert!(upper_lobe.is_some(), "Must detect unified upper lobe dialogue bubble");
    let upper_lobe = upper_lobe.unwrap();
    assert_eq!(upper_lobe.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(upper_lobe.text.contains("陆家") || upper_lobe.text.contains("顾家"), "Must contain 陆家顾家");
    assert!(upper_lobe.text.contains("武道世家"), "Must unify 武道世家 within the same upper lobe region");

    // NEGATIVE CHECK: ZERO ISOLATED "武道世家" REGIONS
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "武道世家。" || r.text.trim() == "武道世家"),
        "Must NOT have isolated 武道世家 as a separate region"
    );

    // 7. PANEL 3 BOTTOM-LEFT LOWER LOBE: INDEPENDENT 4-LINE UTTERANCE
    let lower_lobe = res.regions.iter().find(|r| r.text.contains("二伯") && r.text.contains("外围"));
    assert!(lower_lobe.is_some(), "Must detect lower lobe dialogue bubble");
    let lower_lobe = lower_lobe.unwrap();
    assert_eq!(lower_lobe.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(lower_lobe.text.contains("随便给他们点钱") || lower_lobe.text.contains("打发他们"));

    // 8. PANEL 3 BOTTOM-RIGHT DIALOGUE BUBBLE
    let p3_right = res.regions.iter().find(|r| r.text.contains("修习功法") || r.text.contains("核心"));
    assert!(p3_right.is_some(), "Must detect panel 3 bottom-right dialogue bubble");
    let p3_right = p3_right.unwrap();
    assert_eq!(p3_right.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(p3_right.text.replace('\n', "").contains("永久传承") || p3_right.text.contains("传承"));
}
