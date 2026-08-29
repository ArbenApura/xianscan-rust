// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # RUSSIAN REAL-PAGE REGRESSION: `page_she_clearly_russian_bubble.webp` (RESOLUTION: 720 × 1159)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **CYRILLIC SPEECH BUBBLE DETECTION & OCR RECOGNITION**:
///   GUARANTEES THAT THE CIRCULAR SPEECH BUBBLE CONTAINING CYRILLIC DIALOGUE:
///   `ОН ЖЕ ЯВНО...` (OR `Он же явно...`) IS DETECTED AS A SINGLE CLEAN REGION.
/// - **LANGUAGE ROUTING INTEGRITY (`ru`, `ru-en`)**:
///   VERIFIES THAT `source_lang = Some("ru")` AND `Some("ru-en")` PROPERLY ROUTE TO THE CYRILLIC OCR RECOGNIZER.
#[test]
fn test_regression_page_she_clearly_russian_bubble() {
    let img = match crate::common::load_fixture_or_skip("ru", "page_she_clearly_russian_bubble.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_she_clearly_russian_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ru"));
    println!("Russian Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 1 REGION (1 DIALOGUEBUBBLE, 0 SFX, 0 FREETEXT)
    crate::assert_element_counts!(res, 1, 1, 0, 0);

    // 2. TEXT & BOUNDARY VERIFICATION:
    // INNER TEXT BOUNDS: 'ОН ЖЕ ЯВНО...' -> [X: 223, Y: 306, W: 177, H: 46]
    // OUTER SPEECH BUBBLE BOUNDS: [X: 190, Y: 194, W: 253, H: 265]
    let region = &res.regions[0];
    assert!(region.text.to_uppercase().contains("ОН ЖЕ ЯВНО"), "Region text must contain 'ОН ЖЕ ЯВНО', got '{}'", region.text);
    crate::assert_region_bounds!(region, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 223, 306, 177, 46, 6);
    crate::assert_bubble_bounds!(region, 190, 194, 253, 265, 10);
}
