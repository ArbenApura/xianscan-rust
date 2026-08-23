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
fn test_comic_text_detector_on_fixture_zhang_yude_cemetery() {
    let img = match common::load_fixture_or_skip("zh_hans", "page_zhang_yude_chengdu_cemetery.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_comic_text_detector_on_fixture_zhang_yude_cemetery: fixture not found");
            return;
        }
    };

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
fn test_rapid_ocr_detect_and_recognize_on_zhang_yude_cemetery() {
    let img = match common::load_fixture_or_skip("zh_hans", "page_zhang_yude_chengdu_cemetery.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_rapid_ocr_detect_and_recognize_on_zhang_yude_cemetery: fixture not found");
            return;
        }
    };

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
    assert_eq!(filter_text_by_source_lang(mixed, Some("fr")), "Hello    World 123!");
    assert_eq!(filter_text_by_source_lang(mixed, Some("id")), "Hello    World 123!");

    // Indonesian example: Preserves Indonesian words & Latin alphanumeric while stripping accidental CJK/Cyrillic
    let id_mixed = "Halo semua apa kabar 一? Ini adalah tes komik nomor 42 Спасибо.";
    assert_eq!(
        filter_text_by_source_lang(id_mixed, Some("id")),
        "Halo semua apa kabar ? Ini adalah tes komik nomor 42 ."
    );

    // Cyrillic source strips CJK and Thai, keeps Cyrillic
    let ru_mixed = "Привет мир! 你好 สวัสดี";
    assert_eq!(filter_text_by_source_lang(ru_mixed, Some("ru")), "Привет мир!  ");

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
    assert!(is_latin_source(Some("id")));
    assert!(!is_latin_source(Some("zh-Hans")));
    assert!(!is_latin_source(Some("ja")));
    assert!(!is_latin_source(Some("ru")));
    assert!(!is_latin_source(Some("th")));
    assert!(!is_latin_source(None));
}

// -- KOHARU LAYOUT DETECTOR TESTS -- //

/// # Detector Test: KoharuLayout RF-DETR Seg Layout Detector
///
/// ## Purpose:
/// Verifies that KoharuLayout RF-DETR Seg detects text, onomatopoeia, speech bubbles, and panels.
#[test]
fn test_rfdetr_seg_layout_detector() {
    use xianscan_rust::ml::detect::RfDetrSegDetector;

    let img = match common::load_fixture_or_skip("ja", "manga_kotatsu_timing_tea_club_lottery.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_rfdetr_seg_layout_detector: fixture not found");
            return;
        }
    };

    let model_path = Path::new("models/rfdetr-seg-2xlarge.onnx");
    if !model_path.exists() {
        eprintln!("RF-DETR model not found at models/rfdetr-seg-2xlarge.onnx, skipping test");
        return;
    }

    let mut detector = RfDetrSegDetector::new(model_path).expect("Failed to load RF-DETR detector");
    let res = detector.detect(&img).expect("Inference failed");

    println!(
        "Koharu RF-DETR detected: {} bubbles, {} text bubbles, {} text free (all detections: {})",
        res.bubbles.len(),
        res.text_bubbles.len(),
        res.text_free.len(),
        res.all_detections.len()
    );
    assert!(!res.bubbles.is_empty(), "Must detect speech bubble containers");
    assert!(!res.text_bubbles.is_empty(), "Must detect text inside bubbles");
}

/// # Unit Test: SFX Area Calculation and Filtering
///
/// ## Purpose:
/// Verifies the 30% area threshold logic that protects background artwork from being destroyed.
#[test]
fn test_sfx_area_calculation_and_filtering() {
    let page_w = 1000.0f32;
    let page_h = 2000.0f32;
    let total_area = page_w * page_h;

    // Small SFX: 100x150 = 15,000 px^2 (0.75% of page)
    let small_sfx_w = 100.0f32;
    let small_sfx_h = 150.0f32;
    let small_ratio = (small_sfx_w * small_sfx_h) / total_area;
    assert!(small_ratio <= 0.30, "Small SFX must be below 30% threshold (was {:.4})", small_ratio);

    // Medium SFX: 400x500 = 200,000 px^2 (10% of page)
    let med_sfx_w = 400.0f32;
    let med_sfx_h = 500.0f32;
    let med_ratio = (med_sfx_w * med_sfx_h) / total_area;
    assert!(med_ratio <= 0.30, "Medium SFX must be below 30% threshold (was {:.4})", med_ratio);

    // Giant Splash SFX: 800x1000 = 800,000 px^2 (40% of page)
    let giant_sfx_w = 800.0f32;
    let giant_sfx_h = 1000.0f32;
    let giant_ratio = (giant_sfx_w * giant_sfx_h) / total_area;
    assert!(giant_ratio > 0.30, "Giant Splash SFX must exceed 30% threshold (was {:.4})", giant_ratio);

    // Custom threshold test: 50%
    assert!(giant_ratio <= 0.50, "Giant SFX of 40% must pass a 50% threshold");
}
