// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # CHINESE REAL-PAGE REGRESSION: `page_bear_lord_calm_down_spiky_shout` (RESOLUTION: 900 × 1226)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP PANEL BUBBLES**:
///   1. `"熊君！冷静点！"`
///   2. `"不是人类！"`
///   3. `"这股气息……"`
/// - **SPIKY SHOUT BUBBLES**:
///   4. Upper-left: `"结束了！"`
///   5. Mid-left (previously missed): `"结束了！"`
///   6. Center: `"结束了！"`
///   7. Lower-left: `"终于——"`
///   8. Right: `"那……那是！！"`
#[test]
fn test_regression_page_bear_lord_calm_down_spiky_shout() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_bear_lord_calm_down_spiky_shout/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_bear_lord_calm_down_spiky_shout: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!("Chinese Bear Lord Calm Down Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 8 REGIONS (4 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 4 FREETEXT)
    crate::assert_element_counts!(res, 8, 4, 0, 4);

    // 2. TOP PANEL BUBBLES
    let top_left_1 = res.regions.iter().find(|r| r.text.contains("熊君") || r.text.contains("静点"));
    assert!(top_left_1.is_some(), "Must detect top-left bubble '熊君！冷静点！'");
    let top_left_1 = top_left_1.unwrap();
    crate::assert_region_bounds!(
        top_left_1,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        58,
        42,
        115,
        76,
        15
    );

    let top_right = res.regions.iter().find(|r| r.text.contains("这股气") || r.text.contains("息"));
    assert!(top_right.is_some(), "Must detect top-right bubble '这股气息……'");
    let top_right = top_right.unwrap();
    crate::assert_region_bounds!(
        top_right,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        735,
        105,
        102,
        88,
        15
    );

    let top_left_2 = res.regions.iter().find(|r| r.text.contains("不是人") || r.text.contains("类！"));
    assert!(top_left_2.is_some(), "Must detect top-left lower bubble '不是人类！'");
    let top_left_2 = top_left_2.unwrap();
    crate::assert_region_bounds!(
        top_left_2,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        98,
        172,
        90,
        71,
        15
    );

    // 3. MID-LEFT SPIKY SHOUT BUBBLE (PREVIOUSLY MISSED): [X: ~47, Y: ~551, W: ~145, H: ~51]
    let mid_left_shout = res.regions.iter().find(|r| {
        let (bx, by) = (r.box_.x, r.box_.y);
        bx <= 100 && by >= 500 && by <= 600 && r.text.contains("结束")
    });
    assert!(
        mid_left_shout.is_some(),
        "Must detect previously missed mid-left spiky shout bubble '结束了！' at y ~ 550, got regions: {:?}",
        res.regions
    );
    let mid_left_shout = mid_left_shout.unwrap();
    crate::assert_region_bounds!(
        mid_left_shout,
        xianscan_rust::ml::schemas::RegionKind::FreeText,
        47,
        551,
        145,
        51,
        15
    );

    // 4. VERIFY ALL THREE "结束了" SHOUT BUBBLES DETECTED
    let jieshu_count = res.regions.iter().filter(|r| r.text.contains("结束")).count();
    assert_eq!(
        jieshu_count, 3,
        "Must detect all 3 '结束了！' shout bubbles on the page, got {}",
        jieshu_count
    );

    // 5. BOTTOM LEFT "终于——"
    let zhongyu = res.regions.iter().find(|r| r.text.contains("终于"));
    assert!(zhongyu.is_some(), "Must detect lower-left '终于——'");
    let zhongyu = zhongyu.unwrap();
    crate::assert_region_bounds!(
        zhongyu,
        xianscan_rust::ml::schemas::RegionKind::FreeText,
        95,
        904,
        163,
        56,
        15
    );
}
