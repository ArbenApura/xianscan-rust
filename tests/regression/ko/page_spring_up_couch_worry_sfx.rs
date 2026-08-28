// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_spring_up_couch_worry_sfx` (RESOLUTION: 690 × 1800)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP NARRATION CONTAINER**: `"그리고 그 불안은 당장\n내 삶이 어떻게 될지도\n모른다는 걱정을 만들었다."` (DialogueBubble / Narration)
/// - **SLANTED ONOMATOPOEIA / SFX**: `"벌떡"` (Classified as SoundEffect with non-zero angle, NOT FreeText)
/// - **MIDDLE THOUGHT BUBBLE**: `"부모님한테\n말할까?"`
/// - **BOTTOM THOUGHT BUBBLE**: `"아니야, 엄마\n쓰러질지도\n몰라."`
#[test]
fn test_regression_page_spring_up_couch_worry_sfx() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_spring_up_couch_worry_sfx/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_spring_up_couch_worry_sfx: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Spring Up SFX Page detected {} regions:", res.regions.len());
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

    // 2. NEGATIVE GUARD: NO SLANTED SFX '벌떡' EXTRACTED AS FREETEXT
    assert!(!res.regions.iter().any(|r| r.text.contains("벌떡")), "Must NOT extract '벌떡' onomatopoeia as FreeText");

    // 3. TOP NARRATION BOX [X: ~282, Y: ~322, W: ~371, H: ~170]
    let top_narration = res.regions.iter().find(|r| r.text.contains("그리고 그 불안은") || r.text.contains("불안은 당장"));
    assert!(top_narration.is_some(), "Must detect top narration box");
    let top_narration = top_narration.unwrap();
    assert_eq!(top_narration.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(top_narration, RegionKind::DialogueBubble, 282, 322, 371, 170, 15);

    // 4. MIDDLE THOUGHT BUBBLE [X: ~98, Y: ~972, W: ~190, H: ~100]
    let mid_bubble = res.regions.iter().find(|r| r.text.contains("부모님한테") || r.text.contains("말할까"));
    assert!(mid_bubble.is_some(), "Must detect middle thought bubble");
    let mid_bubble = mid_bubble.unwrap();
    assert_eq!(mid_bubble.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(mid_bubble, RegionKind::DialogueBubble, 98, 952, 190, 140, 15);

    // 5. BOTTOM THOUGHT BUBBLE [X: ~410, Y: ~1291, W: ~234, H: ~150]
    let bot_bubble = res.regions.iter().find(|r| r.text.contains("아니야, 엄마") || r.text.contains("쓰러질지도"));
    assert!(bot_bubble.is_some(), "Must detect bottom thought bubble");
    let bot_bubble = bot_bubble.unwrap();
    assert_eq!(bot_bubble.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(bot_bubble, RegionKind::DialogueBubble, 410, 1278, 234, 176, 15);
}
