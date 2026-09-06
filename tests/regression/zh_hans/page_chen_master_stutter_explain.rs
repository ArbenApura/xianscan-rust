// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_chen_master_stutter_explain` (RESOLUTION: 880 × 1274)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 2 MIDDLE-LEFT SPEECH BUBBLE**: MUST UNIFY STUTTERING ELLIPSIS LINES INTO A SINGLE 3-LINE DIALOGUE REGION:
///   `"陈...陈大师...\n您听....听我解\n释...."`
///   MUST NOT SPLIT `"陈...陈大师..."` INTO A SEPARATE REGION.
/// - **EXACT COUNTS**: EXACTLY 4 DIALOGUE BUBBLES (4 DIALOGUE BUBBLES, 0 FREE TEXT).
#[test]
fn test_regression_page_chen_master_stutter_explain() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_chen_master_stutter_explain/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_chen_master_stutter_explain, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Chen Master Stutter Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 4 DIALOGUE BUBBLES, 0 FREE TEXT
    crate::assert_element_counts!(res, 4, 4, 0);

    // 2. PANEL 1 TOP-LEFT DIALOGUE BUBBLE
    let p1 = res.regions.iter().find(|r| r.text.contains("陈凡") && r.text.contains("一言九鼎"));
    assert!(p1.is_some(), "Must detect panel 1 top dialogue bubble");
    let p1 = p1.unwrap();
    assert_eq!(p1.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(p1.text.contains("宋家"));

    // 3. PANEL 2 MIDDLE-LEFT SPEECH BUBBLE: UNIFIED STUTTERING DIALOGUE
    let stutter = res.regions.iter().find(|r| r.text.contains("陈大师") || (r.text.contains("陈") && r.text.contains("解释")));
    assert!(stutter.is_some(), "Must detect panel 2 stuttering dialogue bubble");
    let stutter = stutter.unwrap();
    assert_eq!(stutter.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(stutter.text.contains("陈大师") || stutter.text.contains("大师"), "Must contain 陈大师");
    assert!(stutter.text.contains("解释") || stutter.text.contains("听我"), "Must contain 解释 within the same unified bubble");

    // NEGATIVE CHECK: ZERO ISOLATED "陈...陈大师..." REGIONS
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "陈...陈大师..." || r.text.trim() == "陈…陈大师…"),
        "Must NOT have isolated 陈大师 as a separate region"
    );

    // 4. PANEL 3 LEFT DIALOGUE BUBBLE
    let p3_left = res.regions.iter().find(|r| r.text.replace('\n', "").contains("陈某人") || (r.text.contains("某人") && r.text.contains("死了")));
    assert!(p3_left.is_some(), "Must detect panel 3 left dialogue bubble");
    let p3_left = p3_left.unwrap();
    assert_eq!(p3_left.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(p3_left.text.replace('\n', "").contains("管用") || p3_left.text.contains("管"));

    // 5. PANEL 3 RIGHT DIALOGUE BUBBLE
    let p3_right = res.regions.iter().find(|r| r.text.contains("一年过去") || r.text.contains("手段"));
    assert!(p3_right.is_some(), "Must detect panel 3 right dialogue bubble");
    let p3_right = p3_right.unwrap();
    assert_eq!(p3_right.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(p3_right.text.contains("提醒"));
}
