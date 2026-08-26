// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_dragon_spiky_sfx` (RESOLUTION: 314 × 1024)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **UPPER JAGGED BLACK DIALOGUE BUBBLE**: `"제법이구나,인간!\n하지만——!"`
/// - **LOWER JAGGED BLACK DIALOGUE BUBBLE**: `"더욱고통스럽게\n죽는길을택했을뿐!"`
/// - **STRICT REGION COUNT**: Exactly 2 FreeText regions, zero hallucinations, zero ghost boxes.
#[test]
fn test_regression_page_dragon_spiky_sfx() {
    let img = match crate::common::load_fixture_or_skip("ko", "sample_dragon_spiky_sfx/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_dragon_spiky_sfx: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Dragon Spiky SFX Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 2 REGIONS (0 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 2 FREETEXT)
    crate::assert_element_counts!(res, 2, 0, 0, 2);

    // 2. UPPER JAGGED BUBBLE: '제법이구나,인간!\n하지만——!' -> [X: ~55, Y: ~70, W: ~201, H: ~71]
    let r0 = &res.regions[0];
    assert_eq!(r0.kind, xianscan_rust::ml::schemas::RegionKind::FreeText);
    assert!(r0.text.contains("제법이구나") && r0.text.contains("하지만"), "Upper bubble must contain '제법이구나' and '하지만'");
    crate::assert_region_bounds!(r0, xianscan_rust::ml::schemas::RegionKind::FreeText, 55, 70, 201, 71, 10);

    // 3. LOWER JAGGED BUBBLE: '더욱고통스럽게\n죽는길을택했을뿐!' -> [X: ~87, Y: ~352, W: ~194, H: ~57]
    let r1 = &res.regions[1];
    assert_eq!(r1.kind, xianscan_rust::ml::schemas::RegionKind::FreeText);
    assert!(r1.text.contains("더욱") && r1.text.contains("죽는") && r1.text.contains("뿐"), "Lower bubble must contain '더욱' and '죽는'");
    crate::assert_region_bounds!(r1, xianscan_rust::ml::schemas::RegionKind::FreeText, 87, 352, 194, 57, 10);
}
