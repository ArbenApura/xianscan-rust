use crate::common::{get_or_analyze_fixture_with_lang, load_fixture_or_skip};
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

#[test]
fn test_page_tied_pillar_iron_shackles_bottom_bubble() {
    let img = match load_fixture_or_skip(
        "ko",
        "page_tied_pillar_iron_shackles_bottom_bubble.webp",
    ) {
        Some(img) => img,
        None => return,
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));

    // 1. Structural Element Counts (2 Dialogue Bubbles, 0 SFX, 0 Free Text)
    assert_element_counts!(res, 2, 2, 0, 0);

    // 2. Top Bubble: "당장 설이에게\n돌아가야 하는데...\n제길!"
    let top_bubble = &res.regions[0];
    assert_eq!(top_bubble.kind, RegionKind::DialogueBubble);
    assert!(
        top_bubble.text.contains("당장 설이에게")
            && top_bubble.text.contains("돌아가야")
            && top_bubble.text.contains("제길!"),
        "Top bubble text mismatch: got {:?}",
        top_bubble.text
    );
    assert_region_bounds!(
        top_bubble,
        RegionKind::DialogueBubble,
        80,
        115,
        302,
        188,
        15
    );
    assert_bubble_bounds!(top_bubble, 30, 38, 401, 345, 15);

    // 3. Bottom Bubble: "현철로 묶어두어\n내공이 실린 무기가 아니면\n끊어지지 않겠구나!"
    let bottom_bubble = &res.regions[1];
    assert_eq!(bottom_bubble.kind, RegionKind::DialogueBubble);
    assert!(
        bottom_bubble.text.contains("현철로 묶어두어")
            && bottom_bubble.text.contains("내공이 실린 무기가 아니면")
            && bottom_bubble.text.contains("끊어지지 않겠구나!"),
        "Bottom bubble text mismatch: got {:?}",
        bottom_bubble.text
    );
    assert_region_bounds!(
        bottom_bubble,
        RegionKind::DialogueBubble,
        218,
        897,
        433,
        190,
        25
    );
    assert_bubble_bounds!(bottom_bubble, 205, 778, 457, 413, 20);

    // 4. Negative Guard: No noisy background artifacts or SFX rescue
    assert!(
        !res.regions.iter().any(|r| r.text.contains("철그럭")),
        "SFX 철그럭 should not be captured as a separate dialogue region"
    );
}
