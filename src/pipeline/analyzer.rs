// -- CRATE / EXTERNAL IMPORTS -- //
use anyhow::Result;
use image::{DynamicImage, GenericImageView};

// -- INTERNAL IMPORTS -- //
use crate::ml::detect::{
    deduplicate_boxes, is_cjk_source, is_latin_source, sort_regions_top_to_bottom,
};
use crate::ml::schemas::{
    AnalyzeOptions, AnalyzeResponse, BoxRect, OcrStats, OcrStepLog, OnomatopoeiaFrame, PanelFrame,
};
use super::engine::PipelineEngine;
use super::fusion::fuse_detections;
use super::region_builder::build_regions;

// -- FUNCTIONS & ALGORITHMS -- //

/// ANALYZE IMAGE WITH DEFAULT OPTIONS
pub fn analyze_image(engine: &mut PipelineEngine, img: &DynamicImage) -> Result<AnalyzeResponse> {
    analyze_image_with_options(engine, img, None)
}

/// ANALYZE IMAGE WITH LANGUAGE ROUTING OPTIONS (2-STAGE PURE NEURAL ARCHITECTURE)
pub fn analyze_image_with_options(
    engine: &mut PipelineEngine,
    img: &DynamicImage,
    options: Option<&AnalyzeOptions>,
) -> Result<AnalyzeResponse> {
    let t_total_start = std::time::Instant::now();
    let (page_w, page_h) = img.dimensions();
    let source_lang = options.and_then(|o| o.source_lang.as_deref());
    let enable_watermark_inpaint = options.and_then(|o| o.enable_watermark_inpaint).unwrap_or(false);
    let is_cjk = is_cjk_source(source_lang);
    let is_latin = is_latin_source(source_lang);

    // =========================================================================
    // STAGE 1: NEURAL LAYOUT ANALYSIS & OCR DETECTION
    // =========================================================================
    let fusion_res = fuse_detections(
        &mut engine.detector,
        &mut engine.ocr,
        &engine.watermark,
        img,
        source_lang,
        enable_watermark_inpaint,
    );

    // Panels omitted per user request (only bubbles, text, and sfx)
    let panels: Vec<PanelFrame> = Vec::new();

    // 2. CONSTRUCT STRUCTURAL ONOMATOPOEIA FRAMES (CLASS 1) - SCALED 6% ALL SIDES (+12% TOTAL)
    // CLUSTER OVERLAPPING SFX DETECTOR QUERIES SO DUPLICATE BOUNDING BOXES MERGE INTO A SINGLE FRAME
    let clustered_sfx_frames = crate::ml::detect::cluster_adjacent_sfx_boxes(&fusion_res.onomatopoeia, 25);
    let mut onomatopoeia: Vec<OnomatopoeiaFrame> = clustered_sfx_frames
        .iter()
        .enumerate()
        .map(|(idx, (poly, score))| {
            let (bx, by, bw, bh) = crate::ml::geometry::box_to_xywh_f32(poly);
            let (bx_i, by_i, bw_i, bh_i) = (bx.round() as i32, by.round() as i32, bw.round() as i32, bh.round() as i32);
            let pad_x = ((bw_i as f32) * 0.06).round() as i32;
            let pad_y = ((bh_i as f32) * 0.06).round() as i32;
            let sx = (bx_i - pad_x).max(0);
            let sy = (by_i - pad_y).max(0);
            let sw = (bw_i + pad_x * 2).min(page_w as i32 - sx);
            let sh = (bh_i + pad_y * 2).min(page_h as i32 - sy);
            OnomatopoeiaFrame {
                id: format!("sfx{}", idx),
                seq: idx,
                box_: BoxRect { x: sx, y: sy, w: sw, h: sh },
                score: *score,
            }
        })
        .collect();

    onomatopoeia.sort_by_key(|s| s.box_.y);
    for (seq, s) in onomatopoeia.iter_mut().enumerate() {
        s.seq = seq;
        s.id = format!("sfx{}", seq);
    }

    // =========================================================================
    // STAGE 2: CONTAINER CANDIDATE COLLECTION & READING ORDER SORT
    // =========================================================================
    let t_stage2_start = std::time::Instant::now();
    let mut candidate_boxes: Vec<Vec<[f32; 2]>> = Vec::new();
    let mut candidate_scores: Vec<f32> = Vec::new();

    // A. Use Detector-First Text, Free-Text, and Onomatopoeia (SFX) Boxes if available (Koharu / RT-DETR)
    let is_detector_first = fusion_res.backend == "rfdetr-seg-2xl" || fusion_res.backend == "rtdetr-v2";
    if is_detector_first && (!fusion_res.text_bubbles.is_empty() || !fusion_res.text_free.is_empty() || !fusion_res.onomatopoeia.is_empty()) {
        for (b, score) in &fusion_res.text_bubbles {
            candidate_boxes.push(vec![
                [b.x as f32, b.y as f32],
                [(b.x + b.w) as f32, b.y as f32],
                [(b.x + b.w) as f32, (b.y + b.h) as f32],
                [b.x as f32, (b.y + b.h) as f32],
            ]);
            candidate_scores.push(*score);
        }
        for (b, score) in &fusion_res.text_free {
            candidate_boxes.push(vec![
                [b.x as f32, b.y as f32],
                [(b.x + b.w) as f32, b.y as f32],
                [(b.x + b.w) as f32, (b.y + b.h) as f32],
                [b.x as f32, (b.y + b.h) as f32],
            ]);
            candidate_scores.push(*score);
        }
        // CLUSTER ADJACENT / OVERLAPPING ONOMATOPOEIA STROKE FRAGMENTS INTO UNIFIED ENVELOPES (GAP <= 25PX)
        let clustered_sfx = crate::ml::detect::cluster_adjacent_sfx_boxes(&fusion_res.onomatopoeia, 25);
        for (poly, score) in clustered_sfx {
            candidate_boxes.push(poly);
            candidate_scores.push(score);
        }
    } else {
        // Fallback: Use RapidOCR line bounding boxes directly without distance clumping
        for line in &fusion_res.rapid_lines {
            candidate_boxes.push(line.polygon.iter().map(|p| [p[0] as f32, p[1] as f32]).collect());
            candidate_scores.push(line.score);
        }
    }

    if candidate_boxes.is_empty() {
        let total_time_ms = t_total_start.elapsed().as_secs_f64() * 1000.0;
        let stats = OcrStats {
            total_time_ms,
            queue_wait_ms: None,
            server_request_time_ms: None,
            wall_time_ms: None,
            detector_time_ms: fusion_res.detector_time_ms,
            ocr_fullpage_time_ms: fusion_res.ocr_fullpage_time_ms,
            rescue_time_ms: fusion_res.rescue_time_ms,
            watermark_time_ms: fusion_res.watermark_time_ms,
            assembly_time_ms: 0.0,
            backend: fusion_res.backend.clone(),
            device: Some(crate::ml::device::get_hardware_status().active_provider),
            image_width: page_w,
            image_height: page_h,
            raw_bubbles_count: fusion_res.bubbles.len(),
            raw_text_bubbles_count: fusion_res.text_bubbles.len(),
            raw_text_free_count: fusion_res.text_free.len(),
            raw_sfx_count: fusion_res.onomatopoeia.len(),
            raw_ocr_lines_count: fusion_res.raw_ocr_lines_count,
            rescued_crops_count: fusion_res.rescued_crops_count,
            watermark_recovered_count: fusion_res.watermark_recovered_count,
            final_regions_count: 0,
            avg_confidence: 0.0,
            steps: vec![
                OcrStepLog {
                    step: "Layout & OCR Detection".to_string(),
                    duration_ms: fusion_res.detector_time_ms + fusion_res.ocr_fullpage_time_ms,
                    details: "No text or bubble candidates found on page".to_string(),
                },
            ],
        };

        return Ok(AnalyzeResponse {
            width: page_w,
            height: page_h,
            backend: fusion_res.backend,
            panels,
            onomatopoeia,
            regions: Vec::new(),
            stats: Some(stats),
        });
    }

    // Suppress spatial duplicate candidate boxes
    let (dedup_boxes, _) = deduplicate_boxes(&candidate_boxes, &candidate_scores, 0.40);
    let order = sort_regions_top_to_bottom(&dedup_boxes, page_h as usize, 0.5);
    let stage2_duration_ms = t_stage2_start.elapsed().as_secs_f64() * 1000.0;

    // Combine text_free and onomatopoeia for SFX classification
    let mut sfx_boxes = fusion_res.text_free.clone();
    sfx_boxes.extend(fusion_res.onomatopoeia.clone());

    // =========================================================================
    // STAGE 3: TARGETED TEXT RECOGNITION & REGION MASKING
    // =========================================================================
    let t_stage3_start = std::time::Instant::now();
    let mut final_regions = build_regions(
        &mut engine.ocr,
        img,
        &dedup_boxes,
        &order,
        &fusion_res.rapid_lines,
        &fusion_res.bubbles,
        &sfx_boxes,
        page_w,
        page_h,
        is_cjk,
        is_latin,
        source_lang,
        options.and_then(|o| o.inpaint_padding_pct),
        options.and_then(|o| o.typeset_padding_pct),
    );

    // Filter out low-confidence standalone single-character artwork artifacts (e.g. blush mark '红', conf < 0.58), but preserve SoundEffects
    final_regions.retain(|r| {
        let t = r.text.trim();
        if t.chars().count() == 1 && r.confidence < 0.58 && r.kind != crate::ml::schemas::RegionKind::SoundEffect {
            return false;
        }
        true
    });

    // Re-index sequential region IDs
    for (idx, r) in final_regions.iter_mut().enumerate() {
        r.id = format!("r{}", idx);
    }
    let stage3_duration_ms = t_stage3_start.elapsed().as_secs_f64() * 1000.0;
    let assembly_time_ms = stage2_duration_ms + stage3_duration_ms;
    let total_time_ms = t_total_start.elapsed().as_secs_f64() * 1000.0;

    let avg_confidence = if final_regions.is_empty() {
        0.0
    } else {
        final_regions.iter().map(|r| r.confidence).sum::<f32>() / final_regions.len() as f32
    };

    let steps = vec![
        OcrStepLog {
            step: "Comic Layout Detection".to_string(),
            duration_ms: fusion_res.detector_time_ms,
            details: format!(
                "Identified {} bubbles, {} in-bubble texts, {} free texts, {} SFX ({})",
                fusion_res.bubbles.len(),
                fusion_res.text_bubbles.len(),
                fusion_res.text_free.len(),
                fusion_res.onomatopoeia.len(),
                fusion_res.backend
            ),
        },
        OcrStepLog {
            step: "Full-Page Line Detection & OCR".to_string(),
            duration_ms: fusion_res.ocr_fullpage_time_ms,
            details: format!(
                "Extracted {} raw text lines across {}x{} image canvas",
                fusion_res.raw_ocr_lines_count, page_w, page_h
            ),
        },
        OcrStepLog {
            step: "Crop Rescue & Sub-Region Batching".to_string(),
            duration_ms: fusion_res.rescue_time_ms,
            details: format!(
                "Rescued {} missed or truncated text instances via isolated crops",
                fusion_res.rescued_crops_count
            ),
        },
        OcrStepLog {
            step: "Chromatic Watermark Inpainting".to_string(),
            duration_ms: fusion_res.watermark_time_ms,
            details: format!(
                "Inpainted watermarks and recovered {} obscured lines",
                fusion_res.watermark_recovered_count
            ),
        },
        OcrStepLog {
            step: "Candidate Deduplication & Sort".to_string(),
            duration_ms: stage2_duration_ms,
            details: format!(
                "Suppressed duplicates: {} -> {} candidates; sorted top-to-bottom",
                candidate_boxes.len(),
                dedup_boxes.len()
            ),
        },
        OcrStepLog {
            step: "Utterance Assembly & Orientation".to_string(),
            duration_ms: stage3_duration_ms,
            details: format!(
                "Assembled {} final structured regions with avg confidence {:.1}%",
                final_regions.len(),
                avg_confidence * 100.0
            ),
        },
    ];

    let stats = OcrStats {
        total_time_ms,
        queue_wait_ms: None,
        server_request_time_ms: None,
        wall_time_ms: None,
        detector_time_ms: fusion_res.detector_time_ms,
        ocr_fullpage_time_ms: fusion_res.ocr_fullpage_time_ms,
        rescue_time_ms: fusion_res.rescue_time_ms,
        watermark_time_ms: fusion_res.watermark_time_ms,
        assembly_time_ms,
        backend: fusion_res.backend.clone(),
        device: Some(crate::ml::device::get_hardware_status().active_provider),
        image_width: page_w,
        image_height: page_h,
        raw_bubbles_count: fusion_res.bubbles.len(),
        raw_text_bubbles_count: fusion_res.text_bubbles.len(),
        raw_text_free_count: fusion_res.text_free.len(),
        raw_sfx_count: fusion_res.onomatopoeia.len(),
        raw_ocr_lines_count: fusion_res.raw_ocr_lines_count,
        rescued_crops_count: fusion_res.rescued_crops_count,
        watermark_recovered_count: fusion_res.watermark_recovered_count,
        final_regions_count: final_regions.len(),
        avg_confidence,
        steps,
    };

    Ok(AnalyzeResponse {
        width: page_w,
        height: page_h,
        backend: fusion_res.backend,
        panels,
        onomatopoeia,
        regions: final_regions,
        stats: Some(stats),
    })
}
