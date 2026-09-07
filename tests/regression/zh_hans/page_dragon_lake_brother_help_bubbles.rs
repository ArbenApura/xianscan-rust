// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_dragon_lake_brother_help_bubbles` (RESOLUTION: 900 × 1257)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 3 REACTION BUBBLE WITH UPWARD TAIL**: `[328, 1039, 143, 165]` (`"哥哥"`).
///   A dialogue balloon with a tail pointing upward to the girl.
///   Carrier extraction isolates the chamber `[339, 1062, 126, 133]`.
///   Previously, the asymmetry guard blocked centering for sole occupants with large margins,
///   locking typeset_box to y = 1079 and leaving the lower 60% of the bubble empty.
///   With the guard refined, typeset_box centers in the carrier chamber at cy ≈ 1128.
/// - **EXACT COUNTS**: 2 REGIONS (2 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT).
#[test]
fn test_regression_page_dragon_lake_brother_help_bubbles() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_dragon_lake_brother_help_bubbles/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_dragon_lake_brother_help_bubbles, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));

    // 1. EXACT ELEMENT COUNTS
    crate::assert_element_counts!(res, 2, 2, 0);

    // 2. PANEL 2 TOP BUBBLE: "啊！啊！\n救我啊！"
    let r0 = res.regions.iter().find(|r| r.text.contains("救我")).expect("Must detect r0");
    assert_eq!(r0.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 3. PANEL 3 REACTION BUBBLE: "哥哥"
    let r1 = res.regions.iter().find(|r| r.text.contains("哥哥")).expect("Must detect r1");
    assert_eq!(r1.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    let bb1 = r1.bubble_box.as_ref().expect("bubble box must exist");
    assert_eq!(bb1.x, 328);
    assert_eq!(bb1.y, 1039);

    let cb1 = r1.carrier_box.as_ref().expect("Carrier box must exist for tail cut");
    let tb1 = r1.typeset_box.as_ref().expect("typeset box must exist");

    // Typeset box must center inside the carrier chamber
    let tb_cy = tb1.y + tb1.h / 2;
    let cb_cy = cb1.y + cb1.h / 2;
    assert!((tb_cy - cb_cy).abs() <= 2, "Typeset center ({}) must align with carrier chamber center ({})", tb_cy, cb_cy);
}
