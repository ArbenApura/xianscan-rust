use std::path::Path;
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::detect::filter_text_by_source_lang;

/// # Spanish Comic Regression Test: Inverted Punctuation & Accents
///
/// ## Purpose & Behavior Tested:
/// - **Language Routing (`es`)**:
///   Verifies that Spanish source mode preserves inverted question/exclamation marks (`¡`, `¿`),
///   tildes (`ñ`), accents (`á, é, í, ó, ú`), and strips non-Latin scripts.
#[test]
fn test_regression_spanish_script_handling() {
    let sample = "¡Hola! ¿Cómo estás? ¡Esto es una gran aventura!";
    let filtered = filter_text_by_source_lang(sample, Some("es"));
    assert_eq!(filtered, "¡Hola! ¿Cómo estás? ¡Esto es una gran aventura!");

    let mixed = "¡Hola amigos! 你好 Привет";
    let cleaned = filter_text_by_source_lang(mixed, Some("es"));
    assert_eq!(cleaned.trim(), "¡Hola amigos!");
}

/// # Spanish Real-Page Regression: `page_zhang_yude_chengdu_cemetery.webp` with `es` Source Routing
#[test]
fn test_regression_page_with_spanish_source_routing() {
    let mut img_path = Path::new("tests/fixtures/es/sample.webp"); if !img_path.exists() { img_path = Path::new("tests/fixtures/zh_hans/page_zhang_yude_chengdu_cemetery.webp"); };
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

    let res = get_or_analyze_fixture_with_lang(&img, Some("es"));
    for r in &res.regions {
        assert!(
            !xianscan_rust::ml::detect::has_cjk_characters(&r.text),
            "Region in 'es' mode should not contain CJK: {}",
            r.text
        );
    }
}
