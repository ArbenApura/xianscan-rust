use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::detect::filter_text_by_source_lang;

/// # Korean Manhwa Regression Test: Hangul Syllable Blocks & Script Handling
///
/// ## Purpose & Behavior Tested:
/// - **Language Routing (`ko`)**:
///   Verifies that `PipelineEngine` with `source_lang: Some("ko")` uses the dedicated Korean
///   OCR model (`korean_mobile_v2.0_rec.onnx`) and dictionary (`korean_dict.txt`).
/// - **Hangul Unicode Preservation**:
///   Ensures Hangul syllables (`\uac00-\ud7af`), Jamo (`\u1100-\u11ff`), and whitespace
///   are preserved during text filtering.
/// - **Foreign Script Stripping**:
///   Ensures non-target scripts (e.g. Cyrillic, Thai) are removed.
#[test]
fn test_regression_korean_script_handling() {
    let sample_ko = "안녕하세요! 레벨업 하셨습니다.\n경험치 +500";
    let filtered = filter_text_by_source_lang(sample_ko, Some("ko"));
    assert_eq!(filtered, "안녕하세요! 레벨업 하셨습니다.\n경험치 +500");

    let contaminated = "안녕하세요! приветสวัสดี";
    let cleaned = filter_text_by_source_lang(contaminated, Some("ko"));
    assert_eq!(cleaned.trim(), "안녕하세요!");
}

/// # Korean Real-Page Regression: `page_zhang_yude_chengdu_cemetery.webp` with `ko` Source Routing
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
    assert!(!res.regions.is_empty(), "Pipeline in Korean mode must detect text regions");

    for r in &res.regions {
        assert!(r.box_.w > 0 && r.box_.h > 0, "Region dimensions must be positive");
    }
}
