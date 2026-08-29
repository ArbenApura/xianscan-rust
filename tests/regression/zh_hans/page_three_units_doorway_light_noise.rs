// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_three_units_doorway_light_noise` (RESOLUTION: 880 × 2264)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP-LEFT SPARK ONOMATOPOEIA / SFX**: `"滋"` (Classified as SoundEffect)
/// - **TOP SPEECH BUBBLE**: `"我们到了。"` (DialogueBubble)
/// - **MIDDLE-LEFT SPEECH BUBBLE**: `"这……这楼房\n看起来有20\n年了吧……"` (DialogueBubble)
/// - **MIDDLE-RIGHT SPEECH BUBBLE**: `"放心啦~拎包入\n住，绝对干净卫\n生，而且每月租\n金才800。"` (DialogueBubble)
/// - **NEGATIVE GUARD**: Must NOT extract doorway sign / plaque `"单元"` / `"三单元"` as free text or dialogue.
#[test]
fn test_regression_page_three_units_doorway_light_noise() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_three_units_doorway_light_noise/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_three_units_doorway_light_noise: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!("Chinese Doorway Light SFX Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: 3 REGIONS (3 DIALOGUEBUBBLES, 0 FREETEXT)
    crate::assert_element_counts!(res, 3, 3, 0);

    // 2. NEGATIVE GUARD: NO TOP-LEFT SPARK ONOMATOPOEIA / SFX '滋' OR FREE TEXT
    assert!(
        !res.regions.iter().any(|r| r.text.contains('滋') || r.kind == RegionKind::FreeText),
        "Must NOT extract electric spark noise '滋' as FreeText"
    );

    // 3. TOP SPEECH BUBBLE: '我们到了。' [X: 599, Y: 192, W: 160, H: 50]
    let top_bubble = res.regions.iter().find(|r| r.text.contains("我们到了"));
    assert!(top_bubble.is_some(), "Must detect top speech bubble '我们到了。'");
    let top_bubble = top_bubble.unwrap();
    assert_eq!(top_bubble.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(top_bubble, RegionKind::DialogueBubble, 599, 192, 160, 50, 15);

    // 4. MIDDLE-LEFT SPEECH BUBBLE [X: 86, Y: 896, W: 206, H: 146]
    let mid_left_bubble = res.regions.iter().find(|r| r.text.contains("楼房") || r.text.contains("20"));
    assert!(mid_left_bubble.is_some(), "Must detect middle-left speech bubble");
    let mid_left_bubble = mid_left_bubble.unwrap();
    assert_eq!(mid_left_bubble.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(mid_left_bubble, RegionKind::DialogueBubble, 86, 896, 206, 146, 15);

    // 5. BOTTOM-RIGHT SPEECH BUBBLE [X: 626, Y: 997, W: 228, H: 170]
    let bot_right_bubble = res.regions.iter().find(|r| r.text.contains("放心啦") || r.text.contains("800"));
    assert!(bot_right_bubble.is_some(), "Must detect bottom-right speech bubble");
    let bot_right_bubble = bot_right_bubble.unwrap();
    assert_eq!(bot_right_bubble.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(bot_right_bubble, RegionKind::DialogueBubble, 626, 997, 228, 170, 15);

    // 6. NEGATIVE GUARD: NO DOORWAY SIGN / BACKGROUND PLAQUE '单元' / '三单元'
    assert!(
        !res.regions.iter().any(|r| r.text.contains("单元") || r.text.contains("三单元")),
        "Must NOT extract doorway plaque '单元'/'三单元'"
    );
}
