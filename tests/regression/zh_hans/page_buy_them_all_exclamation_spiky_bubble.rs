// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

#[test]
fn test_regression_page_buy_them_all_exclamation_spiky_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_buy_them_all_exclamation_spiky_bubble") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("Detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 2 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 2, 2, 0, 0);

    // 2. TOP BUBBLE: "全部买下！"
    let r0 = res.regions.iter().find(|r| r.text.contains("全部买下"));
    assert!(r0.is_some(), "Must detect top bubble '全部买下！'");
    let r0 = r0.unwrap();
    assert_eq!(r0.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r0, RegionKind::DialogueBubble, 337, 95, 172, 52, 20);

    // 3. SPIKY REACTION BUBBLE: "！！！" (MUST NOT CORRUPT INTO "e\n1:" OR DIGIT/LETTER NOISE)
    let r1 = res.regions.iter().find(|r| r.text == "！！！" || (r.text.contains('！') && !r.text.contains("全部买下")));
    assert!(r1.is_some(), "Must detect spiky exclamation bubble '！！！'");
    let r1 = r1.unwrap();
    assert_eq!(r1.kind, RegionKind::DialogueBubble);
    assert!(!r1.text.contains('e') && !r1.text.contains("1:"), "Must not corrupt exclamation bubble into alphanumeric noise");
    crate::assert_region_bounds!(r1, RegionKind::DialogueBubble, 98, 858, 104, 54, 20);
}
