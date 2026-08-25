// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # INDONESIAN REAL-PAGE REGRESSION: `page_spiky_interrobang_caption.webp` (RESOLUTION: 720 × 1069)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **SPIKY INTERROBANG BUBBLE (`?!`)**:
///   STANDALONE PUNCTUATION / SYMBOL-ONLY REACTION BUBBLES ARE SKIPPED AS ACTIVE REGIONS.
/// - **LOWER NARRATION CAPTION BOX**:
///   `"YANG\nSEHARUSNYA\nSEPERTI BIASA."`
/// - **EXPLICIT NEGATIVE GUARDS**:
///   ENSURES NO REGION CONTAINS THE BIFURCATED DIGIT ARTIFACT `"21"` OR BULLET `"●"`.
/// - **EXACT COUNTS**: EXACTLY 1 REGION TOTAL (0 DIALOGUE BUBBLE, 0 SFX, 1 FREE TEXT).
#[test]
fn test_regression_page_spiky_interrobang_caption() {
    let img = match crate::common::load_fixture_or_skip("id", "page_spiky_interrobang_caption.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_spiky_interrobang_caption: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("id"));
    println!("Indonesian Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 1 REGION (0 DIALOGUEBUBBLE, 0 SFX, 1 FREETEXT)
    // STANDALONE SYMBOL-ONLY BUBBLE '?!' IS SKIPPED FROM ACTIVE REGIONS
    crate::assert_element_counts!(res, 1, 0, 0, 1);

    // 2. LOWER NARRATION CAPTION BOX:
    // TEXT: 'YANG\nSEHARUSNYA\nSEPERTI BIASA.' -> [X: 102, Y: 858, W: 250, H: 98]
    let narration = res.regions.iter().find(|r| {
        let t = r.text.to_uppercase();
        t.contains("SEHARUSNYA") || t.contains("SEPERTI BIASA") || t.contains("YANG")
    });
    assert!(narration.is_some(), "Must detect lower narration caption box");
    let narration = narration.unwrap();
    crate::assert_region_bounds!(narration, narration.kind, 102, 858, 250, 98, 10);
    assert!(
        narration.text.to_uppercase().contains("SEHARUSNYA") && narration.text.to_uppercase().contains("SEPERTI BIASA"),
        "Narration box must contain full text 'YANG SEHARUSNYA SEPERTI BIASA.'; got '{}'",
        narration.text
    );

    // 3. EXPLICIT NEGATIVE GUARDS AGAINST BIFURCATED DIGIT ARTIFACTS AND STANDALONE SYMBOLS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("21")),
        "Must never hallucinate '21' in place of '? / !'"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.contains("●")),
        "Must never hallucinate '●' from punctuation dots"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "?!" || r.text.trim() == "?" || r.text.trim() == "!"),
        "Standalone punctuation '?!' should be skipped from active regions"
    );
}
