mod common;

use std::path::Path;
use common::{hash_image, read_cache, write_cache};
use xianscan_rust::ml::detect::{ComicTextDetector, DetectResult};
use xianscan_rust::ml::ocr::{OcrLine, RapidOcr};

#[test]
fn test_comic_text_detector_on_fixture_page_679() {
    let img_path = Path::new("tests/fixtures/page_679.jpg");
    assert!(img_path.exists(), "Fixture page_679.jpg must exist");

    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_679.jpg")
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

    println!("Detected {} text lines on page_679.jpg ({})", boxes_len, backend);
    assert!(boxes_len > 0, "Must detect text boxes on page_679.jpg");
}

#[test]
fn test_rapid_ocr_detect_and_recognize_on_page_679() {
    let img_path = Path::new("tests/fixtures/page_679.jpg");
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_679.jpg")
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

#[test]
fn test_language_aware_filtering_helpers() {
    use xianscan_rust::ml::detect::{
        has_alphanumeric_characters, has_cjk_characters, is_cjk_source, is_latin_source,
        is_standalone_alphanumeric_without_cjk,
    };

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

    assert!(is_latin_source(Some("en")));
    assert!(is_latin_source(Some("eng")));
    assert!(is_latin_source(Some("es")));
    assert!(is_latin_source(Some("fr")));
    assert!(!is_latin_source(Some("zh-Hans")));
    assert!(!is_latin_source(Some("ja")));
    assert!(!is_latin_source(None));
}
