// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_elder_hmm_bubble_angle` (RESOLUTION: 690 × 1283)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **UPRIGHT DIALOGUE BUBBLE ANGLE**:
///   `"흐음..."` inside standard oval speech bubble must have an upright angle (`0.0°`),
///   preventing artificial tilt/rotation in typeset rendering.
/// - **EXACT COUNTS**: Exactly 1 dialogue bubble (1 bubble, 0 SFX, 0 free text).
#[test]
fn test_regression_page_elder_hmm_bubble_angle() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_elder_hmm_bubble_angle/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_elder_hmm_bubble_angle: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Elder Hmm Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 1 REGION (1 DIALOGUEBUBBLE, 0 SOUNDEFFECT, 0 FREETEXT)
    crate::assert_element_counts!(res, 1, 1, 0, 0);

    // 2. DIALOGUE BUBBLE: [X: 116, Y: 95, W: 140, H: 92]
    let hmm_bubble = &res.regions[0];
    assert_eq!(
        hmm_bubble.kind,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        "Must be classified as DialogueBubble"
    );
    assert!(
        hmm_bubble.text.contains("흐음"),
        "Must capture text '흐음', got: '{}'",
        hmm_bubble.text
    );
    crate::assert_region_bounds!(
        hmm_bubble,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        116,
        95,
        140,
        92,
        20
    );
    crate::assert_bubble_bounds!(hmm_bubble, 79, 60, 208, 187, 20);
    crate::assert_region_angle!(hmm_bubble, 0.0, 1.5);
}
