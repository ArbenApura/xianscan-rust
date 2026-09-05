// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # CHINESE REAL-PAGE REGRESSION: page_ise_grand_shrine_self_defense_split (RESOLUTION: 827 x 1503)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 DIALOGUE BUBBLE**: "英龙华大人，您们是\n为了左须神社被灭\n一事而来？"
/// - **PANEL 2 MIDDLE OVAL BUBBLE**: "不错，陈北玄\n欺我日国无人，\n竟然敢踏平\n左须神社，\n我们绝不能放任。"
/// - **PANEL 2 LOWER CIRCLE BUBBLE**: "左须神在神社之中，\n势力近乎神境，\n竟然没打过\n陈北玄？"
/// - **PANEL 3 BOTTOM OVAL BUBBLE UNIFICATION**: Single speech balloon ("伊势大神宫要出手吗？\n他们如果袖手不管，\n那就只能奏请内阁，\n动用自卫队了。") must remain unified into 1 DialogueBubble rather than split across question mark.
/// - **STRICT ELEMENT COUNTS**: Exactly 4 regions (4 DialogueBubble, 0 SoundEffect, 0 FreeText).
#[test]
fn test_regression_page_ise_grand_shrine_self_defense_split() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_ise_grand_shrine_self_defense_split/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_ise_grand_shrine_self_defense_split: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Ise Grand Shrine Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 4 REGIONS (4 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT)
    crate::assert_element_counts!(res, 4, 4, 0, 0);

    // 2. PANEL 1: "英龙华大人..."
    let r0 = res.regions.iter().find(|r| r.text.contains("英龙华")).expect("Panel 1 bubble must exist");
    assert!(r0.text.contains("左须神社"), "Panel 1 bubble must contain '左须神社'");
    crate::assert_region_bounds!(r0, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 87, 113, 184, 124, 6);
    crate::assert_bubble_bounds!(r0, 47, 37, 271, 269, 6);

    // 3. PANEL 2 MIDDLE OVAL: "不错，陈北玄..."
    let r1 = res.regions.iter().find(|r| r.text.contains("陈北玄") && r.text.contains("欺我日国")).expect("Panel 2 middle bubble must exist");
    assert!(r1.text.contains("踏平") && r1.text.contains("放任"), "Panel 2 middle bubble must contain full speech");
    crate::assert_region_bounds!(r1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 306, 555, 156, 216, 6);
    crate::assert_bubble_bounds!(r1, 265, 483, 217, 379, 6);

    // 4. PANEL 2 LOWER CIRCLE: "左须神在神社之中..."
    let r2 = res.regions.iter().find(|r| r.text.contains("势力近乎神境")).expect("Panel 2 lower circle bubble must exist");
    crate::assert_region_bounds!(r2, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 428, 906, 172, 160, 6);
    crate::assert_bubble_bounds!(r2, 387, 818, 241, 292, 6);

    // 5. PANEL 3 BOTTOM OVAL BUBBLE: MUST REMAIN UNIFIED
    let bottom_bubble = res.regions.iter().find(|r| r.text.contains("伊势大神宫") || r.text.contains("自卫队")).expect("Bottom oval bubble must exist");
    assert!(
        bottom_bubble.text.contains("伊势大神宫") && bottom_bubble.text.contains("袖手不管") && bottom_bubble.text.contains("自卫队"),
        "Bottom dialogue bubble must unify all lines into one single region without splitting on question mark, got: '{}'",
        bottom_bubble.text
    );
    crate::assert_region_bounds!(bottom_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 62, 1243, 222, 154, 6);
    crate::assert_bubble_bounds!(bottom_bubble, 5, 1198, 333, 239, 6);
}
