use anyhow::Result;
use image::{DynamicImage, GenericImageView};
// -- INTERNAL IMPORTS -- //
use crate::ml::detect::{
    deduplicate_boxes, group_paragraphs, is_cjk_source, is_latin_source,
    merge_text_lines, sort_regions_top_to_bottom,
};
use crate::ml::geometry::{box_to_xywh_f32, line_center_inside_box};
use crate::ml::schemas::{AnalyzeOptions, AnalyzeResponse, BoxRect};
use super::engine::PipelineEngine;
use super::fusion::{fuse_detections, is_multiline_comic_blob};
use super::line_filter::{filter_artwork_and_artifacts, normalize_stray_latin, split_fused_lines};
use super::region_builder::build_regions;
use super::region_merge::post_process_regions;

// -- FUNCTIONS & ALGORITHMS -- //

/// ANALYZE IMAGE WITH DEFAULT OPTIONS
pub fn analyze_image(engine: &mut PipelineEngine, img: &DynamicImage) -> Result<AnalyzeResponse> {
    analyze_image_with_options(engine, img, None)
}

/// ANALYZE IMAGE WITH LANGUAGE ROUTING OPTIONS
pub fn analyze_image_with_options(
    engine: &mut PipelineEngine,
    img: &DynamicImage,
    options: Option<&AnalyzeOptions>,
) -> Result<AnalyzeResponse> {
    let (page_w, page_h) = img.dimensions();
    let source_lang = options.and_then(|o| o.source_lang.as_deref());
    let is_cjk = is_cjk_source(source_lang);
    let is_latin = is_latin_source(source_lang);

    // STAGE 1: DETECTION & OCR FUSION (COMIC DETECTOR, RAPIDOCR, FALLBACK CROPS, CHROMATIC WATERMARKS)
    let fusion_res = fuse_detections(
        &mut engine.detector,
        &mut engine.ocr,
        &engine.watermark,
        img,
        source_lang,
    );

    // STAGE 2: LINE NORMALIZATION, FILTERING, AND SPLITTING
    let normalized_lines = normalize_stray_latin(fusion_res.rapid_lines, is_cjk);
    let clean_lines = filter_artwork_and_artifacts(normalized_lines, page_w, source_lang);
    let split_lines = split_fused_lines(clean_lines);

    // Stage 3: Comic blob suppression & spatial line concatenation
    let rapid_f32_boxes: Vec<Vec<[f32; 2]>> = split_lines
        .iter()
        .map(|l| l.polygon.iter().map(|p| [p[0] as f32, p[1] as f32]).collect())
        .collect();

    let mut kept_comic_boxes = Vec::new();
    let mut kept_comic_scores = Vec::new();

    for (cb, &cs) in fusion_res.comic_boxes.iter().zip(fusion_res.comic_scores.iter()) {
        let f32_cb: Vec<[f32; 2]> = cb.iter().map(|p| [p[0] as f32, p[1] as f32]).collect();
        if is_multiline_comic_blob(&f32_cb, &rapid_f32_boxes, page_w, page_h) {
            continue;
        }
        kept_comic_boxes.push(f32_cb);
        kept_comic_scores.push(cs);
    }

    let mut all_f32_boxes = rapid_f32_boxes;
    let mut all_scores: Vec<f32> = split_lines.iter().map(|l| l.score).collect();
    let mut all_texts: Vec<String> = split_lines.iter().map(|l| l.text.clone()).collect();

    all_f32_boxes.extend(kept_comic_boxes);
    all_scores.extend(kept_comic_scores);
    all_texts.extend(vec![String::new(); all_f32_boxes.len() - all_texts.len()]);

    // Stage 4: Horizontal line merging & Paragraph clustering
    let (merged_f32_boxes, merged_scores) = merge_text_lines(
        &all_f32_boxes,
        &all_scores,
        Some(&all_texts),
        0.40,
        0.55,
        1.35,
    );

    let mut box_texts = Vec::new();
    for b in &merged_f32_boxes {
        let mut matched_txts = Vec::new();
        let (bx, by, bw, bh) = box_to_xywh_f32(b);
        let b_rect = BoxRect { x: bx as i32, y: by as i32, w: bw as i32, h: bh as i32 };
        for line in &split_lines {
            if line_center_inside_box(&line.polygon, &b_rect) {
                matched_txts.push(line.text.clone());
            }
        }
        box_texts.push(matched_txts.join("\n"));
    }

    let (para_boxes, para_scores) = group_paragraphs(
        &merged_f32_boxes,
        &merged_scores,
        Some(&box_texts),
        0.20,
        0.45,
        1.50,
        0.60,
    );

    // Stage 5: Bounding box deduplication & Reading order sort
    let (dedup_boxes, _) = deduplicate_boxes(&para_boxes, &para_scores, 0.40);
    if dedup_boxes.is_empty() {
        return Ok(AnalyzeResponse {
            width: page_w,
            height: page_h,
            backend: fusion_res.backend,
            regions: Vec::new(),
        });
    }

    let order = sort_regions_top_to_bottom(&dedup_boxes, page_h as usize, 0.5);

    // Stage 6: Region construction, angle computation & dynamic glyph envelope clamping
    let initial_regions = build_regions(
        &mut engine.ocr,
        img,
        &dedup_boxes,
        &order,
        &split_lines,
        page_w,
        page_h,
        is_cjk,
        is_latin,
        source_lang,
    );

    // Stage 7: Punctuation merging, double-cloud dialogue monologue post-merge & language filtering
    let final_regions = post_process_regions(
        &mut engine.ocr,
        img,
        initial_regions,
        page_w,
        page_h,
        is_cjk,
        is_latin,
        source_lang,
    );

    Ok(AnalyzeResponse {
        width: page_w,
        height: page_h,
        backend: fusion_res.backend,
        regions: final_regions,
    })
}
