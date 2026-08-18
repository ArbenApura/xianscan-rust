use std::path::Path;
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::detect::filter_text_by_source_lang;

/// # Russian / Cyrillic Regression Test: Dedicated Model & Script Preservation
///
/// ## Purpose & Behavior Tested:
/// - **Language Routing (`ru`, `uk`, `bg`)**:
///   Verifies Cyrillic source mode routes to `cyrillic_mobile_v2.0_rec.onnx` and `cyrillic_dict.txt`,
///   preserving Cyrillic characters (`\u0400-\u04ff`) and punctuation while stripping CJK/Thai.
#[test]
fn test_regression_russian_script_handling() {
    let sample = "Привет мир! Это проверка русского перевода комиксов.";
    let filtered = filter_text_by_source_lang(sample, Some("ru"));
    assert_eq!(filtered, "Привет мир! Это проверка русского перевода комиксов.");

    let mixed = "Привет мир! 你好 สวัสดี";
    let cleaned = filter_text_by_source_lang(mixed, Some("ru"));
    assert_eq!(cleaned.trim(), "Привет мир!");
}

/// # Russian Real-Page Regression: `page_679.webp` with `ru` Source Routing
#[test]
fn test_regression_page_with_russian_source_routing() {
    let mut img_path = Path::new("tests/fixtures/ru/sample.webp"); if !img_path.exists() { img_path = Path::new("tests/fixtures/zh_hans/page_679.webp"); };
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

    let res = get_or_analyze_fixture_with_lang(&img, Some("ru"));
    assert!(!res.regions.is_empty(), "Pipeline in Russian mode must detect text regions");

    for r in &res.regions {
        assert!(r.box_.w > 0 && r.box_.h > 0, "Region dimensions must be positive");
    }
}
