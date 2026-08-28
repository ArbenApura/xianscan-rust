// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_polyp_discovered_spiky_punctuation_bubble` (RESOLUTION: 690 × 1722)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 DIALOGUE BUBBLE**: `"여기 작은 용종이\n발견되었습니다."`
/// - **PANEL 2 STANDALONE PUNCTUATION REACTION**: `"?!"` (SKIPPED AS PURE SYMBOL REGION)
/// - **UNIVERSAL SYMBOL FILTERING**: ISOLATED PUNCTUATION / SYMBOLS ONLY ARE SKIPPED AS ACTIVE REGIONS.
/// - **EXACT COUNTS**: EXACTLY 1 REGION TOTAL (1 DIALOGUE BUBBLE, 0 SFX, 0 FREE TEXT).
#[test]
fn test_regression_page_polyp_discovered_spiky_punctuation_bubble() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_polyp_discovered_spiky_punctuation_bubble.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_polyp_discovered_spiky_punctuation_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("KO Polyp Discovered Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 1 REGION (1 DIALOGUE BUBBLE, 0 SFX, 0 FREE TEXT)
    // STANDALONE SYMBOL-ONLY BUBBLE '?!' MUST BE SKIPPED FROM ACTIVE REGIONS
    crate::assert_element_counts!(res, 1, 1, 0, 0);

    // 2. PANEL 1 DIALOGUE BUBBLE: '여기 작은 용종이\n발견되었습니다.'
    let dialogue = res
        .regions
        .iter()
        .find(|r| r.text.contains("용종") || r.text.contains("발견"));
    assert!(dialogue.is_some(), "Must detect dialogue bubble '여기 작은 용종이...'");
    let dialogue = dialogue.unwrap();
    assert!(
        dialogue.text.contains("여기 작은 용종이") && dialogue.text.contains("발견"),
        "Dialogue bubble text must contain the full polyp diagnosis message: '{}'",
        dialogue.text
    );
    crate::assert_region_bounds!(
        dialogue,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        34,
        340,
        430,
        202,
        15
    );
    if let Some(ref b_box) = dialogue.bubble_box {
        assert!(
            (b_box.x - 15).abs() <= 15 && (b_box.y - 322).abs() <= 15,
            "Outer bubble envelope should match speech balloon bounds"
        );
    }

    // 3. NEGATIVE CHECKS: STANDALONE PUNCTUATION '?!' AND SPIKY BRACKET NOISE ARE SUPPRESSED
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "?!" || r.text.trim() == "?" || r.text.trim() == "!"),
        "Standalone punctuation '?!' should be skipped from active regions"
    );
    for r in &res.regions {
        assert!(
            !r.text.contains('{'),
            "No region should contain curly bracket spike noise: '{}'",
            r.text
        );
        assert!(
            !r.text.contains("''"),
            "No region should contain apostrophe spike noise: '{}'",
            r.text
        );
    }
}
