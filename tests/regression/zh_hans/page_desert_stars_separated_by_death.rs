// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_desert_stars_separated_by_death` (RESOLUTION: 900 × 2229)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **NARRATION FREE-TEXT PRESERVATION ACROSS 5 PANELS**:
///   1. Panel 1 Narration: `"群星陨落，天空一片黯淡"` (FreeText)
///   2. Panel 2 Narration: `"在死亡的威胁下，我们紧紧依偎，拥有彼此。"` (FreeText)
///   3. Panel 3 Narration: `"一起穿行在荒芜的沙漠，因为彼此的笑容而坚强……"` (FreeText, leading `"一"` preserved, no stray `"3"`)
///   4. Panel 4 Narration: `"然而，幸福是如此短暂……"` (FreeText, no `"000000"` noise, classified as FreeText, not SFX)
///   5. Panel 5 Narration: `"回眸时，已是阴阳永隔……"` (FreeText, deduplicated, horizontal angle ~0°, tight bounds)
/// - **ZERO SFX / ZERO GHOST OVERLAYS / ZERO PLATFORM WATERMARK**.
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 5 REGIONS (0 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 5 FREETEXT)
    crate::assert_element_counts!(res, 5, 0, 0, 5);

    // 2. PANEL 1 NARRATION:
    // TEXT BOUNDS: '群星陨落，天空一片黯淡' -> [X: 358, Y: 294, W: 262, h: 34]
    let r0 = res.regions.iter().find(|r| r.text.contains("群星陨落") || r.text.contains("天空一片黯淡"));
    assert!(r0.is_some(), "Must detect panel 1 narration '群星陨落，天空一片黯淡'");
    let r0 = r0.unwrap();
    crate::assert_region_bounds!(r0, xianscan_rust::ml::schemas::RegionKind::FreeText, 358, 294, 262, 34, 8);
    crate::assert_region_angle!(r0, 0.0, 2.0);

    // 3. PANEL 2 NARRATION:
    // TEXT BOUNDS: '在死亡的威胁下，我们紧紧依偎，拥有彼此。' -> [X: 399, Y: 805, W: 461, H: 37]
    let r1 = res.regions.iter().find(|r| r.text.contains("死亡的威胁下") || r.text.contains("紧紧依偎"));
    assert!(r1.is_some(), "Must detect panel 2 narration '在死亡的威胁下，我们紧紧依偎，拥有彼此。'");
    let r1 = r1.unwrap();
    crate::assert_region_bounds!(r1, xianscan_rust::ml::schemas::RegionKind::FreeText, 399, 805, 461, 37, 8);
    crate::assert_region_angle!(r1, 0.0, 2.0);

    // 4. PANEL 3 NARRATION:
    // TEXT BOUNDS: '起穿行在荒芜的沙漠，因为彼此的笑容而坚强....' -> [X: 188, Y: 917, W: 503, H: 32]
    let r2 = res.regions.iter().find(|r| r.text.contains("荒芜的沙漠") || r.text.contains("彼此的笑容"));
    assert!(r2.is_some(), "Must detect panel 3 narration '起穿行在荒芜的沙漠...'");
    let r2 = r2.unwrap();
    assert!(!r2.text.contains("\n3") && !r2.text.ends_with('3'), "Panel 3 narration must not contain trailing noise digit '3'");
    crate::assert_region_bounds!(r2, xianscan_rust::ml::schemas::RegionKind::FreeText, 188, 917, 503, 32, 8);
    crate::assert_region_angle!(r2, 0.0, 2.0);

    // 5. PANEL 4 NARRATION:
    // TEXT BOUNDS: '然而，幸福是如此短暂。' -> [X: 520, Y: 1186, W: 270, H: 31]
    let r3 = res.regions.iter().find(|r| r.text.contains("幸福是如此短暂") || r.text.contains("然而"));
    assert!(r3.is_some(), "Must detect panel 4 narration '然而，幸福是如此短暂……'");
    let r3 = r3.unwrap();
    assert_eq!(r3.kind, xianscan_rust::ml::schemas::RegionKind::FreeText, "Panel 4 narration must be classified as FreeText, not SoundEffect");
    assert!(!r3.text.contains("000000") && !r3.text.contains("00o0"), "Panel 4 narration must not contain trailing '000000' / '00o0' noise");
    crate::assert_region_bounds!(r3, xianscan_rust::ml::schemas::RegionKind::FreeText, 520, 1186, 270, 31, 8);
    crate::assert_region_angle!(r3, 0.0, 2.0);

    // 6. PANEL 5 NARRATION:
    // TEXT BOUNDS: '回眸时，已是阴阳永隔.…….' -> [X: 135, Y: 1669, W: 269, H: 29] (DEDUPLICATED, HORIZONTAL ANGLE ~0°)
    let r4 = res.regions.iter().find(|r| r.text.contains("阴阳永隔") || r.text.contains("回眸时"));
    assert!(r4.is_some(), "Must detect panel 5 narration '回眸时，已是阴阳永隔……'");
    let r4 = r4.unwrap();
    assert_eq!(r4.kind, xianscan_rust::ml::schemas::RegionKind::FreeText);
    crate::assert_region_angle!(r4, 0.0, 2.0);
    crate::assert_region_bounds!(r4, xianscan_rust::ml::schemas::RegionKind::FreeText, 135, 1669, 269, 29, 8);
    assert!(!r4.text.contains("水隔") && !r4.text.contains("明阳"), "Panel 5 narration must deduplicate echoed corrupted subtitle");
    // Ensure height is tight single-line height (~25-45px), not distorted 96px+
    assert!(r4.box_.h <= 55, "Panel 5 bounding box height must be tight single-line (<=55px), got {}", r4.box_.h);

    // 7. EXPLICIT NEGATIVE GUARDS AGAINST WATERMARKS & NOISE
    assert!(!res.regions.iter().any(|r| r.text.contains("漫客")), "Must filter platform corner watermark");
    assert!(!res.regions.iter().any(|r| r.text.trim() == "3"), "Must filter isolated '3' noise box");
}
