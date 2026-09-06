// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_bullets_cannons_god_descends_bubble` (RESOLUTION: 827 × 1403)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP-LEFT SPEECH BUBBLE**: MUST UNIFY ALL 4 LINES INTO A SINGLE DIALOGUE REGION:
///   `"这是神灵啊，除了神灵\n降世，谁有这样的\n威能？可以不惧\n子弹大炮？"`
///   MUST NOT SPLIT AFTER "可以不惧" BEFORE "子弹大炮？".
/// - **EXACT COUNTS**: 4 REGIONS TOTAL (PANEL 1 TOP-LEFT, PANEL 1 TOP-RIGHT, PANEL 2 CENTER, PANEL 3 NARRATION BOX).
#[test]
fn test_regression_page_bullets_cannons_god_descends_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_bullets_cannons_god_descends_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_bullets_cannons_god_descends_bubble, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Bullets Cannons God Descends Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 4 REGIONS (ALL DIALOGUE BUBBLE CONTAINERS)
    crate::assert_element_counts!(res, 4, 4, 0);

    // 2. PANEL 1 TOP-LEFT SPEECH BUBBLE: UNIFIED 4-LINE DIALOGUE
    let p1_left = res.regions.iter().find(|r| r.text.contains("子弹大炮") || r.text.contains("神灵啊") || r.text.contains("不惧"));
    assert!(p1_left.is_some(), "Must detect panel 1 top-left dialogue bubble");
    let p1_left = p1_left.unwrap();
    assert_eq!(p1_left.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(p1_left.text.contains("神灵") || p1_left.text.contains("降世"), "Must contain opening god descension text");
    assert!(p1_left.text.contains("子弹大炮"), "Must contain 子弹大炮 in the same unified balloon");

    // NEGATIVE CHECK: ZERO SPLIT REGIONS CONTAINING ONLY "子弹大炮？"
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "子弹大炮？" || r.text.trim() == "子弹大炮"),
        "Must NOT split line 4 into an isolated region"
    );

    // 3. PANEL 1 TOP-RIGHT SPIKY BUBBLE
    let p1_right = res.regions.iter().find(|r| r.text.contains("神灵赎罪"));
    assert!(p1_right.is_some(), "Must detect panel 1 top-right spiky bubble");

    // 4. PANEL 2 CENTER SPIKY BUBBLE
    let p2_center = res.regions.iter().find(|r| r.text.contains("陈北玄") && r.text.contains("大巫神"));
    assert!(p2_center.is_some(), "Must detect panel 2 center spiky bubble");

    // 5. PANEL 3 BOTTOM NARRATION BOX
    let p3_bottom = res.regions.iter().find(|r| r.text.contains("黑巫教总坛") || r.text.contains("黑山圣地"));
    assert!(p3_bottom.is_some(), "Must detect panel 3 narration box");
}
