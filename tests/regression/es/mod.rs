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
    let img = match crate::common::load_fixture_or_skip("es", "sample.webp")
        .or_else(|| crate::common::load_fixture_or_skip("zh_hans", "page_zhang_yude_chengdu_cemetery.webp"))
    {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_with_spanish_source_routing: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("es"));
    for r in &res.regions {
        assert!(
            !xianscan_rust::ml::detect::has_cjk_characters(&r.text),
            "Region in 'es' mode should not contain CJK: {}",
            r.text
        );
    }
}
