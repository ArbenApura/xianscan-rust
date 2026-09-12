// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_douluo_awakening_soul_power_zero` (RESOLUTION: 900 x 1278)
///
/// ## PURPOSE & BEHAVIOR TESTED
/// - Verify that 5 speech bubbles containing "魂力：0" across panels are correctly detected
///   alongside existing dialogue bubbles and free text (total 15 regions).
/// - Verify that emoticon noise bubble ("T T......") is omitted.
#[test]
fn test_regression_page_douluo_awakening_soul_power_zero() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_douluo_awakening_soul_power_zero/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_douluo_awakening_soul_power_zero: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Douluo Awakening Page detected {} regions:",
        res.regions.len()
    );
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2} deg, box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: 15 REGIONS TOTAL
    assert_eq!(
        res.regions.len(),
        15,
        "Expected exactly 15 regions total, got {}",
        res.regions.len()
    );

    // 2. DETECT ALL 5 "魂力：0" DIALOGUE BUBBLES
    let soul_power_regions: Vec<_> = res
        .regions
        .iter()
        .filter(|r| r.text.contains("魂力") && r.text.contains('0'))
        .collect();
    assert_eq!(
        soul_power_regions.len(),
        5,
        "Expected exactly 5 '魂力：0' dialogue bubbles, got {}",
        soul_power_regions.len()
    );
    for (idx, r) in soul_power_regions.iter().enumerate() {
        assert_eq!(
            r.kind,
            RegionKind::DialogueBubble,
            "'魂力：0' instance {} must be classified as DialogueBubble",
            idx
        );
    }

    // PANEL 1 SPATULA BOY: "魂力：0" (r2)
    let sp1 = soul_power_regions
        .iter()
        .find(|r| (r.box_.x - 495).abs() <= 20 && (r.box_.y - 67).abs() <= 20);
    assert!(sp1.is_some(), "Must detect panel 1 spatula boy '魂力：0' bubble");
    crate::assert_region_bounds!(sp1.unwrap(), RegionKind::DialogueBubble, 495, 67, 74, 27, 10);

    // PANEL 1 SOUP BOWL BOY: "魂力：0" (r4)
    let sp2 = soul_power_regions
        .iter()
        .find(|r| (r.box_.x - 746).abs() <= 20 && (r.box_.y - 68).abs() <= 20);
    assert!(sp2.is_some(), "Must detect panel 1 soup bowl boy '魂力：0' bubble");
    crate::assert_region_bounds!(sp2.unwrap(), RegionKind::DialogueBubble, 746, 68, 73, 27, 10);

    // PANEL 2 SOY SAUCE BOTTLE BOY: "魂力：0" (r7)
    let sp3 = soul_power_regions
        .iter()
        .find(|r| (r.box_.x - 660).abs() <= 30 && (r.box_.y - 377).abs() <= 20);
    assert!(sp3.is_some(), "Must detect panel 2 soy sauce bottle boy '魂力：0' bubble");
    crate::assert_region_bounds!(sp3.unwrap(), RegionKind::DialogueBubble, 660, 377, 92, 32, 10);

    // PANEL 2 SICKLE BOY: "魂力：0" (r8)
    let sp4 = soul_power_regions
        .iter()
        .find(|r| (r.box_.x - 417).abs() <= 20 && (r.box_.y - 427).abs() <= 20);
    assert!(sp4.is_some(), "Must detect panel 2 sickle boy '魂力：0' bubble");
    crate::assert_region_bounds!(sp4.unwrap(), RegionKind::DialogueBubble, 417, 427, 72, 26, 10);

    // PANEL 4 TANG SAN: "魂力：0" (r11)
    let sp5 = soul_power_regions
        .iter()
        .find(|r| (r.box_.x - 123).abs() <= 20 && (r.box_.y - 933).abs() <= 20);
    assert!(sp5.is_some(), "Must detect panel 4 Tang San '魂力：0' bubble");
    crate::assert_region_bounds!(sp5.unwrap(), RegionKind::DialogueBubble, 123, 933, 80, 30, 10);

    // 3. DIALOGUE BUBBLES ACROSS PANELS
    assert!(
        res.regions.iter().any(|r| r.text.contains("排成一队")),
        "Must detect '排成一队，一个个来。'"
    );
    assert!(
        res.regions.iter().any(|r| r.text.contains("锅铲")),
        "Must detect '武魂：锅铲 器武魂'"
    );
    assert!(
        res.regions.iter().any(|r| r.text.contains("汤碗")),
        "Must detect '武魂：汤碗 器武魂'"
    );
    assert!(
        res.regions.iter().any(|r| r.text.contains("镰刀")),
        "Must detect '武魂：镰刀 器武魂'"
    );
    assert!(
        res.regions.iter().any(|r| r.text.contains("酱油瓶")),
        "Must detect '武魂：酱油瓶 器武魂'"
    );
    assert!(
        res.regions.iter().any(|r| r.text.contains("蓝银草")),
        "Must detect '武魂：蓝银草 器武魂'"
    );
    assert!(
        res.regions.iter().any(|r| r.text.contains("弱智都知道")),
        "Must detect '弱智都知道的标准版废武魂！！'"
    );
    assert!(
        res.regions.iter().any(|r| r.text.contains("杂草")),
        "Must detect '哈哈哈……到处长的杂草！'"
    );
    assert!(
        res.regions.iter().any(|r| r.text.contains("我家猪") && r.text.contains("垃圾")),
        "Must detect '哈哈，我家猪都不吃的垃圾！'"
    );

    // 4. FREE TEXT
    let free_text = res.regions.iter().find(|r| r.text.trim() == "果然");
    assert!(free_text.is_some(), "Must detect free text '果然'");
    assert_eq!(
        free_text.unwrap().kind,
        RegionKind::FreeText,
        "'果然' must be classified as FreeText"
    );

    // 5. EXPLICIT NEGATIVE GUARDS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("T T") || r.text.contains("TT")),
        "Must NOT detect emoticon bubble 'T T......'"
    );
}
