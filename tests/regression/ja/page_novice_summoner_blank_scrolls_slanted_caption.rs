// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

#[test]
fn test_regression_page_novice_summoner_blank_scrolls_slanted_caption() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_novice_summoner_blank_scrolls_slanted_caption/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_novice_summoner_blank_scrolls_slanted_caption: fixture not found");
            return;
        }
    };
    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));

    println!("=== Japanese Novice Summoner Blank Scrolls Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, box={:?}, text='{}', conf={:.2}, angle={:.2}°, vert={}",
            i,
            r.kind,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence,
            r.angle,
            r.vertical
        );
    }

    // 1. EXACT REGION COUNT ASSERTION: 10 REGIONS TOTAL
    assert_eq!(res.regions.len(), 10, "Total region count mismatch: expected 10 regions on page 110000");

    // 2. REGION 0: TOP FREE TEXT 'その前に\nこれを\nこうしだ'
    let r0 = res.regions.iter().find(|r| r.text.contains("その前") || r.text.contains("これを"));
    assert!(r0.is_some(), "Must detect top narration 'その前に\\nこれを\\nこうしだ'");
    let r0 = r0.unwrap();
    assert_eq!(r0.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(r0, RegionKind::FreeText, 667, 78, 108, 127, 25);

    // 3. REGION 1: SLANTED FREE TEXT AT TOP LEFT
    let r1 = res.regions.iter().find(|r| r.box_.x >= 200 && r.box_.x <= 260 && r.box_.y >= 180 && r.box_.y <= 240);
    assert!(r1.is_some(), "Must detect top-left slanted monologue region");
    let r1 = r1.unwrap();
    assert_eq!(r1.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(r1, RegionKind::FreeText, 228, 201, 110, 89, 25);

    // 4. REGION 2: DIALOGUE BUBBLE '次は魔法の\n授業です！！'
    let r2 = res.regions.iter().find(|r| r.text.contains("次は魔法") || r.text.contains("授業です"));
    assert!(r2.is_some(), "Must detect bubble '次は魔法の\\n授業です！！'");
    let r2 = r2.unwrap();
    assert_eq!(r2.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r2, RegionKind::DialogueBubble, 154, 538, 196, 331, 25);

    // 5. REGION 3: DIALOGUE BUBBLE 'どんな邪な\n想像をしているかは\n知りませんが…'
    let r3 = res.regions.iter().find(|r| r.text.contains("どんな邪") || r.text.contains("知りません"));
    assert!(r3.is_some(), "Must detect bubble 'どんな邪な\\n想像をしているかは\\n知りませんが…'");
    let r3 = r3.unwrap();
    assert_eq!(r3.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r3, RegionKind::DialogueBubble, 949, 343, 178, 380, 25);

    // 6. REGION 4: DIALOGUE BUBBLE '魔力量が少ないなら\nスクロール作りに\n慣れなさい！'
    let r4 = res.regions.iter().find(|r| r.text.contains("魔力量") || r.text.contains("慣れなさい"));
    assert!(r4.is_some(), "Must detect bubble '魔力量が少ないなら\\nスクロール作りに\\n慣れなさい！'");
    let r4 = r4.unwrap();
    assert_eq!(r4.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r4, RegionKind::DialogueBubble, 583, 1030, 138, 304, 25);

    // 7. REGION 5: FREE TEXT '息子よ'
    let r5 = res.regions.iter().find(|r| r.text.contains("息子よ"));
    assert!(r5.is_some(), "Must detect text '息子よ'");
    let r5 = r5.unwrap();
    assert_eq!(r5.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(r5, RegionKind::FreeText, 954, 1198, 40, 105, 25);

    // 8. REGION 6: DIALOGUE BUBBLE '初級回復魔法を\nスクロール５枚\nすべてに\n記述すること！'
    let r6 = res.regions.iter().find(|r| r.text.contains("初級回復魔法") || r.text.contains("記述すること"));
    assert!(r6.is_some(), "Must detect bubble '初級回復魔法を\\nスクロール５枚...'");
    let r6 = r6.unwrap();
    assert_eq!(r6.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r6, RegionKind::DialogueBubble, 1104, 1004, 137, 184, 25);

    // 9. REGION 7: DIALOGUE BUBBLE 'できなかったら\n明日のおやつも\n抜きです！！'
    let r7 = res.regions.iter().find(|r| r.text.contains("できなかったら") || r.text.contains("抜きです"));
    assert!(r7.is_some(), "Must detect bubble 'できなかったら\\n明日のおやつも\\n抜きです！！'");
    let r7 = r7.unwrap();
    assert_eq!(r7.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r7, RegionKind::DialogueBubble, 65, 1082, 144, 252, 25);

    // 10. REGION 8: DIALOGUE BUBBLE '期限は\n朝までです！'
    let r8 = res.regions.iter().find(|r| r.text.contains("期限は") || r.text.contains("朝まで"));
    assert!(r8.is_some(), "Must detect bubble '期限は\\n朝までです！'");
    let r8 = r8.unwrap();
    assert_eq!(r8.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r8, RegionKind::DialogueBubble, 1135, 1367, 116, 209, 25);

    // 11. REGION 9: SLANTED CAPTION BOX '空の\nスクロール'
    let r9 = res.regions.iter().find(|r| r.text.contains("空の"));
    assert!(r9.is_some(), "Must detect slanted caption box '空の\\nスクロール'");
    let r9 = r9.unwrap();
    crate::assert_region_bounds!(r9, r9.kind, 722, 1717, 192, 98, 25);
    assert!(r9.text.contains("空の"), "Must contain '空の'");
    assert!(r9.text.contains("スクロール"), "Must contain 'スクロール'");
    assert!(r9.angle.abs() >= 2.0, "Slanted caption '空の\\nスクロール' must have non-zero rotation angle (got {:.2}°)", r9.angle);
}
