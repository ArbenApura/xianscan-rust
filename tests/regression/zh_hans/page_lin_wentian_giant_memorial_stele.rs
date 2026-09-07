// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_lin_wentian_giant_memorial_stele` (RESOLUTION: 900 × 1888)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **BACKGROUND SCENERY MONUMENT SUPPRESSION**:
///   Depicts a giant outdoor stone memorial stele with decorative squiggles and a carved header.
///   Contains NO speech bubbles or dialogue.
///   Must detect 0 regions (`regionsCount: 0`).
#[test]
fn test_regression_page_lin_wentian_giant_memorial_stele() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_lin_wentian_giant_memorial_stele/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_lin_wentian_giant_memorial_stele, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));

    println!("Detected {} regions on page_lin_wentian_giant_memorial_stele:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, box={:?}, text='{}'",
            i, r.kind, r.box_, r.text.replace('\n', " ")
        );
    }

    assert_eq!(res.regions.len(), 0, "Expected 0 regions on pure scenery memorial stele page_lin_wentian_giant_memorial_stele");
}
