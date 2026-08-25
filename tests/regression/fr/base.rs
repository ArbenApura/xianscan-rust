// -- CRATE / EXTERNAL IMPORTS -- //
use xianscan_rust::ml::detect::filter_text_by_source_lang;

// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # FRENCH BD REGRESSION TEST: ACCENTS, GUILLES & LATIN ROUTING
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **LANGUAGE ROUTING (`fr`)**:
///   VERIFIES THAT FRENCH SOURCE MODE PRESERVES FRENCH ACCENTED CHARACTERS (é, è, ê, à, ç, œ, ù)
///   AND FRENCH QUOTES (« »), WHILE FILTERING OUT NON-LATIN SCRIPTS.
#[test]
fn test_regression_french_script_handling() {
    let sample = "« C'est impossible ! Nous devons immédiatement agir. »";
    let filtered = filter_text_by_source_lang(sample, Some("fr"));
    assert_eq!(filtered, "« C'est impossible ! Nous devons immédiatement agir. »");

    let mixed = "« Bonjour ! » 你好 Привет";
    let cleaned = filter_text_by_source_lang(mixed, Some("fr"));
    assert_eq!(cleaned.trim(), "« Bonjour ! »");
}

/// # FRENCH REAL-PAGE REGRESSION: FIXTURE LOAD WITH `fr` SOURCE ROUTING
#[test]
fn test_regression_page_with_french_source_routing() {
    let img = match crate::common::load_fixture_or_skip("fr", "sample.webp")
        .or_else(|| crate::common::load_fixture_or_skip("zh_hans", "page_zhang_yude_chengdu_cemetery.webp"))
    {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_with_french_source_routing: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("fr"));
    for r in &res.regions {
        assert!(
            !xianscan_rust::ml::detect::has_cjk_characters(&r.text),
            "Region in 'fr' mode should not contain CJK: {}",
            r.text
        );
    }
}
