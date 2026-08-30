// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_physician_seok_treatment_bubble_centering` (RESOLUTION: 690 × 1771)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP SPEECH BUBBLE (TAIL SKEWED)**:
///   `"이제 다시 진료받으러\n올 필요는 없겠군."`
///   Contains an elongated tail below. Safe-core centering is safely skipped so text remains
///   anchored in its natural upper position.
/// - **BOTTOM SPEECH BUBBLE (LANDSCAPE CENTERED)**:
///   `"석의원,\n그동안 고마웠네."`
///   Clean landscape speech balloon where text is centered. Typeset box expands to match the
///   inscribed safe core of the speech balloon.
/// - **EXACT COUNTS**: Exactly 2 dialogue bubbles (2 bubbles, 0 SFX, 0 free text).
#[test]
fn test_regression_page_physician_seok_treatment_bubble_centering() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_physician_seok_treatment_bubble_centering/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_physician_seok_treatment_bubble_centering: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Physician Seok Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}, box={:?}, bubble_box={:?}, typeset_box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.bubble_box,
            r.typeset_box,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 2 DIALOGUE BUBBLES (0 SFX, 0 FREE TEXT)
    crate::assert_element_counts!(res, 2, 2, 0, 0);

    // 2. TOP SPEECH BUBBLE: [X: 150, Y: 505, W: 211, H: 76] INSIDE BUBBLE [122, 450, 267, 202]
    let top_bubble = &res.regions[0];
    assert_eq!(
        top_bubble.kind,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        "Top region must be classified as DialogueBubble"
    );
    assert!(
        top_bubble.text.contains("진료") && top_bubble.text.contains("필요"),
        "Must contain top dialogue text, got: '{}'",
        top_bubble.text
    );
    crate::assert_region_bounds!(
        top_bubble,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        150,
        505,
        211,
        76,
        15
    );
    crate::assert_bubble_bounds!(top_bubble, 122, 450, 267, 202, 15);
    crate::assert_region_angle!(top_bubble, 0.0, 2.0);

    // VERIFY TOP TYPESET BOX CENTERS TO CARRIER CHAMBER
    if let Some(tb) = &top_bubble.typeset_box {
        assert!((tb.x - 150).abs() <= 5, "tb.x ({}) should be near 150", tb.x);
        assert!((tb.y - 505).abs() <= 5, "tb.y ({}) should be near 505", tb.y);
        assert_eq!(tb.w, 211);
        assert_eq!(tb.h, 76);
    }

    // 3. BOTTOM SPEECH BUBBLE: [X: 30, Y: 868, W: 168, H: 80] INSIDE BUBBLE [8, 841, 217, 151]
    let bot_bubble = &res.regions[1];
    assert_eq!(
        bot_bubble.kind,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        "Bottom region must be classified as DialogueBubble"
    );
    assert!(
        bot_bubble.text.contains("석") && bot_bubble.text.contains("고마웠"),
        "Must contain bottom dialogue text, got: '{}'",
        bot_bubble.text
    );
    crate::assert_region_bounds!(
        bot_bubble,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        30,
        868,
        168,
        80,
        15
    );
    crate::assert_bubble_bounds!(bot_bubble, 8, 841, 217, 151, 15);
    crate::assert_region_angle!(bot_bubble, 0.0, 2.0);

    // VERIFY BOTTOM TYPESET BOX PRESERVES BASE BOX DIMENSIONS AND CENTERS TO BUBBLE CENTROID
    if let Some(tb) = &bot_bubble.typeset_box {
        assert_eq!(tb.w, bot_bubble.box_.w, "Bottom typeset box width should match base box width");
        assert_eq!(tb.h, bot_bubble.box_.h, "Bottom typeset box height should match base box height");
        let bb = bot_bubble.bubble_box.as_ref().expect("bubble_box must exist");
        assert!((tb.x + tb.w / 2 - (bb.x + bb.w / 2)).abs() <= 5, "Bottom typeset box X center should match bubble X center");
        assert!((tb.y + tb.h / 2 - (bb.y + bb.h / 2)).abs() <= 5, "Bottom typeset box Y center should match bubble Y center");
    }
}
