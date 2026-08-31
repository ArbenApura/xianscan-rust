// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_auto_skinning_furigana_narration/page.webp` (RESOLUTION: 960 × 1405 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **FURIGANA SPLIT ARTIFACT ELIMINATION**:
///   GUARANTEES THAT ISOLATED VERTICAL FURIGANA READINGS (E.G., `めんとう` FOR `面倒`, `と` FOR `剥ぎ取る`, `じっそう` FOR `実装`)
///   ARE NOT SPURIOUSLY DETECTED AS INDEPENDENT DIALOGUE REGIONS OR GHOST BOXES.
/// - **STEPPED NARRATION RECTANGLE & DIALOGUE INTEGRITY**:
///   ENSURES ALL SPEECH BUBBLES AND NARRATION BOXES ARE EXTRACTED WITH CLEAN BOUNDING BOXES,
///   PREVENTING FRAGMENTED OR DUPLICATE SUB-BOXES.
/// - **STRICT REGION ACCOUNTING**:
///   GUARANTEES ZERO ISOLATED GHOST FURIGANA SLIVERS ACROSS THE ENTIRE PAGE.
#[test]
fn test_regression_page_auto_skinning_furigana_narration() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_auto_skinning_furigana_narration/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_auto_skinning_furigana_narration: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 960x1405 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. NEGATIVE GUARDS AGAINST ISOLATED GHOST FURIGANA SLIVERS
    assert!(
        !res.regions.iter().any(|r| {
            let t = r.text.trim();
            t == "めんとう" || t == "めんどう" || t == "と" || t == "じっそう"
        }),
        "Must eliminate isolated furigana slivers ('めんとう', 'と', 'じっそう')"
    );

    // 1. TOP-RIGHT NARRATION: '倒した魔物から\n武器や防具に使える\n素材を剥ぎ取る'
    let top_right = res.regions.iter().find(|r| r.text.contains("魔物") || r.text.contains("剥ぎ取る") || r.text.contains("防具"));
    assert!(top_right.is_some(), "Must detect top-right narration '倒した魔物から 武器や防具に使える 素材を剥ぎ取る'");
    let top_right = top_right.unwrap();
    crate::assert_region_bounds!(top_right, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 720, 68, 132, 238, 15);

    // 2. TOP-LEFT NARRATION UPPER: '「グロい」「面倒くさい」\n「普通にドロップしろ」等と\n散々な言われようで'
    let top_left_upper = res.regions.iter().find(|r| r.text.contains("グロい") || r.text.contains("ドロップ") || r.text.contains("散々"));
    assert!(top_left_upper.is_some(), "Must detect top-left upper narration '「グロい」「面倒くさい」 「普通にドロップしろ」等と 散々な言われようで'");
    let top_left_upper = top_left_upper.unwrap();
    crate::assert_region_bounds!(top_left_upper, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 183, 62, 97, 263, 15);

    // 3. TOP-LEFT NARRATION LOWER: '最も不評な\nシステムだった'
    let top_left_lower = res.regions.iter().find(|r| r.text.contains("不評") || r.text.contains("システム"));
    assert!(top_left_lower.is_some(), "Must detect top-left lower narration '最も不評な システムだった'");
    let top_left_lower = top_left_lower.unwrap();
    crate::assert_region_bounds!(top_left_lower, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 77, 253, 64, 158, 15);

    // 4. MIDDLE-RIGHT NARRATION: 'あまりに不評なため\n自動で素材を剥ぎ取るスキル\n『オート剥ぎ取り』が実装された'
    let mid_right = res.regions.iter().find(|r| (r.text.contains("不評") || r.text.contains("自動で")) && (r.text.contains("オート") || r.text.contains("実装")));
    assert!(mid_right.is_some(), "Must detect middle-right narration 'あまりに不評なため 自動で素材を剥ぎ取るスキル 『オート剥ぎ取り』が実装された'");
    let mid_right = mid_right.unwrap();
    crate::assert_region_bounds!(mid_right, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 720, 509, 134, 368, 15);

    // 5. MIDDLE-CENTER SPEECH BUBBLE: '一応そっちの\n方法も\n試してみるか'
    let mid_center = res.regions.iter().find(|r| r.text.contains("一応") || r.text.contains("方法も") || r.text.contains("試してみる"));
    assert!(mid_center.is_some(), "Must detect middle-center speech bubble '一応そっちの 方法も 試してみるか'");
    let mid_center = mid_center.unwrap();
    crate::assert_region_bounds!(mid_center, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 483, 488, 120, 162, 15);

    // 6. MIDDLE-LEFT SPEECH BUBBLE: '『オート剥ぎ取り』'
    let auto_skinning = res.regions.iter().find(|r| r.text.contains("オート剥ぎ取り") && r.box_.y < 800 && r.box_.x < 500);
    assert!(auto_skinning.is_some(), "Must detect middle speech bubble '『オート剥ぎ取り』'");
    let auto_skinning = auto_skinning.unwrap();
    crate::assert_region_bounds!(auto_skinning, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 369, 476, 72, 180, 15);

    // 7. BOTTOM-RIGHT SPEECH BUBBLE: '反応がない'
    let bot_right = res.regions.iter().find(|r| r.text.contains("反応がない") || r.text.contains("反応"));
    assert!(bot_right.is_some(), "Must detect bottom-right speech bubble '反応がない'");
    let bot_right = bot_right.unwrap();
    crate::assert_region_bounds!(bot_right, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 826, 1039, 80, 137, 15);

    // 8. BOTTOM-CENTER SPEECH BUBBLE: '実装されていたら\n瞬間に解体されて\nいるはずだが…'
    let bot_center = res.regions.iter().find(|r| r.text.contains("解体されて") || r.text.contains("瞬間に") || (r.text.contains("実装") && r.box_.y > 900));
    assert!(bot_center.is_some(), "Must detect bottom-center speech bubble '実装されていたら 瞬間に解体されて いるはずだが…'");
    let bot_center = bot_center.unwrap();
    crate::assert_region_bounds!(bot_center, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 329, 1096, 118, 213, 15);

    // 9. BOTTOM-LEFT SPEECH BUBBLE: '…仕上げは\nどうだろう'
    let bot_left = res.regions.iter().find(|r| r.text.contains("仕上げ") || r.text.contains("どうだろう"));
    assert!(bot_left.is_some(), "Must detect bottom-left speech bubble '…仕上げは どうだろう'");
    let bot_left = bot_left.unwrap();
    crate::assert_region_bounds!(bot_left, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 97, 1078, 62, 120, 15);

    // 10. STRICT STRUCTURAL ELEMENT COUNTS (9 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT)
    crate::assert_element_counts!(res, 9, 9, 0, 0);
}