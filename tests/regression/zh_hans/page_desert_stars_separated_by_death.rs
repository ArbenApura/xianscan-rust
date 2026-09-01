// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_desert_stars_separated_by_death` (RESOLUTION: 800 × 1503)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **NARRATION FREE-TEXT PRESERVATION ACROSS 4 PANELS**:
///   1. Panel 1 Narration: `"群星陨落，天空一片黯淡"` (FreeText)
///   2. Panel 2 Narration: `"在死亡的威胁下，我们紧紧依偎拥有彼此。"` (FreeText)
///   3. Panel 3 Narration: `"起穿行在荒芜的沙漠，因为彼此的笑容而坚强……"` (FreeText, no stray suffix noise)
///   4. Panel 4 Narration: `"然而，幸福是如此短暂"` (FreeText)
/// - **EXACT COUNTS**: Exactly 4 regions (0 DialogueBubbles, 0 SoundEffects, 4 FreeText).
/// - **ZERO DUPLICATE MERGES ACROSS PANELS**.
#[test]
fn test_regression_page_desert_stars_separated_by_death() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_desert_stars_separated_by_death.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_desert_stars_separated_by_death: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Desert Stars Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 4 REGIONS (0 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 4 FREETEXT)
    crate::assert_element_counts!(res, 4, 0, 0, 4);

    // 2. PANEL 1 NARRATION:
    // TEXT BOUNDS: '群星陨落，天空一片黯淡' -> [X: 319, Y: 282, W: 255, H: 36]
    let r0 = res.regions.iter().find(|r| r.text.contains("群星陨落") || r.text.contains("天空一片黯淡"));
    assert!(r0.is_some(), "Must detect panel 1 narration '群星陨落，天空一片黯淡'");
    let r0 = r0.unwrap();
    crate::assert_region_bounds!(r0, xianscan_rust::ml::schemas::RegionKind::FreeText, 319, 282, 255, 36, 8);
    crate::assert_region_angle!(r0, 0.0, 2.0);

    // 3. PANEL 2 NARRATION:
    // TEXT BOUNDS: '在死亡的威胁下，我们紧紧依偎拥有彼此。' -> [X: 364, Y: 776, W: 424, H: 34]
    let r1 = res.regions.iter().find(|r| r.text.contains("死亡的威胁下") || r.text.contains("紧紧依偎"));
    assert!(r1.is_some(), "Must detect panel 2 narration '在死亡的威胁下，我们紧紧依偎拥有彼此。'");
    let r1 = r1.unwrap();
    assert!(!r1.text.contains("荒芜的沙漠"), "Panel 2 narration must NOT merge with Panel 3 narration");
    crate::assert_region_bounds!(r1, xianscan_rust::ml::schemas::RegionKind::FreeText, 364, 776, 424, 34, 8);
    crate::assert_region_angle!(r1, 0.0, 2.0);

    // 4. PANEL 3 NARRATION:
    // TEXT BOUNDS: '起穿行在荒芜的沙漠，因为彼此的笑容而坚强....' -> [X: 149, Y: 832, W: 479, H: 29]
    let r2 = res.regions.iter().find(|r| r.text.contains("荒芜的沙漠") || r.text.contains("彼此的笑容"));
    assert!(r2.is_some(), "Must detect panel 3 narration '起穿行在荒芜的沙漠...'");
    let r2 = r2.unwrap();
    assert!(!r2.text.contains("死亡的威胁下"), "Panel 3 narration must NOT merge with Panel 2 narration");
    assert!(!r2.text.contains("200000"), "Panel 3 narration must not contain trailing noise digit '200000'");
    crate::assert_region_bounds!(r2, xianscan_rust::ml::schemas::RegionKind::FreeText, 149, 832, 479, 29, 8);
    crate::assert_region_angle!(r2, 0.0, 2.0);

    // 5. PANEL 4 NARRATION:
    // TEXT BOUNDS: '然而，幸福是如此短暂' -> [X: 465, Y: 1083, W: 221, H: 30]
    let r3 = res.regions.iter().find(|r| r.text.contains("幸福是如此短暂") || r.text.contains("然而"));
    assert!(r3.is_some(), "Must detect panel 4 narration '然而，幸福是如此短暂'");
    let r3 = r3.unwrap();
    assert_eq!(r3.kind, xianscan_rust::ml::schemas::RegionKind::FreeText, "Panel 4 narration must be classified as FreeText, not SoundEffect");
    crate::assert_region_bounds!(r3, xianscan_rust::ml::schemas::RegionKind::FreeText, 465, 1083, 253, 30, 15);
    crate::assert_region_angle!(r3, 0.0, 2.0);

    // 6. EXPLICIT NEGATIVE GUARDS AGAINST WATERMARKS & NOISE
    assert!(!res.regions.iter().any(|r| r.text.contains("漫客")), "Must filter platform corner watermark");
}
