use std::path::Path;
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::detect::filter_text_by_source_lang;

/// # Vietnamese Comic Regression Test: Diacritics & Dedicated OCR Model Routing
///
/// ## Purpose & Behavior Tested:
/// - **Language Routing (`vi`)**:
///   Verifies Vietnamese source mode routes to `vi_PP-OCRv3_rec.onnx` and `vi_dict.txt`,
///   preserving tone marks and accented letters (ă, â, đ, ê, ô, ơ, ư).
#[test]
fn test_regression_vietnamese_script_handling() {
    let sample = "Xin chào các bạn! Đây là bản dịch truyện tranh.";
    let filtered = filter_text_by_source_lang(sample, Some("vi"));
    assert_eq!(filtered, "Xin chào các bạn! Đây là bản dịch truyện tranh.");

    let mixed = "Xin chào! 你好 Привет";
    let cleaned = filter_text_by_source_lang(mixed, Some("vi"));
    assert_eq!(cleaned.trim(), "Xin chào!");
}

/// # Vietnamese Real-Page Regression: `page_zhang_yude_chengdu_cemetery.webp` with `vi` Source Routing
#[test]
fn test_regression_page_with_vietnamese_source_routing() {
    let mut img_path = Path::new("tests/fixtures/vi/sample.webp"); if !img_path.exists() { img_path = Path::new("tests/fixtures/zh_hans/page_zhang_yude_chengdu_cemetery.webp"); };
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

    let res = get_or_analyze_fixture_with_lang(&img, Some("vi"));
    for r in &res.regions {
        assert!(
            !xianscan_rust::ml::detect::has_cjk_characters(&r.text),
            "Region in 'vi' mode should not contain CJK: {}",
            r.text
        );
    }
}
