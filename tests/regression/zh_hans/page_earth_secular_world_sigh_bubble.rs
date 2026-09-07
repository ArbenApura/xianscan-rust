// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_earth_secular_world_sigh_bubble` (RESOLUTION: 900 × 1268)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 3 UPRIGHT OVAL BUBBLE WITH SIGH AND ELLIPSIS**: `[766, 1035, 86, 120]` (`"唉"`).
///   The bubble is an upright vertical oval speech bubble containing "唉" followed by ellipsis dots
///   along the bottom. Must not sever the bottom portion of the oval as a false tail cut.
///   `carrier_box` must remain `None`, preserving the entire oval envelope without cutting.
/// - **EXACT COUNTS**: EXACTLY 4 REGIONS (4 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT).
#[test]
fn test_regression_page_earth_secular_world_sigh_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_earth_secular_world_sigh_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_earth_secular_world_sigh_bubble, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Earth Secular World Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, carrier={:?}, typeset={:?}, text='{}', conf={:.2}",
            i, r.kind, r.angle, r.box_, r.carrier_box, r.typeset_box, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 4 REGIONS (4 DIALOGUE BUBBLES, 0 SFX)
    crate::assert_element_counts!(res, 4, 4, 0);

    // 2. PANEL 2 LEFT BUBBLE: "他们肯定是在污蔑您，简直欺人太甚!"
    let slander = res.regions.iter().find(|r| r.text.contains("污蔑") || r.text.contains("欺人太甚"));
    assert!(slander.is_some(), "Must detect panel 2 slander bubble");
    let slander = slander.unwrap();
    assert_eq!(slander.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 3. PANEL 2 RIGHT BUBBLE: "我确实来自地球，也就是你们说的世俗界。"
    let earth = res.regions.iter().find(|r| r.text.contains("地球") || r.text.contains("世俗界"));
    assert!(earth.is_some(), "Must detect panel 2 earth secular world bubble");
    let earth = earth.unwrap();
    assert_eq!(earth.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 4. PANEL 3 MIDDLE REACTION BUBBLE: "啊？"
    let what = res.regions.iter().find(|r| r.text.contains('啊'));
    assert!(what.is_some(), "Must detect panel 3 reaction bubble '啊？'");
    let what = what.unwrap();
    assert_eq!(what.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 5. PANEL 3 RIGHT OVAL SIGH BUBBLE: "唉"
    let sigh = res.regions.iter().find(|r| r.text.contains('唉'));
    assert!(sigh.is_some(), "Must detect panel 3 sigh bubble '唉'");
    let sigh = sigh.unwrap();
    assert_eq!(sigh.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    let bb = sigh.bubble_box.as_ref().expect("bubble box must exist");
    assert_eq!(bb.x, 766);
    assert_eq!(bb.y, 1035);
    assert_eq!(bb.w, 86);
    assert_eq!(bb.h, 120);

    // Must not sever the bottom 40px of the upright oval as a false tail cut
    assert_eq!(sigh.carrier_box, None, "Upright oval bubble with sigh and ellipsis must not have bottom severed as a false tail");

    let tb = sigh.typeset_box.as_ref().expect("typeset box must exist");
    assert!(tb.y >= bb.y && tb.y + tb.h <= bb.y + bb.h, "Typeset box must be bounded inside the bubble: tb={:?}, bb={:?}", tb, bb);
    assert!(tb.h >= 60, "Typeset box height must encompass the dialogue span, got h={}", tb.h);

    let tb_cy = tb.y + tb.h / 2;
    let bb_cy = bb.y + bb.h / 2;
    assert!((tb_cy - bb_cy).abs() <= 5, "Typeset box must be centered inside the oval bubble: tb_cy={}, bb_cy={}", tb_cy, bb_cy);
}
