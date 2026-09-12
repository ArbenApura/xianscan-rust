// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_tree_quiet_sfx_vertical_ellipsis` (RESOLUTION: 800 × 1833)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **VERTICAL 6-DOT ELLIPSIS BUBBLE**: In panel 1, Xiao Ning'er has a small vertical speech bubble containing 6 vertical
///   ellipsis dots (`[274, 28, 40, 50]`). Must not hallucinate alphanumeric noise (`"7\n•\n.\nD\n中\n●\n•\n2\nP"`).
/// - **SFX "静" SEPARATION FROM NARRATION**: In the bottom panel, the large stylized sound effect "静" at the top
///   of the tree must NOT be merged into the vertical narration text (`"肖凝儿睁开眼时聂离早已离开了"`).
#[test]
fn test_regression_page_tree_quiet_sfx_vertical_ellipsis() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_tree_quiet_sfx_vertical_ellipsis/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_tree_quiet_sfx_vertical_ellipsis, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Tree Quiet SFX & Vertical Ellipsis Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, carrier={:?}, typeset={:?}, text='{}', conf={:.2}",
            i, r.kind, r.angle, r.box_, r.carrier_box, r.typeset_box, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 0. EXACT ELEMENT COUNTS: 13 REGIONS (11 DIALOGUE BUBBLES, 2 FREE TEXT, 0 SFX)
    crate::assert_element_counts!(res, 13, 11, 0, 2);

    // 1. VERTICAL SILENCE ELLIPSIS BUBBLE IN PANEL 1 MUST BE SUPPRESSED PER STANDARD SILENCE BUBBLE PROTOCOL
    // AND MUST NEVER HALLUCINATE "7\n•\n.\nD\n中\n●\n•\n2\nP"
    assert!(
        !res.regions.iter().any(|r| {
            r.text.contains('D')
                || r.text.contains('P')
                || (r.text.contains('7') && r.box_.y < 150)
                || (r.box_.y < 120 && r.box_.x >= 250 && r.box_.x <= 330)
        }),
        "Vertical silence ellipsis bubble must be suppressed from translation and not hallucinate 7/D/P"
    );

    // 2. BOTTOM PANEL VERTICAL NARRATION ("肖凝儿睁开眼时聂离早已离开了")
    // MUST NOT MERGE LARGE STYLIZED SFX "静" INTO THE NARRATION TEXT
    let narration_region = res.regions.iter().find(|r| r.text.contains("肖凝儿睁开眼时") || r.text.contains("早已离开"));
    assert!(narration_region.is_some(), "Must detect bottom panel vertical narration");
    let narration = narration_region.unwrap();
    assert!(!narration.text.contains("静"),
        "Vertical narration must NOT be merged with large stylized SFX '静': got '{}'", narration.text);
    assert!(narration.text.contains("肖凝儿睁开眼时") && narration.text.contains("早已离开"),
        "Narration must contain full clause: got '{}'", narration.text);

    // 3. PANEL 1 TOP-LEFT DIALOGUE ("真的不用在意")
    let no_worry = res.regions.iter().find(|r| r.text.contains("不用") && r.text.contains("在意"));
    assert!(no_worry.is_some(), "Must detect panel 1 '真的不用在意' bubble");

    // 4. PANEL 1 CULTIVATION START ("你的极寒之症也好得差不多了...")
    let cold_cured = res.regions.iter().find(|r| r.text.contains("极寒之症") || r.text.contains("修炼吧"));
    assert!(cold_cured.is_some(), "Must detect extreme cold cured bubble");

    // 5. PANEL 2 TIME NARRATION ("很快，卯时到了")
    let time_narration = res.regions.iter().find(|r| r.text.contains("卯时到了") || r.text.contains("很快"));
    assert!(time_narration.is_some(), "Must detect time narration");

    // 6. PANEL 2 GREEN LIGHT ("哇哦,这青光…")
    let green_light = res.regions.iter().find(|r| r.text.contains("青光"));
    assert!(green_light.is_some(), "Must detect green light bubble");

    // 7. PANEL 2 SOUL FORCE NEAR 100 ("灵魂力已经接近一百了!")
    let soul_force = res.regions.iter().find(|r| r.text.contains("灵魂力") && (r.text.contains("一百") || r.text.contains("接近")));
    assert!(soul_force.is_some(), "Must detect soul force bubble");

    // 8. PANEL 3 CLOSEUP NIE LI ("嘿，这一世，肖凝儿也许不用再承受这么多了…")
    let this_life = res.regions.iter().find(|r| r.text.contains("这一世") || r.text.contains("不用再承受"));
    assert!(this_life.is_some(), "Must detect this life reflection bubble");

    // 9. PANEL 4 BREAKTHROUGH ("快要突破了！")
    let breakthrough = res.regions.iter().find(|r| r.text.contains("快要突破"));
    assert!(breakthrough.is_some(), "Must detect breakthrough bubble");
}
