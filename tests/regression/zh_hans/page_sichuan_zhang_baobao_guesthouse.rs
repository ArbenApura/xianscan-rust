// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # CHINESE REAL-PAGE REGRESSION: `page_sichuan_zhang_baobao_guesthouse` (RESOLUTION: 800 × 1366)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP-LEFT DUAL-LOBED SPEECH BUBBLE**:
///   1. Upper lobe: `"我白天往四川\n那边去电话了\n解了一下……"`
///   2. Lower lobe: `"确实有这么\n个人，张宝\n宝……"`
/// - **TOP-RIGHT SPEECH BUBBLE**:
///   3. `"不过这么多年\n了……总算有\n点进展了……"` (angle = 0.0°)
/// - **MIDDLE-LEFT DUAL-LOBED SPEECH BUBBLE**:
///   4. `"他的母亲跟一个外\n地男的一起过……\n但俩人没结婚……"`
///   5. `"那男的不叫张\n予德，所以我\n不确定那是不\n是你父亲……"`
/// - **BOTTOM WINDOW BUBBLE**:
///   6. `"总之你先去回老\n屋看看吧～那个\n叫张宝宝的姑娘\n就住在招待所……"`
/// - **EXACT COUNTS**: Exactly 6 dialogue regions.
#[test]
fn test_regression_page_sichuan_zhang_baobao_guesthouse() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_sichuan_zhang_baobao_guesthouse/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_sichuan_zhang_baobao_guesthouse: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!("Chinese Sichuan Zhang Baobao Guesthouse Page detected {} regions:", res.regions.len());
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

    // 1. TOP-LEFT DUAL LOBES VERIFICATION
    let top_left_1 = res.regions.iter().find(|r| r.text.contains("四川") && (r.text.contains("电话") || r.text.contains("了解")));
    assert!(top_left_1.is_some(), "Must detect top-left upper lobe '我白天往四川那边去电话...'");
    let top_left_1 = top_left_1.unwrap();
    assert!(!top_left_1.text.contains("张宝宝"), "Upper lobe must not merge with lower lobe '张宝宝'");

    let top_left_2 = res.regions.iter().find(|r| r.text.contains("确实有") || (r.text.contains("张宝") && r.box_.y < 400));
    assert!(top_left_2.is_some(), "Must detect top-left lower lobe '确实有这么个人，张宝宝...'");
    let top_left_2 = top_left_2.unwrap();
    assert!(!top_left_2.text.contains("四川"), "Lower lobe must not merge with upper lobe '四川'");

    // 2. TOP-RIGHT BUBBLE
    let top_right = res.regions.iter().find(|r| r.text.contains("这么多年") || r.text.contains("进展"));
    assert!(top_right.is_some(), "Must detect top-right bubble '不过这么多年...'");
    let top_right = top_right.unwrap();
    crate::assert_region_angle!(top_right, 0.0, 1.5);

    // 3. MIDDLE-LEFT LOBES
    assert!(
        res.regions.iter().any(|r| r.text.contains("母亲") || r.text.contains("没结婚")),
        "Must detect middle-left lobe 1 '他的母亲跟一个外地男的...'"
    );
    assert!(
        res.regions.iter().any(|r| r.text.contains("张予德") || r.text.contains("不确定")),
        "Must detect middle-left lobe 2 '那男的不叫张予德...'"
    );

    // 4. BOTTOM BUBBLE
    assert!(
        res.regions.iter().any(|r| r.text.contains("老屋") || r.text.contains("招待所")),
        "Must detect bottom bubble '总之你先去回老屋看看吧...'"
    );

    // 5. EXACT ELEMENT COUNTS: EXACTLY 6 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 6, 6, 0, 0);
}
