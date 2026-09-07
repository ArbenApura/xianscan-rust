// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # INDONESIAN REAL-PAGE REGRESSION: `page_magic_circle_stylized_exclamation.webp` (RESOLUTION: 720 × 1467)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **STYLIZED EXCLAMATION ARTWORK IN SPEECH BUBBLE**:
///   THE PAGE CONTAINS A SINGLE SPEECH BUBBLE HOUSING A LARGE, STYLIZED ORANGE EXCLAMATION MARK ARTWORK.
/// - **ZERO DETECTED REGIONS INVARIANT**:
///   BECAUSE THIS IS PURE GRAPHIC ARTWORK / EMOTIVE PUNCTUATION REQUIRING NO TRANSLATION OR INPAINTING,
///   IT MUST NOT BE DETECTED AS A TRANSLATABLE DIALOGUE REGION.
/// - **NEGATIVE GUARD AGAINST DIGIT NOISE**:
///   ENSURES THE TOP VERTICAL BAR AND BOTTOM CIRCULAR DOT OF THE EXCLAMATION ARE NEVER MISRECOGNIZED AS "10".
/// - **EXACT COUNTS**: EXACTLY 0 REGIONS TOTAL (0 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT).
#[test]
fn test_regression_page_magic_circle_stylized_exclamation() {
    let img = match crate::common::load_fixture_or_skip("id", "page_magic_circle_stylized_exclamation.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_magic_circle_stylized_exclamation: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("id"));
    println!("Indonesian Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 0 REGIONS (0 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT)
    crate::assert_element_counts!(res, 0, 0, 0, 0);

    // 2. EXPLICIT NEGATIVE GUARD AGAINST "10" AND PHANTOM DIALOGUE
    assert!(
        res.regions.is_empty(),
        "Page must have 0 detected regions; stylized exclamation art requires no translation"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.contains("10")),
        "Must never hallucinate '10' from stylized exclamation point art"
    );
}
