// -- CRATE / EXTERNAL IMPORTS -- //
use xianscan_rust::ml::detect::filter_text_by_source_lang;

// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SPANISH COMIC REGRESSION TEST: INVERTED PUNCTUATION & ACCENTS
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **LANGUAGE ROUTING (`es`)**:
///   VERIFIES THAT SPANISH SOURCE MODE PRESERVES INVERTED QUESTION/EXCLAMATION MARKS (`¡`, `¿`),
///   TILDES (`ñ`), ACCENTS (`á, é, í, ó, ú`), AND STRIPS NON-LATIN SCRIPTS.
#[test]
fn test_regression_spanish_script_handling() {
    let sample = "¡Hola! ¿Cómo estás? ¡Esto es una gran aventura!";
    let filtered = filter_text_by_source_lang(sample, Some("es"));
    assert_eq!(filtered, "¡Hola! ¿Cómo estás? ¡Esto es una gran aventura!");

    let mixed = "¡Hola amigos! 你好 Привет";
    let cleaned = filter_text_by_source_lang(mixed, Some("es"));
    assert_eq!(cleaned.trim(), "¡Hola amigos!");
}

/// # SPANISH REAL-PAGE REGRESSION: FIXTURE LOAD WITH `es` SOURCE ROUTING
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
