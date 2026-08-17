mod common;

use std::path::Path;
use common::{hash_image, read_cache, write_cache};
use xianscan_rust::ml::schemas::{AnalyzeResponse, CleanRequestRegion};
use xianscan_rust::pipeline::PipelineEngine;

/// # End-to-End Pipeline Test: Detection, OCR & Inpainting on `page_679.webp`
///
/// ## Purpose:
/// Tests the full multi-stage processing pipeline on a real manga page:
/// 1. Runs `ComicTextDetector` + `RapidOCR` full page text recognition.
/// 2. Converts detected dialogue bubble bounding boxes into clean masks.
/// 3. Executes LaMa inpainting to ensure image dimensions (`w`, `h`) remain preserved.
#[test]
fn test_end_to_end_pipeline_on_page_679() {
    let img_path = Path::new("tests/fixtures/page_679.webp");
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_679.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let key = hash_image(&img);
    let (analyze_res, engine_opt) = if let Some(cached) = read_cache::<AnalyzeResponse>("analyze", &key) {
        (cached, None)
    } else {
        let models_dir = Path::new("models");
        let mut engine = PipelineEngine::new(models_dir);
        let res = engine.analyze_image(&img).expect("Analysis failed");
        write_cache("analyze", &key, &res);
        (res, Some(engine))
    };

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
        })
        .collect();

    let clean_key = format!("clean_dim_{}_{}", key, clean_regions.len());
    let (cleaned_w, cleaned_h) = if let Some(dims) = read_cache::<(u32, u32)>("clean_pipeline", &clean_key) {
        dims
    } else {
        let mut engine = engine_opt.unwrap_or_else(|| PipelineEngine::new(Path::new("models")));
        let cleaned_img = engine.clean_image(&img, &clean_regions, "patch").expect("Clean image failed");
        let scaled_img = engine.clean_image(&img, &clean_regions, "scaled").expect("Clean scaled failed");
        assert_eq!(scaled_img.width(), img.width());
        assert_eq!(scaled_img.height(), img.height());
        write_cache("clean_pipeline", &clean_key, &(cleaned_img.width(), cleaned_img.height()));
        (cleaned_img.width(), cleaned_img.height())
    };

    assert_eq!(cleaned_w, img.width());
    assert_eq!(cleaned_h, img.height());
}

/// # Language-Aware Filtering Pipeline Test
///
/// ## Purpose:
/// Verifies that when analyzing in CJK source mode (`zh-Hans`), standalone alphanumeric
/// watermarks and English margin noise are filtered out from final dialogue regions.
#[test]
fn test_pipeline_analyze_with_language_filtering() {
    use xianscan_rust::ml::schemas::AnalyzeOptions;

    let img_path = Path::new("tests/fixtures/page_679.webp");
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_679.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let models_dir = Path::new("models");
    let mut engine = PipelineEngine::new(models_dir);

    // Analyze with CJK source option (zh-Hans)
    let zh_opts = AnalyzeOptions {
        source_lang: Some("zh-Hans".to_string()),
        target_lang: Some("en".to_string()),
    };
    let zh_res = engine.analyze_image_with_options(&img, Some(&zh_opts)).expect("ZH analyze failed");

    // All detected regions must not be standalone alphanumeric without CJK
    for r in &zh_res.regions {
        let text = r.text.trim();
        let is_standalone_alpha = xianscan_rust::ml::detect::is_standalone_alphanumeric_without_cjk(text);
        assert!(!is_standalone_alpha, "Region '{}' should not be standalone alphanumeric in CJK mode", text);
    }
}
