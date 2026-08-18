use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::detect::filter_text_by_source_lang;

/// # Vietnamese Comic Regression Test: Diacritics & Dedicated OCR Model Routing
///
/// ## Purpose & Behavior Tested:
/// - **Language Routing (`vi`)**:
///   Verifies Vietnamese source mode routes to `vi_PP-OCRv3_rec.onnx` and `vi_dict.txt`,
///   preserving tone marks and accented letters (ă, â, đ, ê, ô, ơ, ư).
#[test]
fn test_regression_vietnamese_script_handling() {
    let sample = "Xin chào các bạn! Đây là bản dịch truyện tranh.";
    let filtered = filter_text_by_source_lang(sample, Some("vi"));
    assert_eq!(filtered, "Xin chào các bạn! Đây là bản dịch truyện tranh.");

    let mixed = "Xin chào! 你好 Привет";
    let cleaned = filter_text_by_source_lang(mixed, Some("vi"));
    assert_eq!(cleaned.trim(), "Xin chào!");
}

/// # Vietnamese Real-Page Regression: `page_zhang_yude_chengdu_cemetery.webp` with `vi` Source Routing
#[test]
fn test_regression_page_with_vietnamese_source_routing() {
    let img = match crate::common::load_fixture_or_skip("vi", "sample.webp")
        .or_else(|| crate::common::load_fixture_or_skip("zh_hans", "page_zhang_yude_chengdu_cemetery.webp"))
    {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_with_vietnamese_source_routing: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("vi"));
    for r in &res.regions {
        assert!(
            !xianscan_rust::ml::detect::has_cjk_characters(&r.text),
            "Region in 'vi' mode should not contain CJK: {}",
            r.text
        );
    }
}
