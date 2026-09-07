// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # CHINESE REAL-PAGE REGRESSION: page_dragon_blast_roar_bubbles (RESOLUTION: 900 × 1263)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 2 BLACK OVAL SPEECH BUBBLE**:
///   "嗷！嗷！！！" (DialogueBubble).
///   Must not be dropped despite white text on black background / dark panel artwork.
/// - **PANEL 3 BLACK CLOUD BUBBLE**:
///   "滚开！" (DialogueBubble).
///   Must be recognized as DialogueBubble, not FreeText.
/// - **EXACT COUNTS**: Exactly 2 dialogue bubbles, 0 SFX, 0 free text.
#[test]
fn test_regression_page_dragon_blast_roar_bubbles() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_dragon_blast_roar_bubbles/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_dragon_blast_roar_bubbles: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Dragon Blast Roar Bubbles Page detected {} regions:",
        res.regions.len()
    );
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}°, box={:?}, bubble_box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.bubble_box,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: 2 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT
    crate::assert_element_counts!(res, 2, 2, 0, 0);

    // 2. PANEL 2 BLACK OVAL SPEECH BUBBLE: "嗷！嗷！！！"
    let bubble_roar = &res.regions[0];
    assert_eq!(bubble_roar.kind, RegionKind::DialogueBubble);
    assert!(
        bubble_roar.text.contains("嗷"),
        "Bubble text must contain '嗷', got '{}'",
        bubble_roar.text
    );
    crate::assert_region_bounds!(bubble_roar, RegionKind::DialogueBubble, 554, 807, 115, 34, 15);
    crate::assert_bubble_bounds!(bubble_roar, 523, 782, 163, 83, 20);

    // 3. PANEL 3 BLACK CLOUD BUBBLE: "滚开！"
    let bubble_shout = &res.regions[1];
    assert_eq!(bubble_shout.kind, RegionKind::DialogueBubble);
    assert!(
        bubble_shout.text.contains("滚开"),
        "Bubble text must contain '滚开', got '{}'",
        bubble_shout.text
    );
    crate::assert_region_bounds!(bubble_shout, RegionKind::DialogueBubble, 761, 1164, 64, 36, 15);
    crate::assert_bubble_bounds!(bubble_shout, 746, 1138, 97, 81, 20);
}
