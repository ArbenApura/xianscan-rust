// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_datong_verse_goods_and_labor` (RESOLUTION: 900 × 1843)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **FOUR CALLIGRAPHY NARRATION VERSES ACROSS TWO PANELS**:
///   1. `"货恶其弃于地也，"` (upper panel top border)
///   2. `"不必藏于己。"` (upper panel bottom right)
///   3. `"力恶其不出于身也，"` (lower panel top border)
///   4. `"不必为己。"` (lower panel bottom)
///   All 4 lines must be detected as clean `FreeText` regions.
#[test]
fn test_regression_page_datong_verse_goods_and_labor() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_datong_verse_goods_and_labor/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_datong_verse_goods_and_labor, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));

    println!("Detected {} regions on page_datong_verse_goods_and_labor:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, box={:?}, text='{}'",
            i, r.kind, r.box_, r.text.replace('\n', " ")
        );
    }

    assert_eq!(res.regions.len(), 4, "Expected exactly 4 calligraphy regions on page_datong_verse_goods_and_labor");

    for r in &res.regions {
        assert_eq!(r.kind, RegionKind::FreeText, "All 4 regions must be FreeText");
    }

    assert!(res.regions.iter().any(|r| r.text.contains("货恶其弃于地") || r.text.contains("于地也")), "Missing line 1 '货恶其弃于地也，'");
    assert!(res.regions.iter().any(|r| r.text.contains("不必藏于己") || r.text.contains("藏于己")), "Missing line 2 '不必藏于己。'");
    assert!(res.regions.iter().any(|r| r.text.contains("力恶其不出于身") || r.text.contains("于身也")), "Missing line 3 '力恶其不出于身也，'");
    assert!(res.regions.iter().any(|r| r.text.contains("不必为") || r.text.contains("为己") || r.text.contains("为已")), "Missing line 4 '不必为己。'");
}
