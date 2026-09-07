// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_datong_verse_grand_harmony_conclusion` (RESOLUTION: 900 × 1228)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **CONCLUDING CALLIGRAPHY VERSE**: `"是谓大同。"`
///   Centered horizontally, intersecting the lower panel border.
///   Must be detected as a clean `FreeText` region.
#[test]
fn test_regression_page_datong_verse_grand_harmony_conclusion() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_datong_verse_grand_harmony_conclusion/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_datong_verse_grand_harmony_conclusion, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));

    println!("Detected {} regions on page_datong_verse_grand_harmony_conclusion:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, box={:?}, text='{}'",
            i, r.kind, r.box_, r.text.replace('\n', " ")
        );
    }

    assert_eq!(res.regions.len(), 1, "Expected exactly 1 calligraphy region on page_datong_verse_grand_harmony_conclusion");

    let r0 = &res.regions[0];
    assert_eq!(r0.kind, RegionKind::FreeText, "Region 0 must be FreeText");
    assert!(
        r0.text.contains("是谓大同") || r0.text.contains("大同"),
        "Region 0 text '{}' must match '是谓大同。'",
        r0.text
    );
}
