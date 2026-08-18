use std::path::Path;
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::detect::filter_text_by_source_lang;

/// # English Comic Regression Test: Contractions, Quotes & Noise Suppression
///
/// ## Purpose & Behavior Tested:
/// - **Language Routing (`en`)**:
///   Verifies that English source mode preserves Latin alphanumeric characters, quotes, contractions, and punctuation.
/// - **Foreign Non-Latin Script Stripping**:
///   Strips CJK, Cyrillic, Thai characters from English text lines.
#[test]
fn test_regression_english_script_handling() {
    let sample = "I don't think we should go there... It's too dangerous!";
    let filtered = filter_text_by_source_lang(sample, Some("en"));
    assert_eq!(filtered, "I don't think we should go there... It's too dangerous!");

    let mixed = "Hello World! 你好 Привет สวัสดี";
    let cleaned = filter_text_by_source_lang(mixed, Some("en"));
    assert_eq!(cleaned.trim(), "Hello World!");
}

/// # English Real-Page Regression: `page_zhang_yude_chengdu_cemetery.webp` with `en` Source Routing
#[test]
fn test_regression_page_with_english_source_routing() {
    let mut img_path = Path::new("tests/fixtures/en/sample.webp"); if !img_path.exists() { img_path = Path::new("tests/fixtures/zh_hans/page_zhang_yude_chengdu_cemetery.webp"); };
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

    let res = get_or_analyze_fixture_with_lang(&img, Some("en"));
    // Verify that all returned text regions in English mode have CJK stripped
    for r in &res.regions {
        assert!(
            !xianscan_rust::ml::detect::has_cjk_characters(&r.text),
            "Region in 'en' mode should not contain CJK: {}",
            r.text
        );
    }
}
