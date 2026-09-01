// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_sage_reincarnation_novice_skill` (RESOLUTION: 960 × 1863 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **GHOST FURIGANA / SUB-BOX ECHO DEDUPLICATION (`しょくょう / にんげん`)**:
///   PREVENTS A SPURIOUS DUPLICATE GHOST SUB-BOX FROM SPAWNING INSIDE THE TOP-RIGHT DIALOGUE BOX
///   (`名前のとおりまだちゃんとした職業を...`) DUE TO OVERLAPPING OCR LINES ON VERTICAL FURIGANA.
/// - **DIALOGUE INTEGRITY ACROSS VERTICAL UTTERANCES AND FREE TEXT**:
///   ENSURES ALL 6 DIALOGUE BUBBLES AND 2 FREE-TEXT NARRATION REGIONS ARE PROPERLY ISOLATED.
/// - **STRICT 8-REGION STRUCTURAL ACCOUNTING**:
///   EXACTLY 6 DIALOGUE BUBBLES, 0 SFX, AND 2 FREE TEXT.
#[test]
fn test_regression_page_sage_reincarnation_novice_skill() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_sage_reincarnation_novice_skill/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_sage_reincarnation_novice_skill: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 960x1863 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. NEGATIVE GUARDS AGAINST GHOST SUB-BOX FRAGMENTS
    assert!(
        !res.regions.iter().any(|r| {
            let t = r.text.trim();
            (t.contains("しょくょう") || t == "にんげん" || t == "しょくぎょう") && r.box_.w < 70 && r.box_.y > 150 && r.box_.y < 350 && r.box_.x > 800
        }),
        "Must eliminate duplicate ghost sub-box ('しょくょう' / 'にんげん') inside top-right dialogue"
    );

    // 1. TOP-RIGHT DIALOGUE BUBBLE: '名前のとおり\nまだちゃんとした職業を\n持っていない人間がつく\n職業だ'
    let top_right = res.regions.iter().find(|r| r.text.contains("名前のとおり") || (r.text.contains("ちゃんとした") && r.text.contains("職業")));
    assert!(top_right.is_some(), "Must detect top-right dialogue '名前のとおり...まだちゃんとした職業を...'");
    let top_right = top_right.unwrap();
    crate::assert_region_bounds!(top_right, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 781, 55, 149, 293, 15);

    // 2. TOP-LEFT DIALOGUE BUBBLE: '当然ノービスは\n一番弱い職業だが'
    let top_left = res.regions.iter().find(|r| r.text.contains("ノービス") && (r.text.contains("弱い") || r.text.contains("当然")));
    assert!(top_left.is_some(), "Must detect top-left dialogue '当然ノービスは一番弱い職業だが'");
    let top_left = top_left.unwrap();
    crate::assert_region_bounds!(top_left, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 193, 115, 112, 214, 15);

    // 3. MIDDLE-RIGHT DIALOGUE BUBBLE: 'ノービスにも\n一応スキルがある'
    let mid_right = res.regions.iter().find(|r| r.text.contains("一応スキルがある") || (r.text.contains("ノービスにも") && r.box_.y > 400 && r.box_.y < 800));
    assert!(mid_right.is_some(), "Must detect middle-right dialogue 'ノービスにも一応スキルがある'");
    let mid_right = mid_right.unwrap();
    crate::assert_region_bounds!(mid_right, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 804, 511, 102, 213, 15);

    // 4. MIDDLE-CENTER FREE TEXT: '試してみるか'
    let mid_center_free = res.regions.iter().find(|r| r.text.contains("試してみるか") || r.text.contains("試して"));
    assert!(mid_center_free.is_some(), "Must detect middle-center free text '試してみるか'");
    let mid_center_free = mid_center_free.unwrap();
    crate::assert_region_bounds!(mid_center_free, xianscan_rust::ml::schemas::RegionKind::FreeText, 429, 453, 58, 201, 15);

    // 5. MIDDLE-LEFT SPEECH BUBBLE: '『セルフキュア』'
    let self_cure = res.regions.iter().find(|r| r.text.contains("セルフキュア") || r.text.contains("キュア"));
    assert!(self_cure.is_some(), "Must detect middle-left dialogue '『セルフキュア』'");
    let self_cure = self_cure.unwrap();
    crate::assert_region_bounds!(self_cure, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 120, 587, 94, 215, 15);

    // 6. MIDDLE-LEFT VERTICAL NARRATION: 'これはノービスを含む\n全職業で習得できる\n最下級の回復魔法だ'
    let healing_narration = res.regions.iter().find(|r| r.text.contains("全職業で習得できる") || r.text.contains("回復魔法"));
    assert!(healing_narration.is_some(), "Must detect middle-left vertical narration 'これはノービスを含む...回復魔法だ'");
    let healing_narration = healing_narration.unwrap();
    crate::assert_region_bounds!(healing_narration, xianscan_rust::ml::schemas::RegionKind::FreeText, 168, 846, 133, 311, 15);

    // 7. BOTTOM-LEFT BUBBLE UTTERANCE 1: 'これが使えたと\nいうことは'
    let bot_left_utt1 = res.regions.iter().find(|r| r.text.contains("これが使えた") || r.text.contains("いうことは"));
    assert!(bot_left_utt1.is_some(), "Must detect bottom-left utterance 1 'これが使えたということは'");
    let bot_left_utt1 = bot_left_utt1.unwrap();
    crate::assert_region_bounds!(bot_left_utt1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 184, 1527, 88, 192, 15);

    // 8. BOTTOM-LEFT BUBBLE UTTERANCE 2: '今俺がいる世界の\nシステムは「BBO」と\n同じだな'
    let bot_left_utt2 = res.regions.iter().find(|r| (r.text.contains("今俺がいる世界") || r.text.contains("システムは")) && (r.text.contains("BBO") || r.text.contains("同じだな")));
    assert!(bot_left_utt2.is_some(), "Must detect bottom-left utterance 2 '今俺がいる世界のシステムはBBOと同じだな'");
    let bot_left_utt2 = bot_left_utt2.unwrap();
    crate::assert_region_bounds!(bot_left_utt2, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 18, 1572, 122, 267, 15);

    // 9. STRICT 8-REGION ACCOUNTING (6 DIALOGUE BUBBLES, 0 SFX, 2 FREE TEXT)
    crate::assert_element_counts!(res, 8, 6, 0, 2);
}
