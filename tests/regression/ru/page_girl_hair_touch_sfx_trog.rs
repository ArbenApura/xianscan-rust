// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # RUSSIAN REAL-PAGE REGRESSION: `page_girl_hair_touch_sfx_trog.webp` (RESOLUTION: 720 × 2046)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **UPPER DIALOGUE BUBBLE**:
///   GUARANTEES `«ого...»` IS CLEANLY EXTRACTED WITH ITS BUBBLE CONTAINER.
/// - **SLANTED TOUCH SFX**:
///   GUARANTEES `«трог»` IS CLEANLY EXTRACTED AS SOUNDEFFECT.
/// - **LOWER DIALOGUE BUBBLE**:
///   GUARANTEES `«КАКОЙ ЖЕ ОН\nКРАСАВЧИК.»` IS CLEANLY EXTRACTED WITH ITS BUBBLE CONTAINER.
#[test]
fn test_regression_page_girl_hair_touch_sfx_trog() {
    let img = match crate::common::load_fixture_or_skip("ru", "page_girl_hair_touch_sfx_trog.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_girl_hair_touch_sfx_trog: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ru"));
    println!("Russian Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT REGION COUNTS: EXACTLY 3 REGIONS (2 DIALOGUEBUBBLES, 1 SOUNDEFFECT, 0 FREETEXT)
    crate::assert_element_counts!(res, 3, 2, 1, 0);

    // 2. UPPER DIALOGUE BUBBLE:
    // TEXT BOUNDS: 'ого...' -> [X: 484, Y: 537, W: 84, H: 42]
    // OUTER SPEECH BUBBLE BOUNDS: [X: 410, Y: 430, W: 232, H: 252]
    let top_bubble = res.regions.iter().find(|r| r.text.to_lowercase().contains("ого"));
    assert!(top_bubble.is_some(), "Must detect upper speech bubble 'ого...'");
    let top_bubble = top_bubble.unwrap();
    assert_eq!(top_bubble.text.trim(), "ого...");
    crate::assert_region_bounds!(top_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 484, 537, 84, 42, 5);
    crate::assert_bubble_bounds!(top_bubble, 410, 430, 232, 252, 10);

    // 3. SLANTED CYRILLIC ACTION SFX: 'трог' -> [X: 44, Y: 1163, W: 290, H: 253] (ANGLE ~34.02 DEG)
    let sfx = res.regions.iter().find(|r| r.kind == xianscan_rust::ml::schemas::RegionKind::SoundEffect);
    assert!(sfx.is_some(), "Must detect Cyrillic sound effect 'трог'");
    let sfx = sfx.unwrap();
    assert_eq!(sfx.text.trim(), "трог");
    crate::assert_region_bounds!(sfx, xianscan_rust::ml::schemas::RegionKind::SoundEffect, 44, 1163, 290, 253, 10);
    crate::assert_region_angle!(sfx, 34.02, 3.0);

    // 4. LOWER DIALOGUE BUBBLE:
    // TEXT BOUNDS: 'КАКОЙ ЖЕ ОН\nКРАСАВЧИК.' -> [X: 388, Y: 1725, W: 224, H: 61]
    // OUTER SPEECH BUBBLE BOUNDS: [X: 359, Y: 1595, W: 284, H: 303]
    let bottom_bubble = res.regions.iter().find(|r| r.text.to_uppercase().contains("КРАСАВЧИК") || r.text.to_uppercase().contains("КАКОЙ"));
    assert!(bottom_bubble.is_some(), "Must detect lower speech bubble 'КАКОЙ ЖЕ ОН КРАСАВЧИК.'");
    let bottom_bubble = bottom_bubble.unwrap();
    crate::assert_region_bounds!(bottom_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 388, 1725, 224, 61, 6);
    crate::assert_bubble_bounds!(bottom_bubble, 359, 1595, 284, 303, 10);
}
