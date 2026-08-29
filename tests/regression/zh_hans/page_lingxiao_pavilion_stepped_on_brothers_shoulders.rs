// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # CHINESE REAL-PAGE REGRESSION: `page_lingxiao_pavilion_stepped_on_brothers_shoulders` (RESOLUTION: 800 × 1132)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP PANEL FREE TEXT**:
///   1. `"在这个门派内，有能力者上位，"`
/// - **MIDDLE PANEL FREE TEXT**:
///   2. `"没能力者淘汰，弱肉强食\n这个铁律被演绎的淋漓尽致"`
/// - **BOTTOM PANEL UPPER RIGHT FREE TEXT**:
///   3. `"其他的宗门或许还\n有些同门友情手足情谊，\n但是在凌霄阁内没有！"`
/// - **BOTTOM PANEL COMPLETE 3-LINE NARRATION (PREVIOUSLY TRUNCATED BY WATERMARK)**:
///   4. `"想往上爬，\n唯有踩着那些所谓的师兄弟们的肩膀，\n踏过他们的鲜血，如此才有资格"`
/// - **EXACT COUNTS**: Exactly 4 FreeText regions, 0 DialogueBubbles.
#[test]
fn test_regression_page_lingxiao_pavilion_stepped_on_brothers_shoulders() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_lingxiao_pavilion_stepped_on_brothers_shoulders/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_lingxiao_pavilion_stepped_on_brothers_shoulders: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!("Chinese Lingxiao Pavilion Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 4 FREETEXT REGIONS
    crate::assert_element_counts!(res, 4, 0, 0, 4);

    // 2. TOP PANEL TEXT: [X: 373, Y: 294, W: 364, H: 33]
    let top = res.regions.iter().find(|r| r.text.contains("门派内") && r.text.contains("上位"));
    assert!(top.is_some(), "Must detect top panel text '在这个门派内，有能力者上位，'");
    let top = top.unwrap();
    crate::assert_region_bounds!(
        top,
        xianscan_rust::ml::schemas::RegionKind::FreeText,
        373,
        294,
        364,
        33,
        15
    );

    // 3. MIDDLE PANEL TEXT: [X: 46, Y: 390, W: 325, H: 65]
    let mid = res.regions.iter().find(|r| r.text.contains("淘汰") && r.text.contains("淋漓尽致"));
    assert!(mid.is_some(), "Must detect middle panel text '没能力者淘汰，弱肉强食...'");
    let mid = mid.unwrap();
    crate::assert_region_bounds!(
        mid,
        xianscan_rust::ml::schemas::RegionKind::FreeText,
        46,
        390,
        325,
        65,
        15
    );

    // 4. BOTTOM PANEL UPPER RIGHT TEXT: [X: 471, Y: 746, W: 287, H: 100]
    let bot_right = res.regions.iter().find(|r| r.text.contains("凌霄阁") || r.text.contains("手足情谊"));
    assert!(bot_right.is_some(), "Must detect bottom panel upper right text '其他的宗门或许还...'");
    let bot_right = bot_right.unwrap();
    crate::assert_region_bounds!(
        bot_right,
        xianscan_rust::ml::schemas::RegionKind::FreeText,
        471,
        746,
        287,
        100,
        15
    );

    // 5. BOTTOM PANEL 3-LINE NARRATION (MUST CONTAIN ALL 3 LINES): [X: 33, Y: 1006, W: 448, H: 105]
    let bot_narration = res.regions.iter().find(|r| r.text.contains("鲜血") || r.text.contains("往上爬") || r.text.contains("肩膀"));
    assert!(
        bot_narration.is_some(),
        "Must detect bottom narration block, got: {:?}",
        res.regions
    );
    let bot_narration = bot_narration.unwrap();
    assert!(
        bot_narration.text.contains("想往上爬") || bot_narration.text.contains("上爬"),
        "Bottom narration must contain top line '想往上爬，', got: '{}'",
        bot_narration.text
    );
    assert!(
        bot_narration.text.contains("肩膀") || bot_narration.text.contains("师兄弟"),
        "Bottom narration must contain middle line '唯有踩着那些所谓的师兄弟们的肩膀，', got: '{}'",
        bot_narration.text
    );
    assert!(
        bot_narration.text.contains("鲜血") || bot_narration.text.contains("资格"),
        "Bottom narration must contain bottom line '踏过他们的鲜血，如此才有资格', got: '{}'",
        bot_narration.text
    );
    crate::assert_region_bounds!(
        bot_narration,
        xianscan_rust::ml::schemas::RegionKind::FreeText,
        33,
        1006,
        448,
        105,
        15
    );
    crate::assert_region_angle!(bot_narration, 0.0, 1.5);
}
