// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_tang_hao_twin_martial_souls_exclamation_shard` (RESOLUTION: 900 x 1268)
///
/// ## PURPOSE & BEHAVIOR TESTED
/// - Verify that panel 1 dialogue bubbles are cleanly detected:
///   1. `……你！……` (Tang Hao stunned speech bubble)
///   2. `天生双武魂……\n先天满魂力……` (Tang Hao continuous speech bubble)
///   3. `爸？` (Tang San questioning bubble)
/// - Verify that panel 2 stylized exclamation mark reaction shard is NOT detected as dialogue `"三"`.
/// - Verify that total element count is exactly 3 dialogue bubbles.
#[test]
fn test_regression_page_tang_hao_twin_martial_souls_exclamation_shard() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_tang_hao_twin_martial_souls_exclamation_shard/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_tang_hao_twin_martial_souls_exclamation_shard, fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!(
        "Douluo Twin Martial Souls Page detected {} regions:",
        res.regions.len()
    );
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2} deg, box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: 3 REGIONS (3 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT)
    crate::assert_element_counts!(res, 3, 3, 0);

    // 2. PANEL 1 TOP-LEFT BUBBLE: "……你！……"
    let you = res
        .regions
        .iter()
        .find(|r| r.text.contains("你") && (r.text.contains('!') || r.text.contains('！')));
    assert!(you.is_some(), "Must detect panel 1 stunned speech bubble '……你！……'");
    let you = you.unwrap();
    assert_eq!(you.kind, RegionKind::DialogueBubble);

    // 3. PANEL 1 TOP-CENTER BUBBLE: "天生双武魂……\n先天满魂力……"
    let twin_souls = res
        .regions
        .iter()
        .find(|r| r.text.contains("双武魂") && r.text.contains("满魂力"));
    assert!(
        twin_souls.is_some(),
        "Must detect panel 1 speech bubble '天生双武魂……\\n先天满魂力……'"
    );
    let twin_souls = twin_souls.unwrap();
    assert_eq!(twin_souls.kind, RegionKind::DialogueBubble);

    // 4. PANEL 1 RIGHT BUBBLE: "爸？"
    let dad = res
        .regions
        .iter()
        .find(|r| r.text.contains("爸"));
    assert!(dad.is_some(), "Must detect panel 1 speech bubble '爸？'");
    let dad = dad.unwrap();
    assert_eq!(dad.kind, RegionKind::DialogueBubble);

    // 5. NEGATIVE GUARD: PANEL 2 EXCLAMATION MARK REACTION SHARD MUST NOT BE RECOGNIZED AS "三"
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "三"),
        "Must NOT misrecognize stylized exclamation mark reaction shard as '三'"
    );
    assert!(
        !res.regions.iter().any(|r| r.box_.y > 800),
        "Panel 2 must not produce false dialogue bubble from reaction shard"
    );
}
