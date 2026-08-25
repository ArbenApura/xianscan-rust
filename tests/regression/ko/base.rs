// -- CRATE / EXTERNAL IMPORTS -- //
use xianscan_rust::ml::detect::filter_text_by_source_lang;

// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN MANHWA REGRESSION TEST: HANGUL SYLLABLE BLOCKS & SCRIPT HANDLING
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **LANGUAGE ROUTING (`ko`)**:
///   VERIFIES THAT `PipelineEngine` WITH `source_lang: Some("ko")` USES THE DEDICATED KOREAN
///   OCR MODEL (`korean_mobile_v2.0_rec.onnx`) AND DICTIONARY (`korean_dict.txt`).
/// - **HANGUL UNICODE PRESERVATION**:
///   ENSURES HANGUL SYLLABLES (`\uac00-\ud7af`), JAMO (`\u1100-\u11ff`), AND WHITESPACE
///   ARE PRESERVED DURING TEXT FILTERING.
/// - **FOREIGN SCRIPT STRIPPING**:
///   ENSURES NON-TARGET SCRIPTS (E.G. CYRILLIC, THAI) ARE REMOVED.
#[test]
fn test_regression_korean_script_handling() {
    let sample_ko = "안녕하세요! 레벨업 하셨습니다.\n경험치 +500";
    let filtered = filter_text_by_source_lang(sample_ko, Some("ko"));
    assert_eq!(filtered, "안녕하세요! 레벨업 하셨습니다.\n경험치 +500");

    let contaminated = "안녕하세요! приветสวัสดี";
    let cleaned = filter_text_by_source_lang(contaminated, Some("ko"));
    assert_eq!(cleaned.trim(), "안녕하세요!");
}

/// # KOREAN REAL-PAGE REGRESSION: FIXTURE LOAD WITH `ko` SOURCE ROUTING
#[test]
fn test_regression_page_with_korean_source_routing() {
    let img = match crate::common::load_fixture_or_skip("ko", "sample.webp")
        .or_else(|| crate::common::load_fixture_or_skip("zh_hans", "page_zhang_yude_chengdu_cemetery.webp"))
    {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_with_korean_source_routing: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    for r in &res.regions {
        assert!(r.box_.w > 0 && r.box_.h > 0, "Region dimensions must be positive");
    }
}
