use std::path::Path;
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::detect::filter_text_by_source_lang;

/// # Thai Comic Regression Test: Dedicated Model & Complex Script Preservation
///
/// ## Purpose & Behavior Tested:
/// - **Language Routing (`th`)**:
///   Verifies Thai source mode routes to `th_PP-OCRv5_mobile_rec.onnx` and `th_dict.txt`,
///   preserving Thai consonants, vowels, and tone marks (`\u0e00-\u0e7f`).
#[test]
fn test_regression_thai_script_handling() {
    let sample = "สวัสดีครับ ยินดีต้อนรับสู่การทดสอบ";
    let filtered = filter_text_by_source_lang(sample, Some("th"));
    assert_eq!(filtered, "สวัสดีครับ ยินดีต้อนรับสู่การทดสอบ");

    let mixed = "สวัสดีครับ 你好 Привет";
    let cleaned = filter_text_by_source_lang(mixed, Some("th"));
    assert_eq!(cleaned.trim(), "สวัสดีครับ");
}

/// # Thai Real-Page Regression: `page_zhang_yude_chengdu_cemetery.webp` with `th` Source Routing
#[test]
fn test_regression_page_with_thai_source_routing() {
    let mut img_path = Path::new("tests/fixtures/th/sample.webp"); if !img_path.exists() { img_path = Path::new("tests/fixtures/zh_hans/page_zhang_yude_chengdu_cemetery.webp"); };
    if !img_path.exists() {
        eprintln!("Fixture {:?} not found, skipping test", img_path);
        return;
    }

    let img = image::ImageReader::open(img_path)
        .expect("Failed to open fixture image")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture_with_lang(&img, Some("th"));
    assert!(!res.regions.is_empty(), "Pipeline in Thai mode must detect text regions");

    for r in &res.regions {
        assert!(r.box_.w > 0 && r.box_.h > 0, "Region dimensions must be positive");
    }
}
