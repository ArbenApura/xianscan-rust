// -- CRATE / EXTERNAL IMPORTS -- //
use xianscan_rust::ml::detect::filter_text_by_source_lang;

// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REGRESSION TEST: SCRIPT HANDLING & FOREIGN SCRIPT STRIPPING
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **LANGUAGE ROUTING (`zh_hans`)**:
///   VERIFIES THAT SIMPLIFIED CHINESE SOURCE LANGUAGE PRESERVES CJK CHARACTERS, PUNCTUATION, AND NUMERALS.
/// - **FOREIGN NON-CJK NOISE SUPPRESSION**:
///   ENSURES CYRILLIC, THAI, OR FOREIGN NON-TARGET SCRIPTS ARE STRIPPED WHILE PRESERVING CHINESE PUNCTUATION.
#[test]
fn test_regression_simplified_chinese_script_handling() {
    let sample = "「难道这么多年你都在这里？」\n这是一体化的测试！";
    let filtered = filter_text_by_source_lang(sample, Some("zh_hans"));
    assert_eq!(filtered, "「难道这么多年你都在这里？」\n这是一体化的测试！");

    let contaminated = "「难道这么多年」ДПриветสวัสดี";
    let cleaned = filter_text_by_source_lang(contaminated, Some("zh_hans"));
    assert_eq!(cleaned.trim(), "「难道这么多年」");
}

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: FIXTURE LOAD WITH `zh_hans` ROUTING
#[test]
fn test_regression_page_with_zh_hans_source_routing() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "sample.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_with_zh_hans_source_routing: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    assert!(!res.regions.is_empty(), "Pipeline in Simplified Chinese mode must detect text regions");

    for r in &res.regions {
        assert!(!r.text.is_empty(), "Region text must not be empty");
        assert!(r.box_.w > 0 && r.box_.h > 0, "Region dimensions must be positive");
    }
}
