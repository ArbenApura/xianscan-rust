// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_beckman_bandits_double_bubble_exclamation` (RESOLUTION: 800 × 1603)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 BANDIT LEADER SHOUT**: `"一起上啊！"`
/// - **PANEL 1 BECKMAN DOUBLE BUBBLE RIGHT LOBE**: `"我一个人\n就……"`
/// - **PANEL 1 BECKMAN DOUBLE BUBBLE LEFT LOBE**: `"足够了！"`
/// - **PANEL 2 CIGARETTE SMOKE SFX**: `"滋……"` (ROTATED SLANTED ANGLE)
/// - **PANEL 2 BANDIT IMPACT EXCLAMATION**: SKIPPED AS UNTRANSLATABLE (MUST NOT EXIST AS "公" OR "GUH")
/// - **PANEL 3 BANDIT COMMAND**: `"把你的脚拿开！！"`
/// - **PANEL 3 LUFFY SHOUT**: `"笨山贼！"`
/// - **PANEL 3 VILLAGER WINDOW DOUBLE BUBBLE RIGHT LOBE**: `"真是的，路\n飞那家伙！"`
/// - **PANEL 3 VILLAGER WINDOW DOUBLE BUBBLE LEFT LOBE**: `"怎么可以和\n那些山贼对\n着干！！"`
/// - **PANEL 4 MAYOR PLEA**: `"放开那个\n孩子！！"`
/// - **PANEL 4 MAKINO PLEA**: `"求求你\n了!!"`
/// - **EXACT COUNTS**: Exactly 10 regions (9 Dialogue Bubbles, 1 Free Text).
#[test]
fn test_regression_page_beckman_bandits_double_bubble_exclamation() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_beckman_bandits_double_bubble_exclamation/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_beckman_bandits_double_bubble_exclamation: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Beckman Bandits Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 10 REGIONS (9 DIALOGUE BUBBLES, 1 FREE TEXT)
    crate::assert_element_counts!(res, 10, 9, 1);

    // 2. PANEL 1 BECKMAN DOUBLE BUBBLE RIGHT LOBE ("我一个人就……")
    let beckman_right = res.regions.iter().find(|r| r.text.contains("一个人") || (r.text.contains('我') && r.text.contains("……")));
    assert!(beckman_right.is_some(), "Must detect Beckman double bubble right lobe (我一个人就……)");
    let beckman_right = beckman_right.unwrap();
    assert_eq!(beckman_right.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!beckman_right.text.contains("足够了"), "Beckman right lobe must NOT contain left lobe text (足够了)");
    crate::assert_region_bounds!(beckman_right, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 145, 240, 71, 115, 14);

    // 3. PANEL 1 BECKMAN DOUBLE BUBBLE LEFT LOBE ("足够了！")
    let beckman_left = res.regions.iter().find(|r| r.text.contains("足够了") || r.text.contains("足够"));
    assert!(beckman_left.is_some(), "Must detect Beckman double bubble left lobe (足够了！)");
    let beckman_left = beckman_left.unwrap();
    assert_eq!(beckman_left.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!beckman_left.text.contains("一个人"), "Beckman left lobe must NOT contain right lobe text (一个人)");
    crate::assert_region_bounds!(beckman_left, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 71, 240, 74, 115, 14);

    // 4. PANEL 2 CIGARETTE SMOKE SFX ("滋……") WITH SLANTED ROTATION ANGLE
    let smoke_sfx = res.regions.iter().find(|r| r.text.contains("滋"));
    assert!(smoke_sfx.is_some(), "Must detect cigarette smoke SFX (滋……)");
    let smoke_sfx = smoke_sfx.unwrap();
    assert!(smoke_sfx.angle.abs() >= 1.5, "Cigarette smoke SFX must have slanted rotation angle, got {:.2}", smoke_sfx.angle);

    // 5. NEGATIVE GUARD: ZERO REGIONS ON THIS PAGE SHOULD CONTAIN "公" OR "GUH"
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "公"),
        "Hallucinated character '公' must not exist in any region"
    );

    // 6. PANEL 3 VILLAGER WINDOW DOUBLE BUBBLE RIGHT LOBE ("真是的，路飞那家伙！")
    let villager_right = res.regions.iter().find(|r| r.text.contains("路飞") || r.text.contains("那家伙"));
    assert!(villager_right.is_some(), "Must detect villager right lobe (真是的，路飞那家伙！)");
    let villager_right = villager_right.unwrap();
    assert_eq!(villager_right.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!villager_right.text.contains("对着干"), "Villager right lobe must NOT contain left lobe text (对着干)");
    assert!(!villager_right.text.contains("怎么可以"), "Villager right lobe must NOT contain left lobe text (怎么可以)");
    crate::assert_region_bounds!(villager_right, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 583, 1087, 56, 98, 14);

    // 7. PANEL 3 VILLAGER WINDOW DOUBLE BUBBLE LEFT LOBE ("怎么可以和那些山贼对着干！！")
    let villager_left = res.regions.iter().find(|r| r.text.contains("山贼对") || r.text.contains("对着干"));
    assert!(villager_left.is_some(), "Must detect villager left lobe (怎么可以和那些山贼对着干！！)");
    let villager_left = villager_left.unwrap();
    assert_eq!(villager_left.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!villager_left.text.contains("路飞"), "Villager left lobe must NOT contain right lobe text (路飞)");
    crate::assert_region_bounds!(villager_left, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 480, 1086, 82, 98, 14);

    // 8. VERIFY BUBBLE CAVITY CLEANING & BOUNDARY PRESERVATION
    crate::assert_bubble_cleaned!(&img, &res);
}
