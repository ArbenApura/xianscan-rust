// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

#[test]
fn test_regression_page_live_stream_gift_pill_banners_multipliers() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_live_stream_gift_pill_banners_multipliers") {
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

    // 1. EXACT ELEMENT COUNTS: 6 REGIONS (0 DIALOGUE BUBBLES, 0 SFX, 6 FREE TEXT LIVE STREAM BANNERS/BULLETS)
    crate::assert_element_counts!(res, 6, 0, 0, 6);

    // 2. LIVE STREAM CHAT BARRAGE: "茶茶天下无敌"
    let r0 = res.regions.iter().find(|r| r.text.contains("茶茶天下无敌"));
    assert!(r0.is_some(), "Must detect barrage text '茶茶天下无敌'");
    assert_eq!(r0.unwrap().kind, RegionKind::FreeText);

    // 3. GIFT PILL BANNER 1: "XXX送出LV包包x8" (MULTIPLIER 'x8' MUST NOT BE STRIPPED)
    let r1 = res.regions.iter().find(|r| r.text.contains("LV包包"));
    assert!(r1.is_some(), "Must detect gift banner 'XXX送出LV包包x8'");
    let r1 = r1.unwrap();
    assert_eq!(r1.kind, RegionKind::FreeText);
    assert!(r1.text.contains("x8") || r1.text.contains("X8"), "Gift banner must retain 'x8' multiplier suffix");
    crate::assert_region_bounds!(r1, RegionKind::FreeText, 586, 732, 314, 61, 20);

    // 4. LIVE STREAM CHAT BARRAGE: "我TM社保"
    let r2 = res.regions.iter().find(|r| r.text.contains("我TM社保"));
    assert!(r2.is_some(), "Must detect barrage text '我TM社保'");
    assert_eq!(r2.unwrap().kind, RegionKind::FreeText);

    // 5. GIFT PILL BANNER 2: "XX送出金蛋x5" (MULTIPLIER 'x5' MUST NOT BE STRIPPED)
    let r3 = res.regions.iter().find(|r| r.text.contains("送出金蛋"));
    assert!(r3.is_some(), "Must detect gift banner 'XX送出金蛋x5'");
    let r3 = r3.unwrap();
    assert_eq!(r3.kind, RegionKind::FreeText);
    assert!(r3.text.contains("x5") || r3.text.contains("X5"), "Gift banner must retain 'x5' multiplier suffix");
    crate::assert_region_bounds!(r3, RegionKind::FreeText, 62, 1293, 241, 44, 20);

    // 6. BOTTOM BARRAGE: "阿啊啊，啊啊啊，爽啊！太精彩了，"
    let r4 = res.regions.iter().find(|r| r.text.contains("爽啊") || r.text.contains("太精彩了"));
    assert!(r4.is_some(), "Must detect bottom barrage text '爽啊！太精彩了'");
    assert_eq!(r4.unwrap().kind, RegionKind::FreeText);

    // 7. GIFT PILL BANNER 3: "XXX送出鲜花x10" (MULTIPLIER 'x10' MUST NOT BE STRIPPED)
    let r5 = res.regions.iter().find(|r| r.text.contains("送出鲜花"));
    assert!(r5.is_some(), "Must detect gift banner 'XXX送出鲜花x10'");
    let r5 = r5.unwrap();
    assert_eq!(r5.kind, RegionKind::FreeText);
    assert!(r5.text.contains("x10") || r5.text.contains("X10"), "Gift banner must retain 'x10' multiplier suffix");
    crate::assert_region_bounds!(r5, RegionKind::FreeText, 611, 1655, 289, 62, 20);
}
