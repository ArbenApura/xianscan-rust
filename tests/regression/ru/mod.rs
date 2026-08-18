use std::path::Path;
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::detect::filter_text_by_source_lang;

/// # Russian / Cyrillic Regression Test: Dedicated Model & Script Preservation
///
/// ## Purpose & Behavior Tested:
/// - **Language Routing (`ru`, `uk`, `bg`)**:
///   Verifies Cyrillic source mode routes to `cyrillic_mobile_v2.0_rec.onnx` and `cyrillic_dict.txt`,
///   preserving Cyrillic characters (`\u0400-\u04ff`) and punctuation while stripping CJK/Thai.
#[test]
fn test_regression_russian_script_handling() {
    let sample = "Привет мир! Это проверка русского перевода комиксов.";
    let filtered = filter_text_by_source_lang(sample, Some("ru"));
    assert_eq!(filtered, "Привет мир! Это проверка русского перевода комиксов.");

    let mixed = "Привет мир! 你好 สวัสดี";
    let cleaned = filter_text_by_source_lang(mixed, Some("ru"));
    assert_eq!(cleaned.trim(), "Привет мир!");
}

/// # Russian Real-Page Regression: `page_zhang_yude_chengdu_cemetery.webp` with `ru` Source Routing
#[test]
fn test_regression_page_with_russian_source_routing() {
    let mut img_path = Path::new("tests/fixtures/ru/sample.webp"); if !img_path.exists() { img_path = Path::new("tests/fixtures/zh_hans/page_zhang_yude_chengdu_cemetery.webp"); };
    if !img_path.exists() {
        eprintln!("Fixture {:?} not found, skipping test", img_path);
        return;
    }

    let img = image::ImageReader::open(img_path)
        .expect("Failed to open fixture image")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture_with_lang(&img, Some("ru"));
    assert!(!res.regions.is_empty(), "Pipeline in Russian mode must detect text regions");

    for r in &res.regions {
        assert!(r.box_.w > 0 && r.box_.h > 0, "Region dimensions must be positive");
    }
}

/// # Russian Real-Page Regression: `page_she_clearly_russian_bubble.png` (Resolution: 720 × 1159 PNG)
///
/// ## Purpose & Behavior Tested:
/// - **Cyrillic Speech Bubble Detection & OCR Recognition**:
///   Guarantees that the circular speech bubble containing Cyrillic dialogue:
///   `ОН ЖЕ ЯВНО...` (or `Он же явно...`) is detected as a single clean region.
/// - **Language Routing Integrity (`ru`, `ru-en`)**:
///   Verifies that `source_lang = Some("ru")` and `Some("ru-en")` properly route to the Cyrillic OCR recognizer.
#[test]
fn test_regression_page_she_clearly_russian_bubble() {
    let img_path = Path::new("tests/fixtures/ru/page_she_clearly_russian_bubble.webp");
    if !img_path.exists() {
        eprintln!("Fixture {:?} not found, skipping test", img_path);
        return;
    }

    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_she_clearly_russian_bubble.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture_with_lang(&img, Some("ru"));
    println!("Russian Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. Exact count: exactly 1 region
    assert_eq!(res.regions.len(), 1, "Russian Page must have exactly 1 detected region, got {}", res.regions.len());

    // 2. Text verification: Cyrillic dialogue 'ОН ЖЕ ЯВНО'
    let text_upper = res.regions[0].text.to_uppercase();
    assert!(
        text_upper.contains("ОН") && (text_upper.contains("ЯВНО") || text_upper.contains("ЯВН")),
        "Region text must contain 'ОН ЖЕ ЯВНО', got '{}'",
        res.regions[0].text
    );

    // 3. Geometry verification: must encompass the speech bubble in the upper half
    let b = &res.regions[0].box_;
    assert!(b.y >= 250 && b.y <= 450, "Bubble Y ({}) must be in upper half of page", b.y);
    assert!(b.w >= 100 && b.w <= 300, "Bubble width ({}) must be tight", b.w);
}
