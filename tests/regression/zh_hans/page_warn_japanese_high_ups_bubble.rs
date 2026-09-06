// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_warn_japanese_high_ups_bubble` (RESOLUTION: 827 × 1507)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP-RIGHT SPEECH BUBBLE**: MUST UNIFY 4 LINES INTO A SINGLE DIALOGUE REGION:
///   `"主人，他们既然来警\n告，必然是日国高层\n对你已经不满了。您\n要不要考虑回华国？"`
///   MUST NOT SPLIT AFTER LINE 2 ("必然是日国高层").
/// - **EXACT COUNTS**: EXACTLY 4 (OR 5 IF SILENCE BUBBLE IS DETECTED) DIALOGUE BUBBLES.
#[test]
fn test_regression_page_warn_japanese_high_ups_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_warn_japanese_high_ups_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_warn_japanese_high_ups_bubble, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Warn Japanese High-Ups Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 4 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 4, 4, 0);

    // 2. PANEL 1 TOP-RIGHT SPEECH BUBBLE: UNIFIED 4-LINE DIALOGUE
    let p1_right = res.regions.iter().find(|r| r.text.contains("日国高层") || r.text.contains("回华国"));
    assert!(p1_right.is_some(), "Must detect panel 1 top-right dialogue bubble");
    let p1_right = p1_right.unwrap();
    assert_eq!(p1_right.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(p1_right.text.contains("既然来警告") || p1_right.text.contains("来警"), "Must contain warning line");
    assert!(p1_right.text.contains("日国高层"), "Must contain 日国高层");
    assert!(p1_right.text.contains("不满了") || p1_right.text.contains("不满"), "Must contain 不满");
    assert!(p1_right.text.contains("回华国"), "Must contain 回华国 within the same unified bubble");

    // NEGATIVE CHECK: ZERO SPLIT REGIONS ENDING AT "必然是日国高层"
    assert!(
        !res.regions.iter().any(|r| r.text.trim().ends_with("必然是日国高层")),
        "Must NOT split after line 2"
    );

    // 3. PANEL 2 LEFT SPEECH BUBBLE
    let p2_left = res.regions.iter().find(|r| r.text.contains("还有一些事情") || r.text.contains("等做完了"));
    assert!(p2_left.is_some(), "Must detect panel 2 left dialogue bubble");
    let p2_left = p2_left.unwrap();
    assert_eq!(p2_left.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 4. PANEL 2 RIGHT SPEECH BUBBLE
    let p2_right = res.regions.iter().find(|r| r.text.contains("神社") || r.text.contains("主意"));
    assert!(p2_right.is_some(), "Must detect panel 2 right dialogue bubble");
    let p2_right = p2_right.unwrap();
    assert_eq!(p2_right.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 5. PANEL 3 BOTTOM SPEECH BUBBLE
    let p3 = res.regions.iter().find(|r| r.text.contains("想什么") || r.text.replace('\n', "").contains("你知道我在想什么"));
    assert!(p3.is_some(), "Must detect panel 3 dialogue bubble");
    let p3 = p3.unwrap();
    assert_eq!(p3.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
}
