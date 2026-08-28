// -- CRATE / EXTERNAL IMPORTS -- //
use anyhow::Result;
use image::{DynamicImage, GenericImageView};

// -- INTERNAL IMPORTS -- //
use crate::ml::detect::{
    deduplicate_boxes, is_cjk_source, is_latin_source, sort_regions_top_to_bottom,
};
use crate::ml::schemas::{
    AnalyzeOptions, AnalyzeResponse, OcrStats, OcrStepLog, OnomatopoeiaFrame,
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
    let source_lang = options.and_then(|o| o.source_lang.as_deref());
    let enable_watermark_inpaint = options.and_then(|o| o.enable_watermark_inpaint).unwrap_or(false);
    let allow_degraded_fallback = options.and_then(|o| o.allow_degraded_fallback).unwrap_or(false);

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
        allow_degraded_fallback,
    )?;

    analyze_image_with_fusion_timed(engine, img, &fusion_res, options, t_total_start)
}

/// FAST-PATH POSTPROCESSING: EXECUTES STAGE 2 & 3 DIRECTLY GIVEN PRE-COMPUTED DETECTION FUSION RESULTS
pub fn analyze_image_with_fusion(
    engine: &mut PipelineEngine,
    img: &DynamicImage,
    fusion_res: &super::fusion::DetectionFusionResult,
    options: Option<&AnalyzeOptions>,
) -> Result<AnalyzeResponse> {
    let t_total_start = std::time::Instant::now();
    analyze_image_with_fusion_timed(engine, img, fusion_res, options, t_total_start)
}

pub fn analyze_image_with_fusion_timed(
    engine: &mut PipelineEngine,
    img: &DynamicImage,
    fusion_res: &super::fusion::DetectionFusionResult,
    options: Option<&AnalyzeOptions>,
    t_total_start: std::time::Instant,
) -> Result<AnalyzeResponse> {
    let (page_w, page_h) = img.dimensions();
    let source_lang = options.and_then(|o| o.source_lang.as_deref());
    let is_cjk = is_cjk_source(source_lang);
    let is_latin = is_latin_source(source_lang);

    // ONOMATOPOEIA FRAMES OMITTED PER USER REQUEST (ONLY BUBBLES AND TEXT REGIONS)
    let onomatopoeia: Vec<OnomatopoeiaFrame> = Vec::new();

    // =========================================================================
    // STAGE 2: CONTAINER CANDIDATE COLLECTION & READING ORDER SORT
    // =========================================================================
    let t_stage2_start = std::time::Instant::now();
    let mut candidate_boxes: Vec<Vec<[f32; 2]>> = Vec::new();
    let mut candidate_scores: Vec<f32> = Vec::new();

    // A. Use Detector-First Text and Free-Text Boxes if available (Koharu / RT-DETR)
    let is_detector_first = fusion_res.backend == "rfdetr-seg-2xl" || fusion_res.backend == "rtdetr-v2";
    if is_detector_first && (!fusion_res.text_bubbles.is_empty() || !fusion_res.text_free.is_empty()) {
        for (b, score) in &fusion_res.text_bubbles {
            // If this is a loose composite box enclosing 2 or more separate tighter subboxes, skip it
            let matching_subboxes_count = fusion_res.text_bubbles.iter().filter(|(sub_b, sub_score)| {
                *sub_score >= 0.45
                    && sub_b.x >= b.x - 10
                    && sub_b.y >= b.y - 10
                    && (sub_b.x + sub_b.w) <= (b.x + b.w + 10)
                    && (sub_b.y + sub_b.h) <= (b.y + b.h + 10)
                    && (sub_b.w * sub_b.h) < (b.w * b.h * 3 / 4)
            }).count();
            if matching_subboxes_count >= 2 {
                continue;
            }
            // If this is a horizontal single-line sub-box fragment completely enclosed inside a longer single-line box on the same row, skip the fragment
            let is_subfragment = (b.h <= 45) && fusion_res.text_bubbles.iter().any(|(parent_b, _)| {
                parent_b != b
                    && parent_b.h <= 45
                    && parent_b.w >= b.w + 40
                    && (b.y - parent_b.y).abs() <= 10
                    && (b.y + b.h - (parent_b.y + parent_b.h)).abs() <= 10
                    && b.x >= parent_b.x - 8
                    && (b.x + b.w) <= (parent_b.x + parent_b.w + 8)
            });
            if is_subfragment {
                continue;
            }
            candidate_boxes.push(vec![
                [b.x as f32, b.y as f32],
                [(b.x + b.w) as f32, b.y as f32],
                [(b.x + b.w) as f32, (b.y + b.h) as f32],
                [b.x as f32, (b.y + b.h) as f32],
            ]);
            candidate_scores.push(*score);
        }
        for (b, score) in &fusion_res.text_free {
            // Filter out oversized cover title / banner logo art (w >= 65% of canvas width && h >= 120px)
            if b.w as f32 >= (page_w as f32 * 0.65) && b.h >= 120 {
                continue;
            }
            candidate_boxes.push(vec![
                [b.x as f32, b.y as f32],
                [(b.x + b.w) as f32, b.y as f32],
                [(b.x + b.w) as f32, (b.y + b.h) as f32],
                [b.x as f32, (b.y + b.h) as f32],
            ]);
            candidate_scores.push(*score);
        }

        // FUSE HIGH-CONFIDENCE RAPIDOCR LINES: EXPAND NARROW SINGLE-LINE DETECTOR SLICES & PRESERVE MISSED LINES
        for line in &fusion_res.rapid_lines {
            if line.score < 0.50 {
                continue;
            }
            let (lx, ly, lw, lh) = crate::ml::geometry::polygon_bounds(&line.polygon);
            if (lw as f32) >= (page_w as f32 * 0.65) && lh >= 120 {
                continue;
            }
            let mut overlaps_any = false;
            for cb in &mut candidate_boxes {
                let (bx, by, bw, bh) = crate::ml::geometry::box_to_xywh_f32(cb);
                let ix = (bx + bw).min((lx + lw) as f32) - bx.max(lx as f32);
                let iy = (by + bh).min((ly + lh) as f32) - by.max(ly as f32);
                // For horizontal text paragraphs (bw >= bh * 1.15), extend downwards or upwards to catch immediate row continuations
                // (Only for multi-line paragraph continuation; do not merge single-line subtitles into large title headers where lh >= bh * 1.5, or across separate standalone single-line detector containers)
                let is_subtitle_to_title = bh <= 35.0 && (lh as f32) >= bh * 1.50;
                let is_separate_detector_box = (lw as f32) < bw * 1.5 && fusion_res.text_bubbles.iter().chain(fusion_res.text_free.iter()).any(|(tb, _)| {
                    let tb_iy = (tb.y + tb.h).min(ly + lh) - tb.y.max(ly);
                    let tb_ix = (tb.x + tb.w).min(lx + lw) - tb.x.max(lx);
                    tb_iy > 0 && tb_ix > 0 && (tb_ix * tb_iy) as f32 / (lw * lh).max(1) as f32 >= 0.50
                        && (tb.y as f32 >= by + bh || by as f32 >= (tb.y + tb.h) as f32)
                        && tb.h <= 40
                });
                let is_adjacent_trailing_row = !is_subtitle_to_title
                    && !is_separate_detector_box
                    && bw >= bh * 1.15
                    && (lx as f32 >= bx - 35.0)
                    && ((lx + lw) as f32 <= bx + bw + 35.0)
                    && (ly as f32 >= by + bh - 25.0)
                    && ((ly as f32) <= by + bh + 45.0)
                    && ix >= 0.35 * (lw as f32).min(bw);
                // Leading row check: merge upwards if a leading line is immediately above with high horizontal overlap
                let is_adjacent_leading_row = !is_subtitle_to_title
                    && !is_separate_detector_box
                    && (lx as f32 >= bx - 35.0)
                    && ((lx + lw) as f32 <= bx + bw + 35.0)
                    && ((ly + lh) as f32 >= by - 25.0)
                    && ((ly + lh) as f32 <= by + 20.0)
                    && (ix >= 0.35 * (lw as f32).min(bw) || (bx >= (lx as f32 - 35.0) && bx + bw <= (lx + lw) as f32 + 35.0));

                if (ix > 0.0 && iy > 0.0) || is_adjacent_trailing_row || is_adjacent_leading_row {
                    let inter_area = ix.max(0.0) * iy.max(0.0);
                    let l_area = (lw * lh).max(1) as f32;
                    let b_area = (bw * bh).max(1.0);
                    let coverage_l = inter_area / l_area;
                    let coverage_b = inter_area / b_area;
                    if (ix > 0.0 && iy > 0.0 && (coverage_l >= 0.25 || coverage_b >= 0.25)) || is_adjacent_trailing_row || is_adjacent_leading_row {
                        overlaps_any = true;
                        // IF DETECTOR BOX IS A PARTIAL SINGLE-LINE SLICE AND RAPID OCR DETECTED A LONGER SENTENCE ON THE SAME ROW
                        let is_horiz_single_line = iy >= 0.40 * bh.min(lh as f32) && bh <= (lh as f32 * 1.6) && (lw as f32 >= bw * 1.05 || ix >= 0.25 * bw.min(lw as f32));
                        let is_vert_single_line = ix >= 0.40 * bw.min(lw as f32) && bw <= (lw as f32 * 1.6) && (lh as f32 >= bh * 1.05 || iy >= 0.25 * bh.min(lh as f32));
                        // IF DETECTOR BOX COVERS MULTI-LINE TEXT BUT MISSES THE BOTTOM-MOST LINE
                        // GUARD: Do not expand into trailing pure-Latin OCR noise lines (e.g. clothing pattern HOSPITAL)
                        // when the source language is non-Latin (Korean/CJK) and the line has no native script.
                        let is_trailing_latin_noise = crate::ml::detect::is_non_latin_source(source_lang) && {
                            let lt = line.text.trim();
                            !crate::ml::detect::has_native_script_for_lang(lt, source_lang)
                                && lt.chars().all(|c| c.is_ascii_alphabetic() || c.is_whitespace() || c.is_ascii_punctuation())
                        };
                        let is_partial_vert_container = !is_subtitle_to_title
                            && !is_trailing_latin_noise
                            && (bw >= bh * 1.15)
                            && (lx as f32 >= bx - 35.0)
                            && ((lx + lw) as f32 <= bx + bw + 35.0)
                            && (ly as f32 >= by - 15.0)
                            && ((ly + lh) as f32 > by + bh)
                            && ((ly as f32) <= by + bh + 45.0);

                        if (is_horiz_single_line || is_vert_single_line || is_partial_vert_container || is_adjacent_trailing_row || is_adjacent_leading_row) && !is_trailing_latin_noise {
                            let union_x = bx.min(lx as f32);
                            let union_y = by.min(ly as f32);
                            let union_w = (bx + bw).max((lx + lw) as f32) - union_x;
                            let union_h = (by + bh).max((ly + lh) as f32) - union_y;
                            *cb = vec![
                                [union_x, union_y],
                                [union_x + union_w, union_y],
                                [union_x + union_w, union_y + union_h],
                                [union_x, union_y + union_h],
                            ];
                        }
                        break;
                    }
                }
            }
            if !overlaps_any {
                // DO NOT RESCUE LINE AS MISSED TEXT IF IT OVERLAPS DETECTED ONOMATOPOEIA (SFX)
                let overlaps_sfx = fusion_res.onomatopoeia.iter().any(|(sfx_b, score)| {
                    if *score < 0.20 {
                        return false;
                    }
                    let sx = sfx_b.x as f32;
                    let sy = sfx_b.y as f32;
                    let sw = sfx_b.w as f32;
                    let sh = sfx_b.h as f32;
                    let ix = (sx + sw).min((lx + lw) as f32) - sx.max(lx as f32);
                    let iy = (sy + sh).min((ly + lh) as f32) - sy.max(ly as f32);
                    if ix > 0.0 && iy > 0.0 {
                        let inter_area = ix * iy;
                        let l_area = (lw * lh).max(1) as f32;
                        let s_area = (sfx_b.w * sfx_b.h).max(1) as f32;
                        inter_area / l_area >= 0.20 || inter_area / s_area >= 0.20
                    } else {
                        false
                    }
                });

                if overlaps_sfx {
                    continue;
                }

                if (lw as f32) >= (page_w as f32 * 0.55) && lh >= 70 {
                    continue;
                }
                if lw <= 40 && lh <= 55 {
                    let has_cjk = crate::ml::detect::has_cjk_characters(&line.text);
                    if (!has_cjk && line.score < 0.85) || (has_cjk && line.score < 0.70) {
                        continue;
                    }
                }
                candidate_boxes.push(line.polygon.iter().map(|p| [p[0] as f32, p[1] as f32]).collect());
                candidate_scores.push(line.score);
            }
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
            backend: fusion_res.backend.clone(),
            onomatopoeia,
            regions: Vec::new(),
            stats: Some(stats),
        });
    }

    // Suppress spatial duplicate candidate boxes
    let (dedup_boxes, _) = deduplicate_boxes(&candidate_boxes, &candidate_scores, 0.40);
    let order = sort_regions_top_to_bottom(&dedup_boxes, page_h as usize, 0.5);
    let stage2_duration_ms = t_stage2_start.elapsed().as_secs_f64() * 1000.0;

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
        page_w,
        page_h,
        is_cjk,
        is_latin,
        source_lang,
        options.and_then(|o| o.inpaint_padding_pct),
        options.and_then(|o| o.typeset_padding_pct),
    );

    // Filter out low-confidence standalone single-character artwork artifacts (e.g. blush mark '红', conf < 0.58, w <= 35 && h <= 35)
    final_regions.retain(|r| {
        let t = r.text.trim();
        if t.chars().count() == 1 && r.confidence < 0.58 && (r.box_.w <= 35 && r.box_.h <= 35) {
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
        backend: fusion_res.backend.clone(),
        onomatopoeia,
        regions: final_regions,
        stats: Some(stats),
    })
}
