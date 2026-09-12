// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_outer_realm_enemies_asura_battlefield` (RESOLUTION: 900 × 1274)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 2 SPEECH BUBBLE WITH UPWARD TAIL**: `[708, 712, 166, 162]` (`"怎么了？"`).
///   The bubble is an oval speech balloon with an upward-pointing tail extending to y = 712.
///   Previously in production, `carrierBox` was `None`, causing `typesetBox` to be positioned at y = 770
///   (jammed into the upper tail neck, leaving empty space in the lower half).
///   In the current pipeline, `carrier_box` is successfully extracted as `[709, 760, 164, 111]`,
///   severing the upward pointer and centering the `typeset_box` at y = 792 in the oval cavity.
/// - **PANEL 2 TOP BUBBLE WITH DOWNWARD TAIL**: `[637, 32, 228, 217]` (`"小凡，这里是？"`).
///   Extracts carrier chamber `[648, 40, 210, 164]`, severing downward tail into character hair.
/// - **EXACT COUNTS**: EXACTLY 5 REGIONS (5 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT).
#[test]
fn test_regression_page_outer_realm_enemies_asura_battlefield() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_outer_realm_enemies_asura_battlefield/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_outer_realm_enemies_asura_battlefield, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));

    // 1. EXACT ELEMENT COUNTS: 5 DIALOGUE BUBBLES, 0 SFX
    crate::assert_element_counts!(res, 5, 5, 0);

    // 2. PANEL 2 TOP BUBBLE: "小凡，这里是？"
    let r0 = res.regions.iter().find(|r| r.text.contains("小凡")).expect("Must detect r0");
    assert_eq!(r0.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    let bb0 = r0.bubble_box.as_ref().expect("bubble box must exist");
    assert_eq!(bb0.x, 637);
    assert_eq!(bb0.y, 32);
    let cb0 = r0.carrier_box.as_ref().expect("carrier box must exist");
    assert_eq!(cb0.h, 164);
    let tb0 = r0.typeset_box.as_ref().expect("typeset box must exist");
    assert_eq!(tb0.y, 76);
    assert_eq!(tb0.h, 92);
    let tb0_cy = tb0.y + tb0.h / 2;
    let cb0_cy = cb0.y + cb0.h / 2;
    assert!((tb0_cy - cb0_cy).abs() <= 1, "Typeset center must align with carrier center");

    // 3. PANEL 2 REACTION BUBBLE WITH UPWARD TAIL: "怎么了？"
    let r1 = res.regions.iter().find(|r| r.text.contains("怎么了")).expect("Must detect r1");
    assert_eq!(r1.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    let bb1 = r1.bubble_box.as_ref().expect("bubble box must exist");
    assert_eq!(bb1.x, 708);
    assert_eq!(bb1.y, 712);
    assert_eq!(bb1.w, 166);
    assert_eq!(bb1.h, 162);

    // Carrier box must sever upward tail (y=712..760) and keep oval cavity (y=760..871)
    let cb1 = r1.carrier_box.as_ref().expect("Carrier box must be published for upward tail bubble");
    assert_eq!(cb1.x, 709);
    assert_eq!(cb1.y, 760);
    assert_eq!(cb1.w, 164);
    assert_eq!(cb1.h, 111);

    // Typeset box must center vertically at y = 792 inside the carrier chamber
    let tb1 = r1.typeset_box.as_ref().expect("typeset box must exist");
    assert_eq!(tb1.y, 792, "Typeset box Y must be vertically centered in the h=111 oval chamber");
    assert_eq!(tb1.h, 46);
    let tb_cy = tb1.y + tb1.h / 2;
    let cb_cy = cb1.y + cb1.h / 2;
    assert!((tb_cy - cb_cy).abs() <= 1, "Typeset center must align with carrier chamber center");

    // 4. PANEL 3 LEFT BUBBLE: "恐怕那些凶\n兽就是所谓\n的外域大敌\n了。"
    let r2 = res.regions.iter().find(|r| r.text.contains("外域大敌")).expect("Must detect r2");
    assert_eq!(r2.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 5. PANEL 3 RIGHT DUAL-BUBBLES
    let r3 = res.regions.iter().find(|r| r.text.contains("昆墟")).expect("Must detect r3");
    assert_eq!(r3.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    let r4 = res.regions.iter().find(|r| r.text.contains("星空")).expect("Must detect r4");
    assert_eq!(r4.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
}
