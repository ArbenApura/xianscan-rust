// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_datong_verse_men_roles_women_homes` (RESOLUTION: 900 × 1222)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **CALLIGRAPHY NARRATION VERSE**: `"男有分，女有归。"`
///   Centered near the top panel border against the sky and roofline.
///   Must be detected as a clean `FreeText` region without being dropped by border or background filters.
#[test]
fn test_regression_page_datong_verse_men_roles_women_homes() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_datong_verse_men_roles_women_homes/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_datong_verse_men_roles_women_homes, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));

    println!("Detected {} regions on page_datong_verse_men_roles_women_homes:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, box={:?}, text='{}'",
            i, r.kind, r.box_, r.text.replace('\n', " ")
        );
    }

    assert_eq!(res.regions.len(), 1, "Expected exactly 1 calligraphy region on page_datong_verse_men_roles_women_homes");

    let r0 = &res.regions[0];
    assert_eq!(r0.kind, RegionKind::FreeText, "Region 0 must be FreeText");
    assert!(
        r0.text.contains("男有分") || r0.text.contains("女有归"),
        "Region 0 text '{}' must match '男有分，女有归。'",
        r0.text
    );
}
