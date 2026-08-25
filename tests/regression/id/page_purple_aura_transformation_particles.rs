// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # INDONESIAN REAL-PAGE REGRESSION: `page_purple_aura_transformation_particles.webp` (RESOLUTION: 720 × 2078)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PURE VISUAL ACTION / TRANSFORMATION ARTWORK PRESERVATION**:
///   GUARANTEES THAT FULL-PAGE TRANSFORMATION AND PURPLE AURA PARTICLE EFFECTS CONTAINING ZERO
///   SPEECH BUBBLES OR DIALOGUE PRODUCE EXACTLY 0 FALSE-POSITIVE REGIONS.
/// - **ZERO ARTIFACT HALLUCINATIONS**:
///   ENSURES NO REGION CONTAINS COAT CREASE / AURA PARTICLE ARTIFACTS LIKE `"8.0"` OR `"0°0"`.
#[test]
fn test_regression_page_purple_aura_transformation_particles() {
    let img = match crate::common::load_fixture_or_skip("id", "page_purple_aura_transformation_particles.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_purple_aura_transformation_particles: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("id"));
    println!("Indonesian Particle Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 0 REGIONS (PURE VISUAL ARTWORK PAGE)
    crate::assert_element_counts!(res, 0, 0, 0, 0);

    // 2. EXPLICIT NEGATIVE GUARDS AGAINST PARTICLE NOISE HALLUCINATIONS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("8.0") || r.text.contains("8") || r.text.contains("0°0")),
        "Must never hallucinate '8.0' or '0°0' on particle background artwork"
    );
}
