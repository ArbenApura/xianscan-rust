use std::path::Path;
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::detect::filter_text_by_source_lang;

/// # Indonesian Comic Regression Test: Latin Script & Reduplication Hyphens
///
/// ## Purpose & Behavior Tested:
/// - **Language Routing (`id`)**:
///   Verifies Indonesian source mode handles standard Latin characters, exclamation marks,
///   and word reduplication hyphens (e.g. `tiba-tiba`, `anak-anak`).
#[test]
fn test_regression_indonesian_script_handling() {
    let sample = "Tiba-tiba musuh menyerang! Kita harus bertahan.";
    let filtered = filter_text_by_source_lang(sample, Some("id"));
    assert_eq!(filtered, "Tiba-tiba musuh menyerang! Kita harus bertahan.");

    let mixed = "Tiba-tiba musuh datang! 你好 Привет";
    let cleaned = filter_text_by_source_lang(mixed, Some("id"));
    assert_eq!(cleaned.trim(), "Tiba-tiba musuh datang!");
}

/// # Indonesian Real-Page Regression: `page_679.webp` with `id` Source Routing
#[test]
fn test_regression_page_with_indonesian_source_routing() {
    let mut img_path = Path::new("tests/fixtures/id/sample.webp"); if !img_path.exists() { img_path = Path::new("tests/fixtures/zh_hans/page_679.webp"); };
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

    let res = get_or_analyze_fixture_with_lang(&img, Some("id"));
    for r in &res.regions {
        assert!(
            !xianscan_rust::ml::detect::has_cjk_characters(&r.text),
            "Region in 'id' mode should not contain CJK: {}",
            r.text
        );
    }
}
