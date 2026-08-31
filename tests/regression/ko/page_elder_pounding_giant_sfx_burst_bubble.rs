// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_elder_pounding_giant_sfx_burst_bubble` (RESOLUTION: 690 × 1917)
///
/// ## CONTEXT & PURPOSE:
/// - Source: Production cloud page 8454 (seq 145), native 690 × 1917.
/// - Scene: Elder being pounded into the ground, surrounded by 7 giant red-black textured brush SFX
///   `"떠"` strokes, a top-right spiky bubble `"아주 그냥..."`, and a bottom-left burst bubble
///   `"곱게 죽이진\n않을테니 각오해!!"`.
/// - PRODUCTION FAILURE (v0.5.0-beta.1): The bottom burst bubble was missed by the bubble detector, so its
///   dialogue merged with a giant `떠` SFX glyph fragment (OCR read `파`) into one giant vertical FreeText
///   region spanning (2,1192,376×678) whose inpaint mask smeared the elder's artwork.
/// - EXPECTED: Exactly 2 DialogueBubbles (top + bottom), 0 FreeText, giant brush SFX fully untouched.
#[test]
fn test_regression_page_elder_pounding_giant_sfx_burst_bubble() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_elder_pounding_giant_sfx_burst_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_elder_pounding_giant_sfx_burst_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("=== Korean Elder Pounding Giant SFX Burst Bubble Page ===");
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 2 DIALOGUE BUBBLES, ZERO SFX, ZERO FREE TEXT
    crate::assert_element_counts!(res, 2, 2, 0, 0);

    // 2. TOP SPIKY BUBBLE: "아주 그냥..." (UPRIGHT, TIGHT BOUNDS)
    let top = &res.regions[0];
    assert_eq!(top.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(top.text.contains("아주") && top.text.contains("그냥"), "Top bubble text, got: '{}'", top.text.replace('\n', "\\n"));
    crate::assert_region_bounds!(top, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 410, 469, 211, 76, 8);
    crate::assert_bubble_bounds!(top, 374, 370, 279, 278, 8);
    crate::assert_region_angle!(top, 0.0, 2.0);

    // 3. BOTTOM BURST BUBBLE: "곱게 죽이진 / 않을테니각오해!!" (BOTH LINES, TIGHT ENVELOPE)
    let bottom = res
        .regions
        .iter()
        .find(|r| r.text.contains("각오해") || (r.text.contains("죽이진") && r.text.contains("않")))
        .expect("Bottom burst bubble dialogue must be detected");
    assert_eq!(
        bottom.kind,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        "Bottom burst bubble must be classified as dialogue"
    );
    assert!(
        bottom.text.contains("죽이진") && bottom.text.contains("각오해"),
        "Bottom bubble must capture both utterance lines, got: '{}'",
        bottom.text.replace('\n', "\\n")
    );
    assert!(bottom.bubble_box.is_some(), "Bottom bubble must carry a bubble envelope");
    crate::assert_region_bounds!(bottom, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 60, 1763, 326, 112, 10);
    crate::assert_bubble_bounds!(bottom, 4, 1608, 438, 308, 10);
    crate::assert_region_angle!(bottom, 0.0, 2.0);

    // 4. NEGATIVE GUARDS: NO GIANT 떠 BRUSH SFX, NO ARTWORK-SMEARING GIANT ENVELOPE
    assert!(
        !res.regions.iter().any(|r| r.kind == xianscan_rust::ml::schemas::RegionKind::FreeText),
        "Giant 떠 brush SFX fragments must not be extracted as FreeText"
    );
    for r in &res.regions {
        assert!(
            !(r.box_.w >= 300 && r.box_.h >= 400),
            "No giant artwork-smearing envelope allowed, got box={:?} for '{}'",
            r.box_,
            r.text.replace('\n', "\\n")
        );
    }
}
