// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_wild_boar_kengchi_fireball_woyelai` (RESOLUTION: 800 × 1306)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 WILD BOAR PANTING ONOMATOPOEIA**:
///   `"吭哧吭哧！"` (SoundEffect / FreeText, monster heavy breathing).
///   - MUST NOT be pruned or dropped as background noise.
/// - **PANEL 2 LEFT SHOUT BUBBLE**:
///   `"我也来！"` (DialogueBubble).
///   - MUST retain the terminal exclamation mark `"！"`.
/// - **PANEL 2 RIGHT SHOUT BUBBLE**:
///   `"火球——射！"` (DialogueBubble).
/// - **EXPLICIT NEGATIVE GUARDS**:
///   - MUST NOT DROP '吭哧吭哧！'.
///   - MUST NOT DROP TERMINAL EXCLAMATION MARK '！' FROM '我也来！'.
///   - MUST NOT DETECT '漫客栈' PUBLISHER WATERMARK.
/// - **EXACT COUNTS**: EXACTLY 3 REGIONS TOTAL (2 DIALOGUE BUBBLES, 1 SFX / FREE TEXT).
#[test]
fn test_regression_page_wild_boar_kengchi_fireball_woyelai() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_wild_boar_kengchi_fireball_woyelai/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_wild_boar_kengchi_fireball_woyelai: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Wild Boar Kengchi Fireball Page detected {} regions:",
        res.regions.len()
    );
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}°, box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 3 REGIONS TOTAL (2 DIALOGUE BUBBLES)
    assert_eq!(
        res.regions.len(),
        3,
        "Expected exactly 3 regions total, got {}",
        res.regions.len()
    );
    let bubble_count = res
        .regions
        .iter()
        .filter(|r| r.kind == RegionKind::DialogueBubble)
        .count();
    assert_eq!(
        bubble_count, 2,
        "Expected exactly 2 dialogue bubbles, got {}",
        bubble_count
    );

    // 2. PANEL 1 WILD BOAR PANTING ONOMATOPOEIA: '吭哧吭哧！'
    let boar_sfx = res.regions.iter().find(|r| r.text.contains("吭哧"));
    assert!(
        boar_sfx.is_some(),
        "Must detect wild boar panting sound effect '吭哧吭哧！'"
    );
    let boar_sfx = boar_sfx.unwrap();
    assert!(
        boar_sfx.text.contains("吭哧吭哧"),
        "Onomatopoeia must contain full phrase '吭哧吭哧', got '{}'",
        boar_sfx.text
    );

    // 3. PANEL 2 LEFT SHOUT BUBBLE: '我也来！' (Must retain exclamation mark)
    let bubble_woye = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("我也来")
    });
    assert!(
        bubble_woye.is_some(),
        "Must detect panel 2 left shout bubble '我也来！'"
    );
    let bubble_woye = bubble_woye.unwrap();
    assert!(
        bubble_woye.text.contains('！') || bubble_woye.text.contains('!'),
        "Shout bubble must retain terminal exclamation mark '！', got '{}'",
        bubble_woye.text
    );
    crate::assert_region_bounds!(bubble_woye, RegionKind::DialogueBubble, 62, 946, 141, 44, 15);
    crate::assert_bubble_bounds!(bubble_woye, 53, 932, 159, 73, 15);

    // 4. PANEL 2 RIGHT SHOUT BUBBLE: '火球——射！'
    let bubble_fire = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("火球")
    });
    assert!(
        bubble_fire.is_some(),
        "Must detect panel 2 right shout bubble '火球——射！'"
    );
    let bubble_fire = bubble_fire.unwrap();
    assert!(
        bubble_fire.text.contains("射"),
        "Shout bubble must contain verb '射', got '{}'",
        bubble_fire.text
    );
    crate::assert_region_bounds!(bubble_fire, RegionKind::DialogueBubble, 396, 919, 213, 52, 15);
    crate::assert_bubble_bounds!(bubble_fire, 376, 898, 252, 94, 15);

    // 5. EXPLICIT NEGATIVE GUARDS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客栈")),
        "Must NOT detect publisher watermark '漫客栈'"
    );
}
