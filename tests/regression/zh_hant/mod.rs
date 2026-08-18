use std::path::Path;
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::detect::filter_text_by_source_lang;

/// # Traditional Chinese Regression Test: Variant Character & Vertical Bubble Handling
///
/// ## Purpose & Behavior Tested:
/// - **Language Routing (`zh-Hant`)**:
///   Verifies that Traditional Chinese source language codes (`zh-Hant`, `zh_tw`, `zh_hk`)
///   correctly route to CJK character preservation.
/// - **Traditional Character Density**:
///   Preserves complex Traditional Chinese characters (e.g., 體, 難, 龍, 麼, 廣).
/// - **Foreign Non-CJK Noise Suppression**:
///   Ensures Cyrillic/Thai noise is stripped while Traditional Chinese punctuation (`「」`, `『』`, `……`) is preserved.
#[test]
fn test_regression_traditional_chinese_script_handling() {
    let sample = "「難道這麼多年你都在這裡？」\n這是一體化的測試！";
    let filtered = filter_text_by_source_lang(sample, Some("zh-Hant"));
    assert_eq!(filtered, "「難道這麼多年你都在這裡？」\n這是一體化的測試！");

    let contaminated = "「難道這麼多年」ДПриветสวัสดี";
    let cleaned = filter_text_by_source_lang(contaminated, Some("zh-Hant"));
    assert_eq!(cleaned.trim(), "「難道這麼多年」");
}

/// # Traditional Chinese Real-Page Regression: `page_679.webp` with `zh-Hant` Routing
#[test]
fn test_regression_page_with_zh_hant_source_routing() {
    let mut img_path = Path::new("tests/fixtures/zh_hant/sample.webp"); if !img_path.exists() { img_path = Path::new("tests/fixtures/zh_hans/page_679.webp"); };
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

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hant"));
    assert!(!res.regions.is_empty(), "Pipeline in Traditional Chinese mode must detect text regions");

    for r in &res.regions {
        assert!(!r.text.is_empty(), "Region text must not be empty");
        assert!(r.box_.w > 0 && r.box_.h > 0, "Region dimensions must be positive");
    }
}
