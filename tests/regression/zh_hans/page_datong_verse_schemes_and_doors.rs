// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_datong_verse_schemes_and_doors` (RESOLUTION: 900 × 1213)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **THREE CALLIGRAPHY NARRATION VERSES**:
///   1. `"是故谋闭而不兴，"` (top line across upper frame)
///   2. `"盗窃乱贼而不作，"` (middle line across wooden door and brick wall)
///   3. `"故外户而不闭。"` (bottom line across stone steps and lower frame)
///   All 3 lines must be detected as clean `FreeText` regions.
#[test]
fn test_regression_page_datong_verse_schemes_and_doors() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_datong_verse_schemes_and_doors/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_datong_verse_schemes_and_doors, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));

    println!("Detected {} regions on page_datong_verse_schemes_and_doors:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, box={:?}, text='{}'",
            i, r.kind, r.box_, r.text.replace('\n', " ")
        );
    }

    assert_eq!(res.regions.len(), 3, "Expected exactly 3 calligraphy regions on page_datong_verse_schemes_and_doors");

    for r in &res.regions {
        assert_eq!(r.kind, RegionKind::FreeText, "All 3 regions must be FreeText");
    }

    assert!(res.regions.iter().any(|r| r.text.contains("谋闭而不兴") || r.text.contains("是故")), "Missing line 1 '是故谋闭而不兴，'");
    assert!(res.regions.iter().any(|r| r.text.contains("盗窃乱贼") || r.text.contains("而不作")), "Missing line 2 '盗窃乱贼而不作，'");
    assert!(res.regions.iter().any(|r| r.text.contains("故外户而不闭") || r.text.contains("外户")), "Missing line 3 '故外户而不闭。'");
}
