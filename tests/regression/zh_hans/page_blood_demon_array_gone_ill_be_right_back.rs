// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_blood_demon_array_gone_ill_be_right_back` (RESOLUTION: 900 × 1280)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 2 DIALOGUE BUBBLE WITH UPWARD TAIL**: `[306, 731, 247, 258]` (`"我去去就回，最多不超过一刻钟。"`).
///   Bubble has a vertical upward pointer tail pointing up to the speaker's mouth.
///   The carrier chamber severs the upward tail, isolating the circular body chamber (`[306, 774, 245, 214]`).
///   The typeset box must center symmetrically within the circular chamber cavity (`cx ≈ 428`),
///   preventing text from jamming into the right border and clipping the outline.
#[test]
fn test_regression_page_blood_demon_array_gone_ill_be_right_back() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_blood_demon_array_gone_ill_be_right_back/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_blood_demon_array_gone_ill_be_right_back, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));

    println!("Detected {} regions on page_blood_demon_array_gone_ill_be_right_back:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, box={:?}, bubble={:?}, carrier={:?}, typeset={:?}, text='{}'",
            i, r.kind, r.box_, r.bubble_box, r.carrier_box, r.typeset_box, r.text.replace('\n', " ")
        );
    }

    assert_eq!(res.regions.len(), 9, "Expected exactly 9 regions on page_blood_demon_array_gone_ill_be_right_back");

    // REGION 7: PANEL 2 DIALOGUE BUBBLE ("我去去就回，最多不超过一刻钟。")
    let r7 = &res.regions[7];
    assert!(r7.text.contains("我去去就回") || r7.text.contains("不超过"), "Region 7 text must match '我去去就回...'");
    assert!(r7.bubble_box.is_some(), "Region 7 must have a detected bubble box");
    assert!(r7.carrier_box.is_some(), "Region 7 must have a tail-cut carrier box severing the upward tail");
    let carrier7 = r7.carrier_box.as_ref().unwrap();
    let carrier_cx = carrier7.x + carrier7.w / 2;
    let carrier_cy = carrier7.y + carrier7.h / 2;

    assert!(r7.typeset_box.is_some(), "Region 7 must have a typeset box");
    let tb7 = r7.typeset_box.as_ref().unwrap();
    let tb_cx = tb7.x + tb7.w / 2;
    let tb_cy = tb7.y + tb7.h / 2;

    // TYPESET BOX MUST CENTER SYMMETRICALLY WITHIN THE CIRCULAR BODY CHAMBER
    assert!(
        (tb_cx - carrier_cx).abs() <= 3,
        "Typeset box horizontal centroid ({}) must align with chamber centroid ({})",
        tb_cx,
        carrier_cx
    );
    assert!(
        (tb_cy - carrier_cy).abs() <= 3,
        "Typeset box vertical centroid ({}) must align with chamber centroid ({})",
        tb_cy,
        carrier_cy
    );
    assert!(
        tb7.x <= 330,
        "Typeset box left edge ({}) must expand into left void instead of skewing right",
        tb7.x
    );
}
