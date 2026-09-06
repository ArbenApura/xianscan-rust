// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_look_at_the_sky_meteor_spiky_bubble` (RESOLUTION: 827 × 1671)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP-LEFT SPIKY SPEECH BUBBLE**: MUST DETECT `"快看！看天上！"`:
///   MUST NOT BE OMITTED OR DROPPED BY THE DETECTOR.
/// - **EXACT COUNTS**: 5 DIALOGUE BUBBLES TOTAL.
#[test]
fn test_regression_page_look_at_the_sky_meteor_spiky_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_look_at_the_sky_meteor_spiky_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_look_at_the_sky_meteor_spiky_bubble, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Look At The Sky Meteor Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. MUST DETECT PANEL 1 TOP-LEFT SPIKY BUBBLE
    let p1_bubble = res.regions.iter().find(|r| r.text.contains("快看") || r.text.contains("看天上"));
    assert!(p1_bubble.is_some(), "Must detect panel 1 top-left spiky speech bubble '快看！看天上！'");
    let p1_bubble = p1_bubble.unwrap();
    assert_eq!(p1_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 2. PANEL 2 THREE SPIKY BUBBLES
    assert!(res.regions.iter().any(|r| r.text.contains("不不不")), "Must detect panel 2 '不不不！'");
    assert!(res.regions.iter().any(|r| r.text.contains("陨石")), "Must detect panel 2 '是陨石！'");
    assert!(res.regions.iter().any(|r| r.text.contains("快逃")), "Must detect panel 2 '快逃啊！！！！'");

    // 3. PANEL 3 SPIKY BUBBLE
    assert!(res.regions.iter().any(|r| r.text.contains("五行术法") || r.text.contains("天陨术")), "Must detect panel 3 '五行术法·天陨术！'");

    // 4. EXACT COUNTS: 5 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 5, 5, 0);
}
