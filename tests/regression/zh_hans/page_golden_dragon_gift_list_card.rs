// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

#[test]
fn test_regression_page_golden_dragon_gift_list_card() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_golden_dragon_gift_list_card") {
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

    // 1. EXACT ELEMENT COUNTS: 1 FREE TEXT GIFT LIST CARD (PREVIOUSLY DROPPED ENTIRELY AS TABULAR NOISE)
    crate::assert_element_counts!(res, 1, 0, 0, 1);

    // 2. GIFT LIST CARD REGION: "“穷得只剩钱”赠送“爽爽”黄金龙..."
    let r0 = &res.regions[0];
    assert_eq!(r0.kind, RegionKind::FreeText);
    assert!(r0.text.contains("穷得只剩钱") && r0.text.contains("黄金龙"), "Must detect golden dragon gift list card");
    assert!(r0.text.contains("x80") || r0.text.contains("x160") || r0.text.contains("x320"), "Must contain gift multiplier quantities");
    crate::assert_region_bounds!(r0, RegionKind::FreeText, 85, 1150, 593, 254, 25);
}
