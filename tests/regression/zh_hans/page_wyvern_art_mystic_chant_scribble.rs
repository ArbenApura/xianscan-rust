// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_wyvern_art_mystic_chant_scribble` (RESOLUTION: 800 × 1536)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **MYSTICAL CHANT SCRIBBLE BUBBLE FILTERING**: In panel 1, Nie Li recites an ancient chant represented by
///   deliberate vertical cursive squiggles / decorative runes (`[264, 43, 150, 266]`). Must be filtered/skipped
///   rather than producing multi-script garbage (`"Cー×ミうルーた\n买上，自\n日131去1分名\n7\n1"`).
/// - **CLEAN DIALOGUE EXTRACTION**: Captures technique chant instructions, breakthrough reaction, and gratitude.
#[test]
fn test_regression_page_wyvern_art_mystic_chant_scribble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_wyvern_art_mystic_chant_scribble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_wyvern_art_mystic_chant_scribble, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Wyvern Art Chant Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, carrier={:?}, typeset={:?}, text='{}', conf={:.2}",
            i, r.kind, r.angle, r.box_, r.carrier_box, r.typeset_box, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 0. EXACT ELEMENT COUNTS: 8 DIALOGUE BUBBLES, 0 FREE TEXT, 0 SFX
    crate::assert_element_counts!(res, 8, 8, 0, 0);

    // 1. SCRIBBLE CHANT BUBBLE MUST BE SUPPRESSED / SKIPPED
    let scribble_leak = res.regions.iter().find(|r| {
        r.text.contains("Cー")
            || r.text.contains("ルー")
            || r.text.contains("131")
            || (r.box_.y < 320 && r.box_.x > 250 && r.box_.x < 420)
    });
    assert!(scribble_leak.is_none(),
        "Decorative squiggly chant bubble must be suppressed from translation: found {:?}",
        scribble_leak.map(|r| (&r.text, &r.box_)));

    // 2. PANEL 1 TOP-LEFT BUBBLE ("记住哦")
    let remember = res.regions.iter().find(|r| r.text.contains("记住"));
    assert!(remember.is_some(), "Must detect panel 1 remember bubble");

    // 3. PANEL 1 TOP-RIGHT BUBBLE ("按照这个口诀运转灵魂力的话……")
    let technique = res.regions.iter().find(|r| r.text.contains("口诀") && r.text.contains("灵魂力"));
    assert!(technique.is_some(), "Must detect technique instruction bubble");

    // 4. PANEL 2 SHOUT BUBBLE ("好强！")
    let powerful = res.regions.iter().find(|r| r.text.contains("好强"));
    assert!(powerful.is_some(), "Must detect panel 2 '好强！' bubble");

    // 5. PANEL 3 CALLOUT ("聂离……")
    let callout = res.regions.iter().find(|r| r.text.contains("聂离"));
    assert!(callout.is_some(), "Must detect panel 3 callout bubble");

    // 6. PANEL 3 TECHNIQUE NAME ("这篇功法叫做风雷翼龙决。")
    let art_name = res.regions.iter().find(|r| r.text.contains("风雷") && r.text.contains("翼龙"));
    assert!(art_name.is_some(), "Must detect Wind-Thunder Wyvern Art name bubble");

    // 7. PANEL 3 TECHNIQUE SUITABILITY ("这是最适合你的功法！")
    let suitability = res.regions.iter().find(|r| r.text.contains("适合你"));
    assert!(suitability.is_some(), "Must detect suitability bubble");

    // 8. PANEL 4 GRATITUDE ("真的谢谢你！聂离，先是帮我治疗...")
    let gratitude = res.regions.iter().find(|r| r.text.contains("谢谢你") && r.text.contains("治疗"));
    assert!(gratitude.is_some(), "Must detect gratitude bubble");

    // 9. PANEL 4 NIE LI HUMBLE RESPONSE ("大家都是朋友，互相帮助是应该的吧！")
    let humble = res.regions.iter().find(|r| r.text.contains("都是朋友") || r.text.contains("互相帮助"));
    assert!(humble.is_some(), "Must detect humble friend bubble");
}
