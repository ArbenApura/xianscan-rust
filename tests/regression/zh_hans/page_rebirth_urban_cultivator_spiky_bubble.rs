// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # CHINESE REAL-PAGE REGRESSION: page_rebirth_urban_cultivator_spiky_bubble (RESOLUTION: 827 x 1488)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **VALID DIALOGUE & CREDITS**: 4 real regions (1 top narrative, 1 credits box, 1 oval dialogue bubble, 1 spiky shock bubble).
/// - **TITLE LOGO ARTWORK SUPPRESSION**: Standalone partial title seal "重生" from "重生之都市修仙" must be suppressed as title artwork.
/// - **SPIKY SHOCK BUBBLE FULL UNIFICATION**: Spiky shock bubble ("泗水县，\n陈凡、陈\n北玄？没\n听过呀……") must be unified into 1 single DialogueBubble containing all 4 lines.
/// - **STRICT REGION COUNT**: Exactly 4 regions (2 DialogueBubble, 0 SoundEffect, 2 FreeText).
#[test]
fn test_regression_page_rebirth_urban_cultivator_spiky_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_rebirth_urban_cultivator_spiky_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_rebirth_urban_cultivator_spiky_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh"));
    println!("Chinese Rebirth Urban Cultivator Spiky Bubble Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 4 REGIONS (2 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 2 FREETEXT)
    crate::assert_element_counts!(res, 4, 2, 0, 2);

    // 2. NEGATIVE GUARD: ZERO PARTIAL TITLE LOGO "重生"
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "重生"),
        "Partial artwork title seal '重生' must be suppressed"
    );

    // 3. TOP NARRATIVE: "我叫陈凡，\n你们也可以\n叫我陈北玄\n北玄是老师\n给我的道号。"
    let r0 = res.regions.iter().find(|r| r.text.contains("我叫陈凡")).expect("Top narrative region must exist");
    crate::assert_region_bounds!(r0, xianscan_rust::ml::schemas::RegionKind::FreeText, 568, 161, 151, 144, 8);

    // 4. CREDITS BOX: "大行道动漫出品..."
    let r1 = res.regions.iter().find(|r| r.text.contains("大行道动漫出品")).expect("Credits box region must exist");
    crate::assert_region_bounds!(r1, xianscan_rust::ml::schemas::RegionKind::FreeText, 103, 890, 215, 154, 8);

    // 5. OVAL DIALOGUE BUBBLE: "那陈先\n生的师\n父呢?"
    let r2 = res.regions.iter().find(|r| r.text.contains("那陈先")).expect("Oval dialogue bubble must exist");
    crate::assert_region_bounds!(r2, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 552, 1198, 110, 113, 8);
    crate::assert_bubble_bounds!(r2, 543, 1193, 122, 130, 8);

    // 6. SPIKY SHOCK BUBBLE: "泗水县，\n陈凡、陈\n北玄？没\n听过呀……"
    let spiky_bubble = res.regions.iter().find(|r| r.text.contains("泗水县")).expect("Spiky bubble containing '泗水县' must exist");
    assert!(
        spiky_bubble.text.contains("陈凡") && spiky_bubble.text.contains("北玄") && spiky_bubble.text.contains("听过呀"),
        "Spiky shock bubble must unify all lines into one region, got: '{}'",
        spiky_bubble.text
    );
    crate::assert_region_bounds!(spiky_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 148, 1270, 122, 124, 12);
    crate::assert_bubble_bounds!(spiky_bubble, 111, 1238, 186, 201, 8);
}
