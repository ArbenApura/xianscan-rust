// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # CHINESE REAL-PAGE REGRESSION: page_six_shrines_spiky_bubble_split (RESOLUTION: 827 x 1254)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP-LEFT BUBBLE**: "六座吗？"
/// - **PANEL 1 TOP-RIGHT OVAL BUBBLE**: "虽然御神笛，走的是\n再精不再多的路线，\n但若六尊神将齐出，\n恐怕真正的神境也会\n被撕成粉碎吧。"
/// - **PANEL 2 SPIKY BUBBLE UNIFICATION**: Single spiky bubble ("您不会真的要去那些神社吧。\n与他们为敌，就是与整个\n日国为敌，您哪怕是\n神境强者，也不是\n军队的对一") must remain unified into 1 DialogueBubble rather than split across period.
/// - **PANEL 3 BOTTOM-LEFT CIRCLE**: "你话"
/// - **PANEL 3 BOTTOM-RIGHT BUBBLE**: "太多了。"
/// - **STRICT ELEMENT COUNTS**: Exactly 5 regions (5 DialogueBubble, 0 SoundEffect, 0 FreeText).
#[test]
fn test_regression_page_six_shrines_spiky_bubble_split() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_six_shrines_spiky_bubble_split/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_six_shrines_spiky_bubble_split: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Six Shrines Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 5 REGIONS (5 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT)
    crate::assert_element_counts!(res, 5, 5, 0, 0);

    // 2. PANEL 1 TOP-LEFT: "六座吗？"
    let r0 = res.regions.iter().find(|r| r.text.contains("六座")).expect("Top-left bubble must exist");
    crate::assert_region_bounds!(r0, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 55, 66, 100, 34, 15);
    crate::assert_bubble_bounds!(r0, 21, 13, 196, 139, 15);

    // 3. PANEL 1 TOP-RIGHT: "虽然御神笛..."
    let r1 = res.regions.iter().find(|r| r.text.contains("御神笛")).expect("Top-right oval bubble must exist");
    assert!(
        r1.text.contains("神境") && r1.text.contains("撕成粉碎"),
        "Top-right bubble must contain full speech"
    );
    crate::assert_region_bounds!(r1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 511, 92, 183, 208, 15);
    crate::assert_bubble_bounds!(r1, 463, 23, 279, 348, 15);

    // 4. PANEL 2 MIDDLE SPIKY BUBBLE: MUST REMAIN UNIFIED
    let spiky = res.regions.iter().find(|r| r.text.contains("神社吧") || r.text.contains("与他们为敌")).expect("Middle spiky bubble must exist");
    assert!(
        spiky.text.contains("神社吧") && spiky.text.contains("与他们为敌") && spiky.text.contains("日国为敌") && spiky.text.contains("军队"),
        "Spiky dialogue bubble must unify all 5 lines into one single region without splitting on period, got: '{}'",
        spiky.text
    );
    crate::assert_region_bounds!(spiky, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 72, 504, 252, 210, 8);
    crate::assert_bubble_bounds!(spiky, 28, 430, 349, 386, 8);

    // 5. PANEL 3 BOTTOM-LEFT: "你话"
    let r3 = res.regions.iter().find(|r| r.text.contains("你话")).expect("Bottom-left '你话' bubble must exist");
    crate::assert_region_bounds!(r3, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 37, 900, 48, 38, 15);
    crate::assert_bubble_bounds!(r3, 22, 869, 84, 100, 15);

    // 6. PANEL 3 BOTTOM-RIGHT: "太多了。"
    let r4 = res.regions.iter().find(|r| r.text.contains("太多了")).expect("Bottom-right '太多了。' bubble must exist");
    crate::assert_region_bounds!(r4, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 515, 914, 98, 36, 15);
    crate::assert_bubble_bounds!(r4, 471, 872, 185, 121, 15);
}
