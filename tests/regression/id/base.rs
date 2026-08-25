// -- CRATE / EXTERNAL IMPORTS -- //
use xianscan_rust::ml::detect::filter_text_by_source_lang;

// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # INDONESIAN COMIC REGRESSION TEST: LATIN SCRIPT & REDUPLICATION HYPHENS
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **LANGUAGE ROUTING (`id`)**:
///   VERIFIES INDONESIAN SOURCE MODE HANDLES STANDARD LATIN CHARACTERS, EXCLAMATION MARKS,
///   AND WORD REDUPLICATION HYPHENS (E.G. `tiba-tiba`, `anak-anak`).
#[test]
fn test_regression_indonesian_script_handling() {
    let sample = "Tiba-tiba musuh menyerang! Kita harus bertahan.";
    let filtered = filter_text_by_source_lang(sample, Some("id"));
    assert_eq!(filtered, "Tiba-tiba musuh menyerang! Kita harus bertahan.");

    let mixed = "Tiba-tiba musuh datang! 你好 Привет";
    let cleaned = filter_text_by_source_lang(mixed, Some("id"));
    assert_eq!(cleaned.trim(), "Tiba-tiba musuh datang!");
}

/// # INDONESIAN REAL-PAGE REGRESSION: FIXTURE LOAD WITH `id` SOURCE ROUTING
#[test]
fn test_regression_page_with_indonesian_source_routing() {
    let img = match crate::common::load_fixture_or_skip("id", "page_who_is_she_bottom_box.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_with_indonesian_source_routing: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("id"));
    for r in &res.regions {
        assert!(
            !xianscan_rust::ml::detect::has_cjk_characters(&r.text),
            "Region in 'id' mode should not contain CJK: {}",
            r.text
        );
    }
}
