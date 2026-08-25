// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_holy_ancestor_mountains_glory_city` (RESOLUTION: 900 × 2239)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP NARRATION**:
///   `"圣祖山脉之外的世界，已经被妖兽所占领，\n这里的人们已经有数百年不曾与外界有过联系了。"` (FreeText)
/// - **PANEL 2 LEFT MAP NARRATION**:
///   `"谁也不清楚外面的世界是怎\n样的。传说人类在鼎盛时期有着庞\n大的帝国，但如今都已灰飞烟灭，\n不复存在。\n这座城市由于位置隐秘，才得以\n从黑暗时代完整保留下来。"` (FreeText)
/// - **PANEL 2 RIGHT MAP NARRATION**:
///   `"虽然经常会受到山脉中\n风雪妖兽的袭击，但这座\n城池还是在次次毁灭性的\n战争中不断重建了起来。"` (FreeText)
/// - **PANEL 2 BOTTOM-LEFT SUBTITLE**:
///   `"那斑驳的城墙，是一座不朽的丰碑！"` (FreeText)
/// - **PANEL 2 BOTTOM-MIDDLE SUBTITLE**:
///   `"而这座代表人类希望的城市，叫做"` (FreeText)
/// - **PANEL 2 BOTTOM TITLE BANNER**:
///   `"光辉之城"` (FreeText)
/// - **EXACT COUNTS**: Exactly 6 regions (0 DialogueBubbles, 0 SoundEffects, 6 FreeText).
/// - **ANGLE INVARIANT**: Strictly 0.0° rotation angle on all 6 free text regions.
#[test]
fn test_regression_page_holy_ancestor_mountains_glory_city() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_holy_ancestor_mountains_glory_city.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_holy_ancestor_mountains_glory_city: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Holy Ancestor Mountains Glory City Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 6 FREETEXT REGIONS
    crate::assert_element_counts!(res, 6, 0, 0, 6);

    // 2. PANEL 1 TOP NARRATION:
    let r0 = res.regions.iter().find(|r| r.text.contains("圣祖山脉") && r.text.contains("妖兽所占领"));
    assert!(r0.is_some(), "Must detect panel 1 top narration '圣祖山脉之外的世界...'");
    let r0 = r0.unwrap();
    crate::assert_region_bounds!(r0, xianscan_rust::ml::schemas::RegionKind::FreeText, 26, 25, 437, 63, 8);
    crate::assert_region_angle!(r0, 0.0, 1.5);

    // 3. PANEL 2 LEFT MAP NARRATION:
    let r1 = res.regions.iter().find(|r| r.text.contains("谁也不清楚外面的世界") || r.text.contains("灰飞烟灭"));
    assert!(r1.is_some(), "Must detect panel 2 left map narration");
    let r1 = r1.unwrap();
    crate::assert_region_bounds!(r1, xianscan_rust::ml::schemas::RegionKind::FreeText, 69, 834, 282, 185, 8);
    crate::assert_region_angle!(r1, 0.0, 1.5);

    // 4. PANEL 2 RIGHT MAP NARRATION:
    let r2 = res.regions.iter().find(|r| r.text.contains("风雪妖兽的袭击") || r.text.contains("毁灭性的"));
    assert!(r2.is_some(), "Must detect panel 2 right map narration");
    let r2 = r2.unwrap();
    crate::assert_region_bounds!(r2, xianscan_rust::ml::schemas::RegionKind::FreeText, 603, 835, 205, 119, 8);
    crate::assert_region_angle!(r2, 0.0, 1.5);

    // 5. PANEL 2 BOTTOM-LEFT SUBTITLE: '那斑驳的城墙，是一座不朽的丰碑！'
    let r3 = res.regions.iter().find(|r| r.text.contains("斑驳的城墙") || r.text.contains("不朽的丰碑"));
    assert!(r3.is_some(), "Must detect bottom-left subtitle '那斑驳的城墙，是一座不朽的丰碑！'");
    let r3 = r3.unwrap();
    crate::assert_region_bounds!(r3, xianscan_rust::ml::schemas::RegionKind::FreeText, 21, 1134, 340, 29, 8);
    crate::assert_region_angle!(r3, 0.0, 1.5);

    // 6. PANEL 2 BOTTOM-MIDDLE SUBTITLE: '而这座代表人类希望的城市，叫做'
    let r4 = res.regions.iter().find(|r| r.text.contains("人类希望的城市") || r.text.contains("叫做"));
    assert!(r4.is_some(), "Must detect bottom-middle subtitle '而这座代表人类希望的城市，叫做'");
    let r4 = r4.unwrap();
    assert!(!r4.text.contains("光辉之城"), "Subtitle must NOT merge with large title banner '光辉之城'");
    crate::assert_region_bounds!(r4, xianscan_rust::ml::schemas::RegionKind::FreeText, 396, 1134, 329, 29, 8);
    crate::assert_region_angle!(r4, 0.0, 1.5);

    // 7. PANEL 2 BOTTOM TITLE BANNER: '光辉之城'
    let r5 = res.regions.iter().find(|r| r.text.trim() == "光辉之城" || r.text.contains("光辉之城"));
    assert!(r5.is_some(), "Must detect standalone title banner '光辉之城'");
    let r5 = r5.unwrap();
    assert!(!r5.text.contains("代表人类希望"), "Title banner must be standalone");
    crate::assert_region_bounds!(r5, xianscan_rust::ml::schemas::RegionKind::FreeText, 578, 1168, 176, 60, 8);
    crate::assert_region_angle!(r5, 0.0, 1.5);

    // 8. NEGATIVE GUARDS: FILTER CORNER WATERMARK
    assert!(!res.regions.iter().any(|r| r.text.contains("漫客")), "Must filter platform corner watermark");
}
