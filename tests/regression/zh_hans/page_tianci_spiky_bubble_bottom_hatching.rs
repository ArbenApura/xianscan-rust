// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_tianci_spiky_bubble_bottom_hatching` (RESOLUTION: 900 × 1954)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **SPIKY BUBBLE RADIATING STROKES INTEGRITY**: `"……天赐。"`
///   Exclamation/shock bubble surrounded by radiating black spikes with vertical hatching at bottom.
///   Top, left, and right borders maintain safe distance outside the spikes.
///   The downward hatching and spikes at the bottom must not be falsely severed as a pointer tail.
#[test]
fn test_regression_page_tianci_spiky_bubble_bottom_hatching() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_tianci_spiky_bubble_bottom_hatching/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_tianci_spiky_bubble_bottom_hatching, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));

    println!("Detected {} regions on page_tianci_spiky_bubble_bottom_hatching:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, box={:?}, bubble={:?}, carrier={:?}, typeset={:?}, text='{}'",
            i, r.kind, r.box_, r.bubble_box, r.carrier_box, r.typeset_box, r.text.replace('\n', " ")
        );
    }
    assert_eq!(res.regions.len(), 4, "Expected exactly 4 dialogue bubbles on page_tianci_spiky_bubble_bottom_hatching");

    for r in &res.regions {
        assert_eq!(r.kind, RegionKind::DialogueBubble, "All 4 regions must be DialogueBubble");
    }

    let r_tianci = res.regions.iter().find(|r| r.text.contains("天赐")).expect("Must find '……天赐。' bubble");
    assert!(r_tianci.bubble_box.is_some(), "Tianci bubble must have bubble_box");
    // Bottom radiating spikes from y=795..845 must remain uncovered and preserved
    // The text box and typeset box must safely stop before the bottom spikes (y <= 795)
    assert!(r_tianci.box_.y + r_tianci.box_.h <= 795, "Tianci text box bottom (y={}) must not cover bottom spikes (<= 795)", r_tianci.box_.y + r_tianci.box_.h);
    if let Some(ref tb) = r_tianci.typeset_box {
        assert!(tb.y + tb.h <= 795, "Tianci typeset box bottom (y={}) must not cover bottom spikes (<= 795)", tb.y + tb.h);
    }
}
