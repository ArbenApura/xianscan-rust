// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_vampire_confrontation_spiky_shout_bubbles` (RESOLUTION: 880 x 1249)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 SHOUT BUBBLE**: `"下一个！"` (DialogueBubble, spiky burst bubble)
/// - **PANEL 2 SHOUT BUBBLE**: `"轮到你了！"` (DialogueBubble, spiky burst bubble, must cover entire bubble artwork without false downward tail cut)
/// - **PANEL 3 SHOUT BUBBLE**: `"啊！"` (DialogueBubble, spiky burst bubble)
/// - **EXACT COUNTS**: Exactly 3 dialogue bubble regions.
#[test]
fn test_regression_page_vampire_confrontation_spiky_shout_bubbles() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_vampire_confrontation_spiky_shout_bubbles.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_vampire_confrontation_spiky_shout_bubbles: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Vampire Confrontation Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, bubble={:?}, carrier={:?}, typeset={:?}, text='{}'",
            i, r.kind, r.angle, r.box_, r.bubble_box, r.carrier_box, r.typeset_box, r.text);
    }

    // 1. EXACT ELEMENT COUNTS
    crate::assert_element_counts!(res, 3, 3, 0);

    // 2. PANEL 2 SHOUT BUBBLE: "轮到你了！"
    let your_turn = res.regions.iter().find(|r| r.text.contains("轮到你了") || r.text.contains("轮到"));
    assert!(your_turn.is_some(), "Must detect '轮到你了！' bubble");
    let your_turn = your_turn.unwrap();
    assert_eq!(your_turn.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    let bb = your_turn.bubble_box.as_ref().expect("Bubble box must exist");
    // Bubble box should span the full spiky artwork (~170x125)
    assert!(bb.w >= 150, "Bubble box width must cover spiky contour, got {}", bb.w);
    assert!(bb.h >= 110, "Bubble box height must cover spiky contour, got {}", bb.h);

    // CARRIER BOX (OR SQUIRLY CONTOUR) MUST NOT CHOP OFF THE LOWER SPIKES AS A FALSE TAIL
    if let Some(ref carrier) = your_turn.carrier_box {
        assert!(carrier.h >= 105, "Carrier box must not chop off bottom spikes");
        assert!((carrier.y + carrier.h) >= 595, "Carrier bottom must extend to lower spikes");
    }
}
