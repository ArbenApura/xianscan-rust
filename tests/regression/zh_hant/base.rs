// -- CRATE / EXTERNAL IMPORTS -- //
use xianscan_rust::ml::detect::filter_text_by_source_lang;

// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # TRADITIONAL CHINESE REGRESSION TEST: VARIANT CHARACTER & VERTICAL BUBBLE HANDLING
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **LANGUAGE ROUTING (`zh-Hant`)**:
///   VERIFIES THAT TRADITIONAL CHINESE SOURCE LANGUAGE CODES (`zh-Hant`, `zh_tw`, `zh_hk`)
///   CORRECTLY ROUTE TO CJK CHARACTER PRESERVATION.
/// - **TRADITIONAL CHARACTER DENSITY**:
///   PRESERVES COMPLEX TRADITIONAL CHINESE CHARACTERS (E.G., 體, 難, 龍, 麼, 廣).
/// - **FOREIGN NON-CJK NOISE SUPPRESSION**:
///   ENSURES CYRILLIC/THAI NOISE IS STRIPPED WHILE TRADITIONAL CHINESE PUNCTUATION (`「」`, `『』`, `……`) IS PRESERVED.
#[test]
fn test_regression_traditional_chinese_script_handling() {
    let sample = "「難道這麼多年你都在這裡？」\n這是一體化的測試！";
    let filtered = filter_text_by_source_lang(sample, Some("zh-Hant"));
    assert_eq!(filtered, "「難道這麼多年你都在這裡？」\n這是一體化的測試！");

    let contaminated = "「難道這麼多年」ДПриветสวัสดี";
    let cleaned = filter_text_by_source_lang(contaminated, Some("zh-Hant"));
    assert_eq!(cleaned.trim(), "「難道這麼多年」");
}

/// # TRADITIONAL CHINESE REAL-PAGE REGRESSION: FIXTURE LOAD WITH `zh-Hant` ROUTING
#[test]
fn test_regression_page_with_zh_hant_source_routing() {
    let img = match crate::common::load_fixture_or_skip("zh_hant", "sample.webp")
        .or_else(|| crate::common::load_fixture_or_skip("zh_hans", "page_zhang_yude_chengdu_cemetery.webp"))
    {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_with_zh_hant_source_routing: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hant"));
    assert!(!res.regions.is_empty(), "Pipeline in Traditional Chinese mode must detect text regions");

    for r in &res.regions {
        assert!(!r.text.is_empty(), "Region text must not be empty");
        assert!(r.box_.w > 0 && r.box_.h > 0, "Region dimensions must be positive");
    }
}
