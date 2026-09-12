// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_sacred_family_worship_vertical_ellipsis` (RESOLUTION: 800 × 1820)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **VERTICAL 6-DOT ELLIPSIS BUBBLE**: In panel 3, Xiao Ning'er has a vertical speech bubble containing 6 vertical
///   ellipsis dots (`……`). Must not hallucinate alphanumeric noise (`"e\ne\n8\ne\ne\ne\nF"`).
/// - **PROPER DIALOGUE EXTRACTION**: Captures Sacred Family discussion, worship reaction, crystal tests, and techniques.
#[test]
fn test_regression_page_sacred_family_worship_vertical_ellipsis() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_sacred_family_worship_vertical_ellipsis/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_sacred_family_worship_vertical_ellipsis, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Sacred Family Worship Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, carrier={:?}, typeset={:?}, text='{}', conf={:.2}",
            i, r.kind, r.angle, r.box_, r.carrier_box, r.typeset_box, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 0. EXACT ELEMENT COUNTS: 15 REGIONS (14 DIALOGUE BUBBLES, 1 FREE TEXT, 0 SFX)
    crate::assert_element_counts!(res, 15, 14, 0, 1);

    // 1. VERTICAL SILENCE ELLIPSIS BUBBLE IN PANEL 3 MUST BE SUPPRESSED PER STANDARD SILENCE BUBBLE PROTOCOL
    // AND MUST NEVER HALLUCINATE "e\ne\n8\ne\ne\ne\nF"
    assert!(
        !res.regions.iter().any(|r| {
            r.text.contains("e\n")
                || r.text.contains('8')
                || r.text.contains('F')
                || (r.box_.y >= 740 && r.box_.y <= 810 && r.box_.x >= 250 && r.box_.x <= 310)
        }),
        "Vertical silence ellipsis bubble must be suppressed from translation and not hallucinate e/8/F"
    );

    // 2. PANEL 1 TOP DIALOGUE ("对了，聂离，你得罪了神圣世家...")
    let warning = res.regions.iter().find(|r| r.text.contains("神圣世家") && r.text.contains("得罪"));
    assert!(warning.is_some(), "Must detect panel 1 warning bubble");

    // 3. PANEL 1 WYVERN FAMILY BACKGROUND ("他们神圣世家卑鄙无耻...")
    let wyvern_bg = res.regions.iter().find(|r| r.text.contains("翼龙世家") || r.text.contains("卑鄙无耻"));
    assert!(wyvern_bg.is_some(), "Must detect wyvern family background bubble");

    // 4. PANEL 2 NIE LI CONFIDENCE ("啊，我心中自然有数...")
    let confidence = res.regions.iter().find(|r| r.text.contains("心中自然有数") || r.text.contains("好要面子"));
    assert!(confidence.is_some(), "Must detect Nie Li confidence bubble");

    // 5. PANEL 2 COUNTERMEASURE ("嘿，不过等他们来对付我的时候...")
    let countermeasure = res.regions.iter().find(|r| r.text.contains("反制") || r.text.contains("手段"));
    assert!(countermeasure.is_some(), "Must detect countermeasure bubble");

    // 6. PANEL 3 SOUL CRYSTAL PROPOSAL ("你回去之后弄一块没有用过的灵魂水晶...")
    let crystal_req = res.regions.iter().find(|r| r.text.contains("灵魂水") && r.text.contains("测试"));
    assert!(crystal_req.is_some(), "Must detect soul crystal proposal bubble");

    // 7. PANEL 3 THOUGHT BUBBLE ("肖凝儿确实是个值得信赖的伙伴...")
    let partner_thought = res.regions.iter().find(|r| r.text.contains("值得信赖") || r.text.contains("伙伴"));
    assert!(partner_thought.is_some(), "Must detect partner thought bubble");

    // 8. PANEL 4 THREE CRYSTALS ("没有用过的灵魂水晶，我这里有三块呢。")
    let three_crystals = res.regions.iter().find(|r| r.text.contains("三块") || r.text.contains("这里有"));
    assert!(three_crystals.is_some(), "Must detect three crystals bubble");

    // 9. PANEL 5 START TESTING ("不用给我，你把灵魂力注入其中就行。")
    let infuse_power = res.regions.iter().find(|r| r.text.contains("灵魂力注入") || r.text.contains("不用给我"));
    assert!(infuse_power.is_some(), "Must detect infuse power bubble");
}
