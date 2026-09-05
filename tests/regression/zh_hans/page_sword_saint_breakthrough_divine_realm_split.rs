// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # CHINESE REAL-PAGE REGRESSION: page_sword_saint_breakthrough_divine_realm_split (RESOLUTION 827 x 1920)
///
/// ## PURPOSE AND BEHAVIOR TESTED
/// - **PANEL 1 TOP-RIGHT BUBBLE**: "哼！破！"
/// - **PANEL 1 TOP-LEFT BUBBLE**: "逃！"
/// - **PANEL 2 RIGHT BUBBLE**: "啊！呀！\n呀！呀！"
/// - **PANEL 3 LEFT BUBBLE**: "啊！！！"
/// - **PANEL 4 LEFT BUBBLE**: "到底谁赢了？"
/// - **PANEL 4 RIGHT BUBBLE**: "肯定是剑圣大人赢了。\n你看那漫天的白色刀气，\n就是剑圣大人的千鸟斩。"
/// - **PANEL 5 BOTTOM BUBBLE UNIFICATION**: Bottom dialogue balloon must remain unified into
///   one single region ("老师说不定真突破了。\n我日国又要多出一位神境！") instead of splitting across the period.
/// - **STRICT ELEMENT COUNTS**: Exactly 7 regions (7 DialogueBubble, 0 SoundEffect, 0 FreeText).
#[test]
fn test_regression_page_sword_saint_breakthrough_divine_realm_split() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_sword_saint_breakthrough_divine_realm_split/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_sword_saint_breakthrough_divine_realm_split: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Sword Saint Breakthrough Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 7 REGIONS (7 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT)
    crate::assert_element_counts!(res, 7, 7, 0, 0);

    // 2. PANEL 1 TOP-RIGHT: "哼！破！"
    let r0 = res.regions.iter().find(|r| r.text.contains("哼") || r.text.contains("破")).expect("Panel 1 '哼！破！' bubble must exist");
    crate::assert_region_bounds!(r0, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 605, 29, 84, 32, 8);
    crate::assert_bubble_bounds!(r0, 563, 11, 172, 83, 8);

    // 3. PANEL 1 TOP-LEFT: "逃！"
    let r1 = res.regions.iter().find(|r| r.text.contains("逃")).expect("Panel 1 '逃！' bubble must exist");
    crate::assert_region_bounds!(r1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 87, 261, 42, 30, 8);
    crate::assert_bubble_bounds!(r1, 33, 194, 155, 180, 8);

    // 4. PANEL 2 RIGHT: "啊！呀！呀！呀！"
    let r2 = res.regions.iter().find(|r| r.text.contains("啊！呀") || r.text.contains("呀！呀")).expect("Panel 2 '啊！呀！' bubble must exist");
    crate::assert_region_bounds!(r2, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 706, 596, 72, 64, 8);
    crate::assert_bubble_bounds!(r2, 683, 549, 111, 133, 8);

    // 5. PANEL 3 LEFT: "啊！！！"
    let r3 = res.regions.iter().find(|r| r.text.starts_with("啊") && (r.text.contains("！") || r.text.contains("!")) && r.box_.y > 800 && r.box_.y < 1050).expect("Panel 3 '啊！！！' bubble must exist");
    crate::assert_region_bounds!(r3, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 44, 977, 64, 32, 8);
    crate::assert_bubble_bounds!(r3, 32, 917, 110, 149, 8);

    // 6. PANEL 4 LEFT: "到底谁赢了？"
    let r4 = res.regions.iter().find(|r| r.text.contains("到底谁赢了")).expect("Panel 4 '到底谁赢了？' bubble must exist");
    crate::assert_region_bounds!(r4, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 69, 1158, 114, 28, 8);
    crate::assert_bubble_bounds!(r4, 32, 1096, 234, 171, 8);

    // 7. PANEL 4 RIGHT: "肯定是剑圣大人赢了..."
    let r5 = res.regions.iter().find(|r| r.text.contains("肯定是剑圣大人赢了")).expect("Panel 4 '肯定是剑圣大人赢了' bubble must exist");
    assert!(
        r5.text.contains("千鸟斩") && r5.text.contains("刀气"),
        "Panel 4 bubble must contain full speech"
    );
    crate::assert_region_bounds!(r5, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 493, 1108, 172, 76, 8);
    crate::assert_bubble_bounds!(r5, 459, 1091, 237, 140, 8);

    // 8. PANEL 5 BOTTOM: MUST REMAIN UNIFIED (NOT SPLIT ON PERIOD)
    let bottom = res.regions.iter().find(|r| r.text.contains("老师说不定真突破了") || r.text.contains("多出一位神境")).expect("Panel 5 bottom bubble must exist");
    assert!(
        bottom.text.contains("老师说不定真突破了") && bottom.text.contains("多出一位神境"),
        "Bottom dialogue balloon must unify both lines into one single region without splitting on period, got: '{}'",
        bottom.text
    );
    crate::assert_region_bounds!(bottom, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 531, 1497, 198, 62, 8);
    crate::assert_bubble_bounds!(bottom, 489, 1417, 296, 224, 8);
}
