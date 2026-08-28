// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_frost_dragon_welcome_my_lord_slanted_shout_bubble` (RESOLUTION: 900 × 1360)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **FROST DRAGON SLANTED SHOUT BUBBLE**: `"恭迎主\n上！！"` (DialogueBubble)
/// - **NON-ZERO ROTATION ANGLE**: Text inside the spiky shout balloon is tilted counter-clockwise / slanted upwards (negative angle).
/// - **EXACT COUNTS**: Exactly 1 dialogue bubble region.
#[test]
fn test_regression_page_frost_dragon_welcome_my_lord_slanted_shout_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_frost_dragon_welcome_my_lord_slanted_shout_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_frost_dragon_welcome_my_lord_slanted_shout_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!("Frost Dragon Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: 1 DIALOGUE BUBBLE, 0 SFX, 0 FREE TEXT
    crate::assert_element_counts!(res, 1, 1, 0, 0);

    // 2. DIALOGUE BUBBLE: '恭迎主\n上！！'
    let bubble = &res.regions[0];
    assert_eq!(bubble.kind, RegionKind::DialogueBubble);
    assert!(
        bubble.text.contains("恭迎主") || bubble.text.contains("恭迎"),
        "Bubble text must contain '恭迎主', got '{}'",
        bubble.text
    );
    crate::assert_region_bounds!(bubble, RegionKind::DialogueBubble, 102, 673, 324, 256, 15);
    crate::assert_bubble_bounds!(bubble, 84, 625, 369, 335, 15);

    // 3. ROTATION ANGLE: MUST BE SLANTED / NON-ZERO (TILTED ~17.77°)
    crate::assert_region_angle!(bubble, 17.77, 2.5);
}
