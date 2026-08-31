// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_korean_scream_kkaaak_spiky_bubble` (RESOLUTION: 690 × 1294)
///
/// ## CONTEXT & PURPOSE:
/// - Source: `Ch_01_P119_source.webp`
/// - Scene: Upper spiky balloon contains vertical scream: `"끄아아아악!!"` (or `"끄\n아\n아\n아\n악\n!!"`).
/// - Lower round balloon contains 3-line dialogue: `"곧 견디기 힘든\n큰 고통이 찾아오면\n정신을 잃었다가"`.
/// - EXPECTED: Exactly 2 dialogue bubbles (2 bubbles, 0 SFX, 0 free text).
#[test]
fn test_regression_page_korean_scream_kkaaak_spiky_bubble() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_korean_scream_kkaaak_spiky_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_korean_scream_kkaaak_spiky_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("=== Korean Scream Kkaaak Page ===");
    println!("Detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  [Region {}] id={}, kind={:?}, text=\"{}\", conf={:.3}, angle={:.2}, box={:?}, bubble_box={:?}, typeset_box={:?}, inpaint_box={:?}",
            i,
            r.id,
            r.kind,
            r.text.replace('\n', "\\n"),
            r.confidence,
            r.angle,
            r.box_,
            r.bubble_box,
            r.typeset_box,
            r.inpaint_box
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 2 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 2, 2, 0, 0);

    // 2. UPPER SPIKY BUBBLE: DETECTS VERTICAL SCREAM OCCUPYING THE TALL BALLOON
    let upper = res.regions.iter().find(|r| r.bubble_box.as_ref().map(|b| b.y < 500).unwrap_or(false))
        .expect("Upper spiky bubble must exist");
    assert_eq!(
        upper.kind,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        "Upper region must be classified as DialogueBubble"
    );
    crate::assert_region_bounds!(
        upper,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        450,
        230,
        166,
        438,
        15
    );
    crate::assert_bubble_bounds!(upper, 402, 124, 268, 632, 15);
    crate::assert_region_angle!(upper, 0.0, 2.0);
    assert!(
        upper.text.contains("우우") || upper.text.contains("끄아"),
        "Upper spiky bubble must capture the scream syllables, got: '{}'",
        upper.text
    );
    assert!(
        upper.text.contains("!!"),
        "Upper spiky bubble must capture exclamation marks, got: '{}'",
        upper.text
    );

    // 3. LOWER ROUND BUBBLE: MUST CONTAIN FULL 3-LINE DIALOGUE
    let lower = res.regions.iter().find(|r| r.bubble_box.as_ref().map(|b| b.y > 800).unwrap_or(false))
        .expect("Lower round bubble must exist");
    assert_eq!(
        lower.kind,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        "Lower region must be classified as DialogueBubble"
    );
    assert!(
        lower.text.contains("견디기") && lower.text.contains("고통") && lower.text.contains("정신"),
        "Lower bubble must capture full dialogue, got: '{}'",
        lower.text
    );
    crate::assert_region_bounds!(
        lower,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        54,
        1026,
        342,
        182,
        15
    );
    crate::assert_bubble_bounds!(lower, 8, 971, 424, 288, 15);
    crate::assert_region_angle!(lower, 0.0, 2.0);
}