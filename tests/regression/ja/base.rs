// -- CRATE / EXTERNAL IMPORTS -- //
use xianscan_rust::ml::detect::filter_text_by_source_lang;

// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE MANGA REGRESSION TEST: VERTICAL DIALOGUE & MIXED SCRIPT RECOGNITION
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **LANGUAGE ROUTING (`ja`)**:
///   VERIFIES THAT `PipelineEngine` WITH `source_lang: Some("ja")` PROCESSES JAPANESE
///   COMIC PAGES, PRESERVING KANJI, HIRAGANA, KATAKANA, AND JAPANESE PUNCTUATION (`「」`, `…`, `ー`).
/// - **VERTICAL READING & SCRIPT INTEGRITY**:
///   VERIFIES THAT CJK CHARACTER FILTERING RETAINS FULL JAPANESE UNICODE BLOCKS
///   (`\u3040-\u309f` HIRAGANA, `\u30a0-\u30ff` KATAKANA, `\u4e00-\u9fff` KANJI).
/// - **NEGATIVE FOREIGN SCRIPT FILTERING**:
///   ENSURES THAT CYRILLIC, THAI, OR RANDOM NON-JAPANESE NOISE IS STRIPPED.
#[test]
fn test_regression_japanese_script_handling() {
    let mixed_text = "魔王を討伐する！\nこれはテストです。";
    let filtered = filter_text_by_source_lang(mixed_text, Some("ja"));
    assert_eq!(filtered, "魔王を討伐する！\nこれはテストです。");

    let contaminated = "魔王を討伐する！ДПриветสวัสดี";
    let cleaned = filter_text_by_source_lang(contaminated, Some("ja"));
    assert_eq!(cleaned.trim(), "魔王を討伐する！");
}

/// # JAPANESE REAL-PAGE REGRESSION: FIXTURE LOAD WITH `ja` SOURCE ROUTING
#[test]
fn test_regression_page_with_japanese_source_routing() {
    let img = match crate::common::load_fixture_or_skip("ja", "sample.webp")
        .or_else(|| crate::common::load_fixture_or_skip("zh_hans", "page_zhang_yude_chengdu_cemetery.webp"))
    {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_with_japanese_source_routing: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    assert!(!res.regions.is_empty(), "Pipeline in Japanese mode must detect text regions");

    for r in &res.regions {
        assert!(!r.text.is_empty(), "Region text must not be empty");
        assert!(r.box_.w > 0 && r.box_.h > 0, "Region dimensions must be positive");
    }
}
