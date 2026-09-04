mod common;

use std::path::Path;
use xianscan_rust::ml::schemas::CleanRequestRegion;
use xianscan_rust::pipeline::PipelineEngine;

/// # End-to-End Pipeline Test: Detection, OCR & Inpainting on `page_zhang_yude_chengdu_cemetery.webp`
///
/// ## Purpose:
/// Tests the full multi-stage processing pipeline on a real manga page:
/// 1. Runs `ComicTextDetector` + `RapidOCR` full page text recognition.
/// 2. Converts detected dialogue bubble bounding boxes into clean masks.
/// 3. Executes LaMa inpainting to ensure image dimensions (`w`, `h`) remain preserved.
#[test]
fn test_end_to_end_pipeline_on_zhang_yude_cemetery() {
    let img = match common::load_fixture_or_skip("zh_hans", "page_zhang_yude_chengdu_cemetery.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_end_to_end_pipeline_on_zhang_yude_cemetery: fixture not found");
            return;
        }
    };

    let models_dir = Path::new("models");
    let mut engine = PipelineEngine::new(models_dir);
    let analyze_res = engine.analyze_image(&img).expect("Analysis failed");

    println!("Pipeline analyze produced {} regions", analyze_res.regions.len());
    assert!(!analyze_res.regions.is_empty(), "Must detect regions");

    for r in &analyze_res.regions {
        println!("Region {}: text='{}', conf={:.2}, box={:?}", r.id, r.text, r.confidence, r.box_);
    }

    let clean_regions: Vec<CleanRequestRegion> = analyze_res
        .regions
        .iter()
        .take(3)
        .map(|r| CleanRequestRegion {
            id: r.id.clone(),
            box_: Some(r.box_.clone()),
            polygon: Some(r.polygon.clone()),
            bubble_box: r.bubble_box.clone(),
        })
        .collect();

    let cleaned_img = engine.clean_image(&img, &clean_regions, "patch").expect("Clean image failed");
    let scaled_img = engine.clean_image(&img, &clean_regions, "scaled").expect("Clean scaled failed");
    assert_eq!(scaled_img.width(), img.width());
    assert_eq!(scaled_img.height(), img.height());

    assert_eq!(cleaned_img.width(), img.width());
    assert_eq!(cleaned_img.height(), img.height());
}

/// # Language-Aware Filtering Pipeline Test
///
/// ## Purpose:
/// Verifies that when analyzing in CJK source mode (`zh-Hans`), standalone alphanumeric
/// watermarks and English margin noise are filtered out from final dialogue regions.
#[test]
fn test_pipeline_analyze_with_language_filtering() {
    use xianscan_rust::ml::schemas::AnalyzeOptions;

    let img = match common::load_fixture_or_skip("zh_hans", "page_zhang_yude_chengdu_cemetery.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_pipeline_analyze_with_language_filtering: fixture not found");
            return;
        }
    };

    let models_dir = Path::new("models");
    let mut engine = PipelineEngine::new(models_dir);

    // Analyze with CJK source option (zh-Hans)
    let zh_opts = AnalyzeOptions {
        source_lang: Some("zh-Hans".to_string()),
        target_lang: Some("en".to_string()),
        inpaint_padding_pct: None,
        typeset_padding_pct: None,
        ..Default::default()
    };
    let zh_res = engine.analyze_image_with_options(&img, Some(&zh_opts)).expect("ZH analyze failed");

    // All detected regions must not be standalone alphanumeric without CJK
    for r in &zh_res.regions {
        let text = r.text.trim();
        let is_standalone_alpha = xianscan_rust::ml::detect::is_standalone_alphanumeric_without_cjk(text);
        assert!(!is_standalone_alpha, "Region '{}' should not be standalone alphanumeric in CJK mode", text);
    }
}

/// # End-to-End Pipeline Test with Koharu RF-DETR Seg on Japanese Manga Fixture
#[test]
fn test_end_to_end_pipeline_with_rfdetr_on_manga_fixture() {
    use xianscan_rust::ml::schemas::AnalyzeOptions;

    let img = match common::load_fixture_or_skip("ja", "manga_kotatsu_timing_tea_club_lottery.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_end_to_end_pipeline_with_rfdetr_on_manga_fixture: fixture not found");
            return;
        }
    };

    let models_dir = Path::new("models");
    let mut engine = PipelineEngine::new(models_dir);

    let opts = AnalyzeOptions {
        source_lang: Some("ja".to_string()),
        target_lang: Some("en".to_string()),
        inpaint_padding_pct: None,
        typeset_padding_pct: None,
        ..Default::default()
    };

    let res = engine.analyze_image_with_options(&img, Some(&opts)).expect("Pipeline analyze failed");

    println!("Pipeline analyze with RF-DETR produced backend='{}', {} regions:", res.backend, res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("[{}] kind={:?}, text='{}', box={:?}", i, r.kind, r.text.replace('\n', " "), r.box_);
    }

    assert_eq!(res.backend, "rfdetr-seg-2xl");
    assert!(!res.regions.is_empty(), "Must produce dialogue regions");
}
