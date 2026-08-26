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

    // 1. EXACT ELEMENT COUNTS: 4 REGIONS (3 DIALOGUEBUBBLES, 1 SOUNDEFFECT, 0 FREETEXT)
    crate::assert_element_counts!(res, 4, 3, 1, 0);

    // 2. TOP-LEFT SPARK SFX: '滋'
    let sfx = res.regions.iter().find(|r| r.kind == RegionKind::SoundEffect);
    assert!(sfx.is_some(), "Must detect electric spark SFX '滋' as SoundEffect");
    let sfx = sfx.unwrap();
    assert!(sfx.text.contains('滋'), "SFX text must be '滋'");

    // 3. TOP SPEECH BUBBLE: '我们到了。' [X: ~607, Y: ~198, W: ~145, H: ~38]
    let top_bubble = res.regions.iter().find(|r| r.text.contains("我们到了"));
    assert!(top_bubble.is_some(), "Must detect top speech bubble '我们到了。'");
    let top_bubble = top_bubble.unwrap();
    assert_eq!(top_bubble.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(top_bubble, RegionKind::DialogueBubble, 607, 198, 145, 38, 15);

    // 4. MIDDLE-LEFT SPEECH BUBBLE [X: ~101, Y: ~909, W: ~176, H: ~121]
    let mid_left_bubble = res.regions.iter().find(|r| r.text.contains("楼房") || r.text.contains("20"));
    assert!(mid_left_bubble.is_some(), "Must detect middle-left speech bubble");
    let mid_left_bubble = mid_left_bubble.unwrap();
    assert_eq!(mid_left_bubble.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(mid_left_bubble, RegionKind::DialogueBubble, 101, 909, 176, 121, 15);

    // 5. MIDDLE-RIGHT SPEECH BUBBLE [X: ~626, Y: ~1004, W: ~228, H: ~156]
    let mid_right_bubble = res.regions.iter().find(|r| r.text.contains("放心啦") || r.text.contains("800"));
    assert!(mid_right_bubble.is_some(), "Must detect middle-right speech bubble");
    let mid_right_bubble = mid_right_bubble.unwrap();
    assert_eq!(mid_right_bubble.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(mid_right_bubble, RegionKind::DialogueBubble, 626, 1004, 228, 156, 15);

    // 6. NEGATIVE GUARD: NO DOORWAY SIGN / BACKGROUND PLAQUE '单元' / '三单元'
    assert!(
        !res.regions.iter().any(|r| r.text.contains("单元") || r.text.contains("三单元")),
        "Must NOT extract doorway plaque '单元'/'三单元'"
    );
}
