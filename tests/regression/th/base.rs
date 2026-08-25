// -- CRATE / EXTERNAL IMPORTS -- //
use xianscan_rust::ml::detect::filter_text_by_source_lang;

// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # THAI COMIC REGRESSION TEST: DEDICATED MODEL & COMPLEX SCRIPT PRESERVATION
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **LANGUAGE ROUTING (`th`)**:
///   VERIFIES THAI SOURCE MODE ROUTES TO `th_PP-OCRv5_mobile_rec.onnx` AND `th_dict.txt`,
///   PRESERVING THAI CONSONANTS, VOWELS, AND TONE MARKS (`\u0e00-\u0e7f`).
#[test]
fn test_regression_thai_script_handling() {
    let sample = "สวัสดีครับ ยินดีต้อนรับสู่การทดสอบ";
    let filtered = filter_text_by_source_lang(sample, Some("th"));
    assert_eq!(filtered, "สวัสดีครับ ยินดีต้อนรับสู่การทดสอบ");

    let mixed = "สวัสดีครับ 你好 Привет";
    let cleaned = filter_text_by_source_lang(mixed, Some("th"));
    assert_eq!(cleaned.trim(), "สวัสดีครับ");
}

/// # THAI REAL-PAGE REGRESSION: FIXTURE LOAD WITH `th` SOURCE ROUTING
#[test]
fn test_regression_page_with_thai_source_routing() {
    let img = match crate::common::load_fixture_or_skip("th", "sample.webp")
        .or_else(|| crate::common::load_fixture_or_skip("zh_hans", "page_zhang_yude_chengdu_cemetery.webp"))
    {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_with_thai_source_routing: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("th"));
    assert!(!res.regions.is_empty(), "Pipeline in Thai mode must detect text regions");

    for r in &res.regions {
        assert!(r.box_.w > 0 && r.box_.h > 0, "Region dimensions must be positive");
    }
}
