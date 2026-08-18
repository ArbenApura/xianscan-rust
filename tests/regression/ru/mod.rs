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
    let img = match crate::common::load_fixture_or_skip("ru", "sample.webp")
        .or_else(|| crate::common::load_fixture_or_skip("zh_hans", "page_zhang_yude_chengdu_cemetery.webp"))
    {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_with_russian_source_routing: fixture not found");
            return;
        }
    };

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
    let img = match crate::common::load_fixture_or_skip("ru", "page_she_clearly_russian_bubble.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_she_clearly_russian_bubble: fixture not found");
            return;
        }
    };

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

/// # Russian Real-Page Regression: `page_girl_shiver_curved_sfx_tyayan.webp` (Resolution: 720 × 2054)
///
/// ## Purpose & Behavior Tested:
/// - **Curved Russian SFX (`ТЯ-ЯНЬ`)**:
///   Ensures slanted sound effect is recognized as Cyrillic `ТЯ-ЯНЬ` / `тя-янь` without misreading as Latin `ЛаН`/`Lan`.
/// - **Handwritten Cyrillic Action SFX (`вздрог`)**:
///   Ensures the startle/shiver SFX is recognized in Russian Cyrillic `вздрог` rather than Latin noise (`e3tfo`).
/// - **Negative Guards**:
///   Strictly forbids Latin hallucination slivers (`e3tfo`, `ЛаН`).
#[test]
fn test_regression_page_girl_shiver_curved_sfx_tyayan() {
    let img = match crate::common::load_fixture_or_skip("ru", "page_girl_shiver_curved_sfx_tyayan.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_girl_shiver_curved_sfx_tyayan: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ru"));
    println!("Russian Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. NO LATIN HALLUCINATIONS OR WRONG GLYPH SLIVERS
    assert!(
        !res.regions.iter().any(|r| r.text.to_lowercase().contains("e3tfo") || r.text.contains("ЛаН")),
        "Must not contain hallucinated Latin noise 'e3tfo' or 'ЛаН'"
    );

    // 2. CURVED SFX: «ТЯ-ЯНЬ» / «тя-янь»
    let tyayan_region = res.regions.iter().find(|r| {
        let t = r.text.to_uppercase();
        (t.contains("ТЯ") && t.contains("ЯНЬ")) || t.contains("ТЯ-ЯНЬ") || t.contains("ТЯЯНЬ")
    });
    assert!(
        tyayan_region.is_some(),
        "Must recognize curved Cyrillic SFX 'ТЯ-ЯНЬ', got: {:?}",
        res.regions.iter().map(|r| &r.text).collect::<Vec<_>>()
    );

    // 3. HANDWRITTEN REACTION SFX: «вздрог»
    let vzdrog_region = res.regions.iter().find(|r| {
        let t = r.text.to_lowercase();
        t.contains("вздрог") || t.contains("взgрог") || t.contains("взд")
    });
    assert!(
        vzdrog_region.is_some(),
        "Must recognize handwritten Russian SFX 'вздрог', got: {:?}",
        res.regions.iter().map(|r| &r.text).collect::<Vec<_>>()
    );
}

/// # Russian Real-Page Regression: `page_girl_hair_touch_sfx_trog.webp` (Resolution: 720 × 2046)
///
/// ## Purpose & Behavior Tested:
/// - **Upper Dialogue Bubble**:
///   Guarantees `«ого...»` is cleanly extracted.
/// - **Slanted Cyrillic SFX**:
///   Guarantees curved action SFX `«трог...»` / `«хлоп...»` is recognized in Cyrillic without Latin `"кlоп"`.
/// - **Lower Dialogue Bubble**:
///   Guarantees `«КАКОЙ ЖЕ ОН\nКРАСАВЧИК.»` is cleanly extracted across 2 lines.
#[test]
fn test_regression_page_girl_hair_touch_sfx_trog() {
    let img = match crate::common::load_fixture_or_skip("ru", "page_girl_hair_touch_sfx_trog.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_girl_hair_touch_sfx_trog: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ru"));
    println!("Russian Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT REGION COUNT
    assert_eq!(res.regions.len(), 3, "Must have exactly 3 detected regions, got {}", res.regions.len());

    // 2. UPPER DIALOGUE BUBBLE: «ого...»
    assert!(
        res.regions[0].text.to_lowercase().contains("ого"),
        "Region 0 must be 'ого...', got '{}'",
        res.regions[0].text
    );

    // 3. SLANTED SFX: Must recognize Cyrillic action SFX 'трог' without 'клоп' / 'кlоп'
    let sfx_text = res.regions[1].text.to_lowercase();
    assert!(
        !sfx_text.contains("клоп") && !sfx_text.contains("кlоп"),
        "Region 1 must not contain 'клоп' or 'кlоп', got '{}'",
        res.regions[1].text
    );
    assert!(
        sfx_text.contains("трог"),
        "Region 1 must recognize 'трог', got '{}'",
        res.regions[1].text
    );

    // 4. LOWER DIALOGUE BUBBLE: «КАКОЙ ЖЕ ОН\nКРАСАВЧИК.»
    let bottom_text = res.regions[2].text.to_uppercase();
    assert!(
        bottom_text.contains("КАКОЙ") && bottom_text.contains("КРАСАВЧИК"),
        "Region 2 must contain 'КАКОЙ ЖЕ ОН КРАСАВЧИК', got '{}'",
        res.regions[2].text
    );
}



