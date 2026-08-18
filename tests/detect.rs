mod common;

use std::path::Path;
use common::{hash_image, read_cache, write_cache};
use xianscan_rust::ml::detect::{ComicTextDetector, DetectResult};
use xianscan_rust::ml::ocr::{OcrLine, RapidOcr};

/// # Detector Test: `ComicTextDetector` on `page_zhang_yude_chengdu_cemetery.webp`
///
/// ## Purpose:
/// Verifies that the specialized manga text detector ONNX model (`comictextdetector.pt.onnx`)
/// loads and detects bounding boxes on a high-resolution raw manga page.
#[test]
fn test_comic_text_detector_on_fixture_page_679() {
    let img_path = Path::new("tests/fixtures/zh_hans/page_zhang_yude_chengdu_cemetery.webp");
    assert!(img_path.exists(), "Fixture page_zhang_yude_chengdu_cemetery.webp must exist");

    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_zhang_yude_chengdu_cemetery.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let key = hash_image(&img);
    let (boxes_len, backend) = if let Some(cached) = read_cache::<DetectResult>("comic_det", &key) {
        (cached.boxes.len(), cached.backend)
    } else {
        let model_path = Path::new("models/comictextdetector.pt.onnx");
        if !model_path.exists() {
            eprintln!("Model not found at {:?}, skipping test", model_path);
            return;
        }
        let mut detector = ComicTextDetector::new(model_path).expect("Failed to load ComicTextDetector ONNX model");
        let res = detector.detect(&img).expect("Inference failed");
        write_cache("comic_det", &key, &res);
        (res.boxes.len(), res.backend)
    };

    println!("Detected {} text lines on page_zhang_yude_chengdu_cemetery.webp ({})", boxes_len, backend);
    assert!(boxes_len > 0, "Must detect text boxes on page_zhang_yude_chengdu_cemetery.webp");
}

/// # OCR Test: `RapidOcr` Tiled Detection & Recognition on `page_zhang_yude_chengdu_cemetery.webp`
///
/// ## Purpose:
/// Verifies that RapidOCR (`PP-OCRv6`) performs tiled text line detection, CTC argmax decoding,
/// and confidence scoring on vertical and horizontal Chinese text lines.
#[test]
fn test_rapid_ocr_detect_and_recognize_on_page_679() {
    let img_path = Path::new("tests/fixtures/zh_hans/page_zhang_yude_chengdu_cemetery.webp");
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_zhang_yude_chengdu_cemetery.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let key = hash_image(&img);
    let lines = if let Some(cached) = read_cache::<Vec<OcrLine>>("rapid_ocr", &key) {
        cached
    } else {
        let mut ocr = RapidOcr::new(
            Some("models/PP-OCRv6_det_small.onnx"),
            "models/PP-OCRv6_rec_small.onnx",
            "models/rapidocr_keys.json",
        ).expect("Failed to load RapidOcr");

        let res = ocr.detect_and_recognize_tiled(&img, false).expect("detect_and_recognize_tiled failed");
        write_cache("rapid_ocr", &key, &res);
        res
    };

    println!("Detected {} lines:", lines.len());
    for (i, l) in lines.iter().enumerate() {
        println!("Line {}: poly={:?}, text={}, score={}", i, l.polygon, l.text, l.score);
    }
    assert!(!lines.is_empty());
}

/// # Language Classification Helpers Test
///
/// ## Purpose:
/// Unit tests for CJK/Latin script classification, standalone alphanumeric margin
/// noise detection, and source language code routing.
#[test]
fn test_language_aware_filtering_helpers() {
    use xianscan_rust::ml::detect::{
        filter_text_by_source_lang, has_alphanumeric_characters, has_cjk_characters,
        is_cjk_source, is_cyrillic_source, is_latin_source,
        is_standalone_alphanumeric_without_cjk, is_thai_source, strip_cjk_characters,
    };

    // Script stripping & source language filtering
    assert_eq!(strip_cjk_characters("Hello 你好 World"), "Hello  World");
    assert_eq!(strip_cjk_characters("Chapter 1 话"), "Chapter 1 ");
    assert_eq!(strip_cjk_characters("こんにちは English 안녕하세요"), " English ");
    assert_eq!(strip_cjk_characters("Only English! 123"), "Only English! 123");

    // Latin source strips all non-Latin scripts (CJK, Cyrillic, Thai, Greek, Arabic)
    let mixed = "Hello 你好 Привет สวัสดี World 123!";
    assert_eq!(filter_text_by_source_lang(mixed, Some("en")), "Hello    World 123!");
    assert_eq!(filter_text_by_source_lang(mixed, Some("es")), "Hello    World 123!");
    assert_eq!(filter_text_by_source_lang(mixed, Some("vi")), "Hello    World 123!");
    assert_eq!(filter_text_by_source_lang(mixed, Some("id")), "Hello    World 123!");

    // Vietnamese example: Preserves Vietnamese diacritics & Latin alphanumeric while stripping accidental CJK/Thai
    let vi_mixed = "Xin chào các bạn 你好! Đây là thử nghiệm số 1: rất tốt こんにちは.";
    assert_eq!(
        filter_text_by_source_lang(vi_mixed, Some("vi")),
        "Xin chào các bạn ! Đây là thử nghiệm số 1: rất tốt ."
    );

    // Indonesian example: Preserves Indonesian words & Latin alphanumeric while stripping accidental CJK/Cyrillic
    let id_mixed = "Halo semua apa kabar 一? Ini adalah tes komik nomor 42 Спасибо.";
    assert_eq!(
        filter_text_by_source_lang(id_mixed, Some("id")),
        "Halo semua apa kabar ? Ini adalah tes komik nomor 42 ."
    );

    // Cyrillic source strips CJK and Thai, keeps Cyrillic and Latin
    assert_eq!(filter_text_by_source_lang(mixed, Some("ru")), "Hello  Привет  World 123!");

    // Thai source strips CJK and Cyrillic, keeps Thai and Latin
    assert_eq!(filter_text_by_source_lang(mixed, Some("th")), "Hello   สวัสดี World 123!");

    // CJK source strips Cyrillic and Thai, keeps CJK and Latin
    assert_eq!(filter_text_by_source_lang(mixed, Some("zh-Hans")), "Hello 你好   World 123!");
    assert_eq!(filter_text_by_source_lang(mixed, None), "Hello 你好   World 123!");

    // CJK detection
    assert!(has_cjk_characters("你好世界"));
    assert!(has_cjk_characters("こんにちは"));
    assert!(has_cjk_characters("안녕하세요"));
    assert!(has_cjk_characters("Level 99 级"));
    assert!(!has_cjk_characters("Level 99"));
    assert!(!has_cjk_characters("PAGE 12"));
    assert!(!has_cjk_characters("SCANLATOR"));
    assert!(!has_cjk_characters("……！？"));

    // Alphanumeric detection
    assert!(has_alphanumeric_characters("Level 99"));
    assert!(has_alphanumeric_characters("Chapter 1 话"));
    assert!(!has_alphanumeric_characters("……！？"));
    assert!(!has_alphanumeric_characters("你好"));

    // Standalone alphanumeric without CJK
    assert!(is_standalone_alphanumeric_without_cjk("SCANLATOR"));
    assert!(is_standalone_alphanumeric_without_cjk("PAGE 12"));
    assert!(is_standalone_alphanumeric_without_cjk("12345"));
    assert!(is_standalone_alphanumeric_without_cjk("Chapter 1"));
    assert!(!is_standalone_alphanumeric_without_cjk("Chapter 1 话"));
    assert!(!is_standalone_alphanumeric_without_cjk("Level 99 级"));
    assert!(!is_standalone_alphanumeric_without_cjk("你好"));
    assert!(!is_standalone_alphanumeric_without_cjk("……！"));

    // Source language classification
    assert!(is_cjk_source(Some("zh-Hans")));
    assert!(is_cjk_source(Some("zh-Hant")));
    assert!(is_cjk_source(Some("zh")));
    assert!(is_cjk_source(Some("ja")));
    assert!(is_cjk_source(Some("ko")));
    assert!(is_cjk_source(Some("auto")));
    assert!(is_cjk_source(None));
    assert!(!is_cjk_source(Some("en")));
    assert!(!is_cjk_source(Some("english")));
    assert!(!is_cjk_source(Some("ru")));
    assert!(!is_cjk_source(Some("th")));

    assert!(is_cyrillic_source(Some("ru")));
    assert!(is_cyrillic_source(Some("russian")));
    assert!(is_cyrillic_source(Some("uk")));
    assert!(!is_cyrillic_source(Some("en")));
    assert!(!is_cyrillic_source(Some("zh")));

    assert!(is_thai_source(Some("th")));
    assert!(is_thai_source(Some("thai")));
    assert!(!is_thai_source(Some("en")));
    assert!(!is_thai_source(Some("ru")));

    assert!(is_latin_source(Some("en")));
    assert!(is_latin_source(Some("eng")));
    assert!(is_latin_source(Some("es")));
    assert!(is_latin_source(Some("fr")));
    assert!(is_latin_source(Some("vi")));
    assert!(!is_latin_source(Some("zh-Hans")));
    assert!(!is_latin_source(Some("ja")));
    assert!(!is_latin_source(Some("ru")));
    assert!(!is_latin_source(Some("th")));
    assert!(!is_latin_source(None));
}
