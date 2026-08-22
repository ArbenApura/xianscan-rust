use xianscan_rust::ml::detect::clean_stray_ocr_artifacts;

#[test]
fn test_case_5_clean_stray_ocr_artifacts_normal() {
    let raw = "哼，这么胡\n来，菜鸟一\n个！";
    let cleaned = clean_stray_ocr_artifacts(raw);
    assert_eq!(cleaned, "哼，这么胡\n来，菜鸟一\n个！");
}

#[test]
fn test_case_11_sfx_exclamation_retention() {
    let raw = "咳！";
    let cleaned = clean_stray_ocr_artifacts(raw);
    assert_eq!(cleaned, "咳！");
}

#[test]
fn test_compare_detectors_on_user_image() {
    use std::path::Path;
    use xianscan_rust::ml::schemas::AnalyzeOptions;
    use xianscan_rust::pipeline::PipelineEngine;

    let img_path = "C:/Users/Admin/.gemini/antigravity/brain/230d8428-07b7-488c-a0e9-a7a8c124132a/.user_uploaded/media_1787360888448.png";
    if !Path::new(img_path).exists() {
        return;
    }
    let img = image::open(img_path).expect("Failed to open image");
    let opts = AnalyzeOptions {
        source_lang: Some("zh-Hans".to_string()),
        target_lang: Some("en".to_string()),
        ..Default::default()
    };

    println!("\n=== Pipeline with Koharu RF-DETR ===");
    let mut engine_rf = PipelineEngine::new("models");
    let res_rf = engine_rf.analyze_image_with_options(&img, Some(&opts)).expect("RF-DETR analyze failed");
    println!("Backend: {}, regions count: {}", res_rf.backend, res_rf.regions.len());
    for (i, r) in res_rf.regions.iter().enumerate() {
        println!("  [{}] kind={:?}, bubble_box={:?}, text='{}'", i, r.kind, r.bubble_box, r.text.replace('\n', " "));
    }
}
