// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # INDONESIAN REAL-PAGE REGRESSION: `page_who_is_she_bottom_box.webp` (RESOLUTION: 720 × 1801)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TALL MANHWA STRIP BOTTOM-BOX BOUNDARY CAPTURE**:
///   GUARANTEES THAT BOTH NARRATION/DIALOGUE BOXES ACROSS THE TALL STRIP:
///   1. TOP BOX (LEFT-CENTER): `PEREMPUAN...?`
///   2. BOTTOM BOX (BOTTOM-RIGHT EDGE): `SIAPA DIA...?`
///      ARE CLEANLY DETECTED AND RECOGNIZED AS DISTINCT REGIONS.
/// - **LANGUAGE ROUTING INTEGRITY (`id`)**:
///   VERIFIES THAT `source_lang = Some("id")` CLEANLY PROCESSES LATIN UPPERCASE TEXT.
#[test]
fn test_regression_page_who_is_she_bottom_box() {
    let img = match crate::common::load_fixture_or_skip("id", "page_who_is_she_bottom_box.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_who_is_she_bottom_box: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("id"));
    println!("Indonesian Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 2 REGIONS (2 DIALOGUEBUBBLES, 0 SFX, 0 FREETEXT)
    crate::assert_element_counts!(res, 2, 2, 0, 0);

    // 2. UPPER DIALOGUE BOX:
    // TEXT BOUNDS: 'PEREMPUAN...?' -> [X: 38, Y: 481, W: 144, H: 82]
    // OUTER SPEECH BUBBLE BOUNDS: [X: 23, Y: 473, W: 176, H: 101]
    let top_box = res.regions.iter().find(|r| r.text.to_uppercase().contains("PEREMPUAN"));
    assert!(top_box.is_some(), "Must detect upper dialogue box 'PEREMPUAN...?'");
    let top_box = top_box.unwrap();
    assert_eq!(top_box.text.trim(), "PEREMPUAN...?");
    crate::assert_region_bounds!(top_box, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 38, 481, 144, 82, 5);
    crate::assert_bubble_bounds!(top_box, 23, 473, 176, 101, 10);

    // 3. LOWER DIALOGUE BOX:
    // TEXT BOUNDS: 'SIAPA DIA...?' -> [X: 194, Y: 923, W: 180, H: 28]
    // OUTER SPEECH BUBBLE BOUNDS: [X: 183, Y: 880, W: 206, H: 115]
    let bottom_box = res.regions.iter().find(|r| r.text.to_uppercase().contains("SIAPA"));
    assert!(bottom_box.is_some(), "Must detect lower dialogue box 'SIAPA DIA...?'");
    let bottom_box = bottom_box.unwrap();
    assert_eq!(bottom_box.text.trim(), "SIAPA DIA...?");
    crate::assert_region_bounds!(bottom_box, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 192, 889, 184, 96, 5);
    crate::assert_bubble_bounds!(bottom_box, 183, 880, 206, 115, 10);
}
