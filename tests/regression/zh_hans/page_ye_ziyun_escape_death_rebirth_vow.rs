// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_ye_ziyun_escape_death_rebirth_vow` (RESOLUTION: 800 × 1939)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP NARRATION**:
///   `"回眸时，已是阴阳永隔……"` (FreeText)
/// - **PANEL 2 TOP-LEFT NARRATION**:
///   `"最后我活了下来……"` (FreeText)
/// - **PANEL 2 CENTER NARRATION (3 LINES)**:
///   `"走出无尽沙漠之后的日子里，我闯遍了整个圣灵大陆，遇\n到了很多跟妖兽抗争的人类，遇到了很多神秘的事情。\n还有……时空妖灵之书。"` (FreeText)
/// - **PANEL 3 MID-LEFT NARRATION (2 LINES)**:
///   `"只可惜当年的我太过弱小。\n光辉之城破灭，父母族人、兄弟们一个个战死，叶紫芸也死在了逃亡的路上。"` (FreeText)
/// - **PANEL 4 LOWER-RIGHT NARRATION (4 LINES)**:
///   `"战死那一刻，我似\n乎依稀看到了刚刚遇到\n她的那些年，若是上苍\n再给我一次机会……"` (FreeText)
/// - **PANEL 5 BOTTOM SPEECH BUBBLE (3 LINES)**:
///   `"既然我回来了，上天又给了\n我一次机会，我一定不会让光\n辉之城破灭的事情再次发生！"` (DialogueBubble)
/// - **EXACT COUNTS**: Exactly 6 regions (1 DialogueBubble, 0 SoundEffects, 5 FreeText).
/// - **ZERO WATERMARK ARTIFACTS**: Suppress bottom-right platform watermark echo `"爱"`.
#[test]
fn test_regression_page_ye_ziyun_escape_death_rebirth_vow() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_ye_ziyun_escape_death_rebirth_vow") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_ye_ziyun_escape_death_rebirth_vow: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Ye Ziyun Escape Death Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 0 BUBBLES, 0 SFX, 6 FREETEXT (6 TOTAL)
    crate::assert_element_counts!(res, 6, 0, 0, 6);

    // 2. PANEL 1 TOP NARRATION: '最后我活了下来...'
    let r0 = res.regions.iter().find(|r| r.text.contains("活了下来"));
    assert!(r0.is_some(), "Must detect panel 1 narration '最后我活了下来...'");
    let r0 = r0.unwrap();
    crate::assert_region_bounds!(r0, xianscan_rust::ml::schemas::RegionKind::FreeText, 26, 16, 177, 25, 8);
    crate::assert_region_angle!(r0, 0.0, 1.5);

    // 3. PANEL 2 CENTER NARRATION: '走出无尽沙漠之后的日子里...'
    let r1 = res.regions.iter().find(|r| r.text.contains("无尽沙漠") && r.text.contains("时空妖灵之书"));
    assert!(r1.is_some(), "Must detect panel 2 center 3-line narration");
    let r1 = r1.unwrap();
    crate::assert_region_bounds!(r1, xianscan_rust::ml::schemas::RegionKind::FreeText, 207, 399, 528, 99, 12);
    crate::assert_region_angle!(r1, 0.0, 1.5);

    // 4. PANEL 3 UPPER SHORT CAPTION: '只可惜当年的我太过弱小，'
    let r2 = res.regions.iter().find(|r| r.text.contains("只可惜当年的我太过弱小") || r.text.contains("太过弱小"));
    assert!(r2.is_some(), "Must detect panel 3 upper short caption '只可惜当年的我太过弱小，'");
    let r2 = r2.unwrap();
    assert!(!r2.text.contains("光辉之城破灭"), "Upper caption must NOT merge with banner below");
    crate::assert_region_bounds!(r2, xianscan_rust::ml::schemas::RegionKind::FreeText, 32, 685, 240, 28, 8);
    crate::assert_region_angle!(r2, 0.0, 1.5);

    // 5. PANEL 3 WIDE NARRATION BANNER: '光辉之城破灭，父母族人、兄弟们一个个战死，叶紫芸也死在了逃亡的路上。'
    let r3 = res.regions.iter().find(|r| r.text.contains("光辉之城破灭") && (r.text.contains("父母族人") || r.text.contains("叶紫芸")));
    assert!(r3.is_some(), "Must detect panel 3 wide narration banner");
    let r3 = r3.unwrap();
    assert!(!r3.text.contains("只可惜当年的我太过弱小"), "Banner must NOT merge with upper caption");
    assert!(r3.text.contains("逃亡的路上") || r3.text.contains("叶紫芸"), "Banner must contain the entire wide sentence without truncation");
    crate::assert_region_bounds!(r3, xianscan_rust::ml::schemas::RegionKind::FreeText, 30, 719, 680, 28, 10);
    crate::assert_region_angle!(r3, 0.0, 1.5);

    // 6. PANEL 4 LOWER-RIGHT NARRATION: '战死那一刻...'
    let r4 = res.regions.iter().find(|r| r.text.contains("战死那一刻") || r.text.contains("再给我一次机会"));
    assert!(r4.is_some(), "Must detect panel 4 lower-right narration");
    let r4 = r4.unwrap();
    crate::assert_region_bounds!(r4, xianscan_rust::ml::schemas::RegionKind::FreeText, 156, 938, 233, 146, 10);
    crate::assert_region_angle!(r4, 0.0, 1.5);

    // 7. PANEL 5 BOTTOM SPEECH NARRATION: '既然我回来了...'
    let r5 = res.regions.iter().find(|r| r.text.contains("既然我回来了") && r.text.contains("再次发生"));
    assert!(r5.is_some(), "Must detect panel 5 bottom narration region");
    let r5 = r5.unwrap();
    assert_eq!(r5.kind, xianscan_rust::ml::schemas::RegionKind::FreeText);
    crate::assert_region_bounds!(r5, xianscan_rust::ml::schemas::RegionKind::FreeText, 32, 1142, 289, 85, 10);
    crate::assert_region_angle!(r5, 0.0, 1.5);

    // 8. NEGATIVE GUARDS: SUPPRESS WATERMARK AND NOISE CHARACTERS
    assert!(!res.regions.iter().any(|r| r.text.trim() == "爱" || r.text.trim() == "漫客"), "Must not detect watermark noise '爱' or '漫客'");
}
