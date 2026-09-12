// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_two_world_peaks_abyss_demon_realm_thought` (RESOLUTION: 900 × 1258)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 3 THOUGHT BUBBLE WITH TOP CIRCLE CHAIN**: `[239, 896, 312, 329]` (`"难道两界峰背后..."`).
///   A circular thought balloon with two attached thought circles at the top (y = 896..945, diameter ≈ 64px).
///   Previously, the 16px glyph fill limit and 28px radius cap prevented morphological opening from severing
///   the top circle, leaving carrier_box as None and positioning typeset_box 25px too high at y = 965.
///   With scaled glyph fill and larger erosion radii, carrier_box is extracted as `[241, 920, 308, 303]`,
///   cleanly severing the top circles and centering typeset_box inside the true circular chamber (cy ≈ 1070).
/// - **EXACT COUNTS**: 1 REGION (1 DIALOGUE BUBBLE, 0 SFX, 0 FREE TEXT).
#[test]
fn test_regression_page_two_world_peaks_abyss_demon_realm_thought() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_two_world_peaks_abyss_demon_realm_thought/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_two_world_peaks_abyss_demon_realm_thought, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));

    // 1. EXACT ELEMENT COUNTS
    crate::assert_element_counts!(res, 1, 1, 0);

    // 2. TARGET THOUGHT BUBBLE: "难道两界峰背后，是深渊魔界脱落的一个碎片，或者是相近的世界？"
    let r0 = res.regions.iter().find(|r| r.text.contains("两界峰")).expect("Must detect r0");
    assert_eq!(r0.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    let bb0 = r0.bubble_box.as_ref().expect("bubble box must exist");
    assert_eq!(bb0.x, 239);
    assert_eq!(bb0.y, 896);
    assert_eq!(bb0.w, 312);
    assert_eq!(bb0.h, 329);

    let cb0 = r0.carrier_box.as_ref().expect("Carrier box must exist for top-circle severed thought bubble");
    assert_eq!(cb0.x, 241);
    assert_eq!(cb0.y, 920);
    assert_eq!(cb0.h, 303);

    let tb0 = r0.typeset_box.as_ref().expect("typeset box must exist");
    let tb_cy = tb0.y + tb0.h / 2;
    let cb_cy = cb0.y + cb0.h / 2;
    assert!((tb_cy - cb_cy).abs() <= 2, "Typeset center ({}) must align with carrier center ({})", tb_cy, cb_cy);

    // 3. TYPESET ENCLOSURE GUARANTEES:
    // TYPESET BOX MUST FULLY ENCLOSE ALL 4 LINES OF CHINESE TEXT (DOWN TO Y=1177) WITHOUT CLIPPING
    assert!(tb0.y <= r0.box_.y, "tb0.y ({}) must cover text top ({})", tb0.y, r0.box_.y);
    assert!(
        tb0.y + tb0.h >= r0.box_.y + r0.box_.h,
        "tb0 bottom ({}) must cover text bottom ({})",
        tb0.y + tb0.h,
        r0.box_.y + r0.box_.h
    );
    assert!(tb0.x <= r0.box_.x, "tb0.x ({}) must cover text left ({})", tb0.x, r0.box_.x);
    assert!(
        tb0.x + tb0.w >= r0.box_.x + r0.box_.w,
        "tb0 right ({}) must cover text right ({})",
        tb0.x + tb0.w,
        r0.box_.x + r0.box_.w
    );
    assert_eq!(tb0.x, 279);
    assert!((tb0.y - 970).abs() <= 6);
    assert_eq!(tb0.w, 232);
    assert!(tb0.h >= 190);
}
