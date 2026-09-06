// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_white_hair_sister_is_that_so_dots` (RESOLUTION: 900 × 1276)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 2 CIRCULAR BUBBLE WITH ELLIPSIS DOTS**: `[207, 561, 110, 108]` (`"是吗"`).
///   The bubble is a 1:1 circular speech bubble containing "是吗" followed by 6 ellipsis dots
///   along the bottom. Must not sever the bottom half of the circle as a false tail cut.
///   The typeset box must center in the full circular chamber cavity (`cy ≈ 615`) rather than
///   jamming into the top hemisphere (`cy = 590`).
/// - **EXACT COUNTS**: EXACTLY 6 REGIONS (6 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT).
#[test]
fn test_regression_page_white_hair_sister_is_that_so_dots() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_white_hair_sister_is_that_so_dots/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_white_hair_sister_is_that_so_dots, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans White Hair Sister Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, carrier={:?}, typeset={:?}, text='{}', conf={:.2}",
            i, r.kind, r.angle, r.box_, r.carrier_box, r.typeset_box, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 6 REGIONS (6 DIALOGUE BUBBLES, 0 SFX)
    crate::assert_element_counts!(res, 6, 6, 0);

    // 2. PANEL 2 CIRCULAR BUBBLE WITH ELLIPSIS DOTS ("是吗")
    let is_so = res.regions.iter().find(|r| r.text.contains("是吗"));
    assert!(is_so.is_some(), "Must detect panel 2 circular bubble '是吗'");
    let is_so = is_so.unwrap();
    assert_eq!(is_so.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    let bb = is_so.bubble_box.as_ref().expect("bubble box must exist");
    assert_eq!(bb.x, 207);
    assert_eq!(bb.y, 561);
    assert_eq!(bb.w, 110);
    assert_eq!(bb.h, 108);


    // Must not publish a false tail cut severing the bottom half of the circle
    assert_eq!(is_so.carrier_box, None, "Circular bubble with ellipsis dots must not have bottom severed as a false tail");

    let tb = is_so.typeset_box.as_ref().expect("typeset box must exist");
    let tb_cy = tb.y + tb.h / 2;
    let bb_cy = bb.y + bb.h / 2;
    assert!((tb_cy - bb_cy).abs() <= 5, "Typeset box must be centered inside the circle: tb_cy={}, bb_cy={}", tb_cy, bb_cy);

    // 3. PANEL 1 TOP-LEFT BUBBLE ("我闭关潜修...")
    let seclusion = res.regions.iter().find(|r| r.text.contains("闭关") || r.text.contains("潜修"));
    assert!(seclusion.is_some(), "Must detect panel 1 seclusion bubble");

    // 4. PANEL 1 TOP-RIGHT BUBBLE ("此女已经达到神境...")
    let divine = res.regions.iter().find(|r| r.text.contains("神境") || r.text.contains("千夜雪"));
    assert!(divine.is_some(), "Must detect panel 1 divine realm bubble");

    // 5. PANEL 2 RECTANGULAR CAPTION ("混元门弟子")
    let disciple = res.regions.iter().find(|r| r.text.contains("混元门弟子"));
    assert!(disciple.is_some(), "Must detect panel 2 disciple caption");

    // 6. PANEL 2 RIGHT NARRATION/SHOUT BUBBLE ("大师姐，我们已经警告过东河派...")
    let senior = res.regions.iter().find(|r| r.text.contains("大师姐") && r.text.contains("东河派"));
    assert!(senior.is_some(), "Must detect panel 2 senior sister report bubble");

    // 7. PANEL 3 SISTER REACTION BUBBLE ("姐姐，你成混元门大师姐了？")
    let sister = res.regions.iter().find(|r| r.text.contains("姐姐") && r.text.contains("大师姐"));
    assert!(sister.is_some(), "Must detect panel 3 sister reaction bubble");
}
