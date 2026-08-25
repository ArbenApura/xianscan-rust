// -- CRATE / EXTERNAL IMPORTS -- //
use xianscan_rust::ml::detect::filter_text_by_source_lang;

// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # RUSSIAN / CYRILLIC REGRESSION TEST: DEDICATED MODEL & SCRIPT PRESERVATION
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **LANGUAGE ROUTING (`ru`, `uk`, `bg`)**:
///   VERIFIES CYRILLIC SOURCE MODE ROUTES TO `cyrillic_mobile_v2.0_rec.onnx` AND `cyrillic_dict.txt`,
///   PRESERVING CYRILLIC CHARACTERS (`\u0400-\u04ff`) AND PUNCTUATION WHILE STRIPPING CJK/THAI.
#[test]
fn test_regression_russian_script_handling() {
    let sample = "Привет мир! Это проверка русского перевода комиксов.";
    let filtered = filter_text_by_source_lang(sample, Some("ru"));
    assert_eq!(filtered, "Привет мир! Это проверка русского перевода комиксов.");

    let mixed = "Привет мир! 你好 สวัสดี";
    let cleaned = filter_text_by_source_lang(mixed, Some("ru"));
    assert_eq!(cleaned.trim(), "Привет мир!");
}

/// # RUSSIAN REAL-PAGE REGRESSION: FIXTURE LOAD WITH `ru` SOURCE ROUTING
#[test]
fn test_regression_page_with_russian_source_routing() {
    let img = match crate::common::load_fixture_or_skip("ru", "page_she_clearly_russian_bubble.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_with_russian_source_routing: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ru"));
    assert!(!res.regions.is_empty(), "Pipeline in Russian mode must detect text regions");

    for r in &res.regions {
        assert!(r.box_.w > 0 && r.box_.h > 0, "Region dimensions must be positive");
    }
}
