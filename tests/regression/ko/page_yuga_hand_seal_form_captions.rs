// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_yuga_hand_seal_form_captions` (RESOLUTION: 640 × 1275)
///
/// ## CONTEXT & PURPOSE:
/// - Scene: Single panel — open hand seal technique demonstration over dark forest artwork.
///   1. Speech bubble (TOP CENTER-RIGHT): `"내가\n할 말인데?"` (DialogueBubble)
///   2. Left vertical outlined technique caption `"유가견곤정"`: stacked one-syllable-per-line display
///      calligraphy — must be suppressed (artwork preserved).
///   3. Bottom-right vertical form label `"사초식"`: raw OCR misreads the stylized outline as `"서작"` (score 0.619) — must NOT be rescued as garbage text.
/// - Invariant: Only the real dialogue bubble is extracted; all stylized calligraphy lettering stays untouched.
#[test]
fn test_regression_page_yuga_hand_seal_form_captions() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_yuga_hand_seal_form_captions/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_yuga_hand_seal_form_captions: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("=== Korean Yuga Hand Seal Form Captions Page ===");
    println!("Detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  [Region {}] id={}, kind={:?}, text=\"{}\", conf={:.3}, angle={:.2}, vertical={}, box={:?}, bubble_box={:?}, typeset_box={:?}, inpaint_box={:?}",
            i,
            r.id,
            r.kind,
            r.text.replace('\n', "\\n"),
            r.confidence,
            r.angle,
            r.vertical,
            r.box_,
            r.bubble_box,
            r.typeset_box,
            r.inpaint_box
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 1 DIALOGUE BUBBLE (CALLIGRAPHY PRESERVED AS ARTWORK)
    crate::assert_element_counts!(res, 1, 1, 0, 0);

    // 2. DIALOGUE BUBBLE: "내가 / 할 말인데?" (TOP CENTER-RIGHT, HORIZONTAL, UPRIGHT)
    let bubble = &res.regions[0];
    assert_eq!(
        bubble.kind,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        "Only the dialogue bubble must be detected"
    );
    assert_eq!(
        bubble.text.trim(),
        "내가\n할 말인데?",
        "Bubble must capture the full two-line utterance"
    );
    assert!(bubble.bubble_box.is_some(), "Bubble-backed region must carry a bubble envelope");
    crate::assert_region_bounds!(bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 336, 120, 230, 142, 8);
    crate::assert_bubble_bounds!(bubble, 291, 80, 330, 235, 8);
    crate::assert_region_angle!(bubble, 0.0, 2.0);
    assert!(!bubble.vertical, "Bubble utterance must be horizontal LTR");

    // 3. NEGATIVE GUARDS: NO STACKED CALLIGRAPHY EXTRACTION, NO GARBAGE RESCUE OF THE MISREAD "사초식" LABEL
    assert!(
        !res.regions.iter().any(|r| r.kind == xianscan_rust::ml::schemas::RegionKind::FreeText),
        "Technique caption calligraphy must be suppressed, not extracted as FreeText"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "서작"),
        "Stylized form label must not leak as garbage text '서작'"
    );
    for r in &res.regions {
        assert!(
            r.text.chars().filter(|c| !c.is_whitespace()).count() >= 2,
            "No stray single-character hallucinations allowed, got: '{}'",
            r.text
        );
        assert!(
            r.box_.y + r.box_.h <= 1250,
            "No regions may dilate past the page artwork, got box={:?}",
            r.box_
        );
    }
}
