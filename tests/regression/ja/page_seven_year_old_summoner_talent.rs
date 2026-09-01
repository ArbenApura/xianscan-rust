// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_seven_year_old_summoner_talent` (RESOLUTION: 1350 × 1968 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **STRICT 15-REGION ACCOUNTING (10 DIALOGUE BUBBLES, 0 SOUND EFFECTS, 5 FREE TEXT)**:
///   VERIFIES ALL 10 SPEECH BUBBLES AND 5 FREE-TEXT MONOLOGUES ACROSS ALL 4 PANELS.
/// - **FREE TEXT GUTTER SEPARATION (PANEL 3)**:
///   ENSURES `やっぱり\nこの力は…` (OR `やっぱり\nこのカは・`) IN THE GUTTER NEXT TO THE BOY IS CLASSIFIED AS `FreeText`
///   AND NOT WRONGLY BOUND TO THE ADJACENT DOUBLE SPEECH BALLOON.
/// - **COVER/TITLE LARGE BANNER RECOGNITION (PANEL 2)**:
///   VERIFIES `召喚術士` IS CAPTURED CLEANLY AS HORIZONTAL FREE TEXT.
#[test]
fn test_regression_page_seven_year_old_summoner_talent() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_seven_year_old_summoner_talent") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_seven_year_old_summoner_talent: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 1350x1968 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, box={:?}, text='{}', conf={:.2}, vert={}", i, r.kind, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. STRICT 16-REGION ACCOUNTING (10 DIALOGUE BUBBLES, 0 SOUND EFFECTS, 6 FREE TEXT)
    crate::assert_element_counts!(res, 16, 10, 0, 6);

    // 16. TOP-RIGHT PANEL - HAIR WHISPER FREE TEXT: 'ア… アリアを…'
    let hair_whisper = res.regions.iter().find(|r| (r.text.contains("アを") || r.text.contains("アリア") || r.text.contains("ア")) && r.box_.x >= 900 && r.box_.x < 1060 && r.box_.y > 100 && r.box_.y < 350);
    assert!(hair_whisper.is_some(), "Must detect hair whisper free text 'ア… アリアを…'");
    let hair_whisper = hair_whisper.unwrap();
    crate::assert_region_bounds!(hair_whisper, RegionKind::FreeText, 919, 103, 141, 221, 15);

    // 1. TOP-LEFT PANEL - TOP BUBBLE: '全世界でも稀な…'
    let rare_bubble = res.regions.iter().find(|r| r.text.contains("全世界") || r.text.contains("稀な"));
    assert!(rare_bubble.is_some(), "Must detect top-left bubble '全世界でも稀な…'");
    let rare_bubble = rare_bubble.unwrap();
    crate::assert_region_bounds!(rare_bubble, RegionKind::DialogueBubble, 448, 168, 134, 206, 15);
    crate::assert_bubble_bounds!(rare_bubble, 411, 116, 209, 312, 18);

    // 2. TOP-LEFT PANEL - MIDDLE BUBBLE: 'しかしアキラ… あなたは違います'
    let akira_bubble = res.regions.iter().find(|r| r.text.contains("アキラ") || r.text.contains("違います"));
    assert!(akira_bubble.is_some(), "Must detect middle bubble 'しかしアキラ… あなたは違います'");
    let akira_bubble = akira_bubble.unwrap();
    crate::assert_region_bounds!(akira_bubble, RegionKind::DialogueBubble, 668, 116, 168, 300, 15);
    crate::assert_bubble_bounds!(akira_bubble, 640, 91, 225, 350, 18);

    // 3. TOP-LEFT PANEL - BOTTOM BUBBLE: '各国からも 厚遇される 存在…'
    let nations_bubble = res.regions.iter().find(|r| r.text.contains("各国") || r.text.contains("厚遇"));
    assert!(nations_bubble.is_some(), "Must detect bottom bubble '各国からも 厚遇される 存在…'");
    let nations_bubble = nations_bubble.unwrap();
    crate::assert_region_bounds!(nations_bubble, RegionKind::DialogueBubble, 52, 463, 161, 228, 15);
    crate::assert_bubble_bounds!(nations_bubble, 17, 410, 238, 333, 18);

    // 4. TOP PANEL - FREE TEXT GUTTER: '所有できる… 器…？'
    let vessel_query = res.regions.iter().find(|r| r.text.contains("器…") && r.box_.x < 800);
    assert!(vessel_query.is_some(), "Must detect free text '所有できる… 器…？'");
    let vessel_query = vessel_query.unwrap();
    crate::assert_region_bounds!(vessel_query, RegionKind::FreeText, 674, 493, 100, 217, 15);

    // 5. TOP-RIGHT PANEL - UPPER BUBBLE: '確かにカルは 才気に満ちた 魔法使いですが'
    let karl_bubble = res.regions.iter().find(|r| r.text.contains("カル") || r.text.contains("才気") || r.text.contains("魔法使い"));
    assert!(karl_bubble.is_some(), "Must detect upper-right bubble '確かにカルは 才気に満ちた 魔法使いですが'");
    let karl_bubble = karl_bubble.unwrap();
    crate::assert_region_bounds!(karl_bubble, RegionKind::DialogueBubble, 1080, 123, 150, 235, 15);

    // 6. TOP-RIGHT PANEL - LOWER BUBBLE: '私を所有できる 器には 至らなかった'
    let possess_bubble = res.regions.iter().find(|r| r.text.contains("至らなかった") || (r.text.contains("私を所有できる") && r.box_.x > 1000));
    assert!(possess_bubble.is_some(), "Must detect lower-right bubble '私を所有できる 器には 至らなかった'");
    let possess_bubble = possess_bubble.unwrap();
    crate::assert_region_bounds!(possess_bubble, RegionKind::DialogueBubble, 1078, 422, 150, 238, 15);

    // 7. TITLE BANNER - FREE TEXT: '召喚術士'
    let summoner_title = res.regions.iter().find(|r| r.text.contains("召喚術士") && r.box_.y > 700 && r.box_.y < 1000);
    assert!(summoner_title.is_some(), "Must detect title banner '召喚術士'");
    let summoner_title = summoner_title.unwrap();
    crate::assert_region_bounds!(summoner_title, RegionKind::FreeText, 412, 792, 498, 166, 18);

    // 8. MIDDLE PANEL - LEFT BUBBLE: 'このまま成長して レベルを上げたら どれほどの 術士になるか…'
    let level_bubble = res.regions.iter().find(|r| r.text.contains("成長") || r.text.contains("レベル"));
    assert!(level_bubble.is_some(), "Must detect middle-left bubble 'このまま成長して レベルを上げたら…'");
    let level_bubble = level_bubble.unwrap();
    crate::assert_region_bounds!(level_bubble, RegionKind::DialogueBubble, 83, 1152, 211, 338, 15);
    crate::assert_bubble_bounds!(level_bubble, 39, 1090, 312, 459, 18);

    // 9. MIDDLE PANEL - LEFT FREE TEXT: 'そう認識 されてるんだ…'
    let recognized_free = res.regions.iter().find(|r| r.text.contains("そう認識") || r.text.contains("されてるんだ"));
    assert!(recognized_free.is_some(), "Must detect free text 'そう認識 されてるんだ…'");
    let recognized_free = recognized_free.unwrap();
    crate::assert_region_bounds!(recognized_free, RegionKind::FreeText, 364, 1162, 111, 274, 15);

    // 10. MIDDLE PANEL - RIGHT FREE TEXT: 'やっぱり このカは・' (FREE TEXT ON GUTTER)
    let power_free = res.regions.iter().find(|r| (r.text.contains("やっぱり") || r.text.contains("この")) && r.box_.x > 800 && r.box_.x < 920 && r.box_.y > 980 && r.box_.y < 1250);
    assert!(power_free.is_some(), "Must detect free text 'やっぱり この力は…' in middle panel gutter");
    let power_free = power_free.unwrap();
    crate::assert_region_bounds!(power_free, RegionKind::FreeText, 815, 1028, 114, 205, 18);

    // 11. MIDDLE PANEL - TOP RIGHT BUBBLE: 'しかも７歳で あんな巨大な存在を 召喚している'
    let seven_years_bubble = res.regions.iter().find(|r| r.text.contains("７歳") || r.text.contains("巨大な存在") || r.text.contains("召喚している"));
    assert!(seven_years_bubble.is_some(), "Must detect upper bubble 'しかも７歳で あんな巨大な存在を 召喚している'");
    let seven_years_bubble = seven_years_bubble.unwrap();
    crate::assert_region_bounds!(seven_years_bubble, RegionKind::DialogueBubble, 1053, 993, 139, 319, 18);

    // 12. MIDDLE PANEL - BOTTOM RIGHT BUBBLE: 'どんなに優れた 召喚術士でも 例がないことです'
    let precedent_bubble = res.regions.iter().find(|r| r.text.contains("例がない") || r.text.contains("優れた"));
    assert!(precedent_bubble.is_some(), "Must detect lower bubble 'どんなに優れた 召喚術士でも 例がないことです'");
    let precedent_bubble = precedent_bubble.unwrap();
    crate::assert_region_bounds!(precedent_bubble, RegionKind::DialogueBubble, 930, 1259, 140, 284, 18);

    // 13. BOTTOM PANEL - LEFT BUBBLE: '天から 授かった 才能…'
    let heaven_bubble = res.regions.iter().find(|r| r.text.contains("天から") || r.text.contains("授かった") || r.text.contains("才能"));
    assert!(heaven_bubble.is_some(), "Must detect bottom-left bubble '天から 授かった 才能…'");
    let heaven_bubble = heaven_bubble.unwrap();
    crate::assert_region_bounds!(heaven_bubble, RegionKind::DialogueBubble, 164, 1650, 191, 228, 15);
    crate::assert_bubble_bounds!(heaven_bubble, 120, 1580, 278, 371, 18);

    // 14. BOTTOM PANEL - FREE TEXT: 'やばい…'
    let yabai_free = res.regions.iter().find(|r| r.text.contains("やばい") && r.box_.y > 1600);
    assert!(yabai_free.is_some(), "Must detect bottom free text 'やばい…'");
    let yabai_free = yabai_free.unwrap();
    crate::assert_region_bounds!(yabai_free, RegionKind::FreeText, 829, 1671, 86, 253, 18);

    // 15. BOTTOM PANEL - RIGHT BUBBLE: '期待される しかない…'
    let expect_bubble = res.regions.iter().find(|r| r.text.contains("期待される") || r.text.contains("しかない"));
    assert!(expect_bubble.is_some(), "Must detect bottom-right bubble '期待される しかない…'");
    let expect_bubble = expect_bubble.unwrap();
    crate::assert_region_bounds!(expect_bubble, RegionKind::DialogueBubble, 1044, 1626, 160, 256, 15);
    crate::assert_bubble_bounds!(expect_bubble, 997, 1571, 255, 363, 18);
}
