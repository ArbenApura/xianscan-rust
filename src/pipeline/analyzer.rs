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
    let allow_degraded_fallback = options.and_then(|o| o.allow_degraded_fallback).unwrap_or(false);

    // =========================================================================
    // STAGE 1: NEURAL LAYOUT ANALYSIS & OCR DETECTION
    // =========================================================================
    let fusion_res = fuse_detections(
        &mut engine.detector,
        &mut engine.ocr,
        img,
        source_lang,
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
    let cleaned_rapid_lines: Vec<crate::ml::ocr::OcrLine> = fusion_res
        .rapid_lines
        .iter()
        .map(|l| {
            let mut line = l.clone();
            let (cleaned_text, keep_ratio) = crate::ml::detect::strip_trailing_watermark_debris(&line.text, source_lang);
            if keep_ratio < 0.99 && keep_ratio > 0.10 {
                line.text = cleaned_text;
                if line.polygon.len() == 4 {
                    let p0x = line.polygon[0][0] as f32;
                    let p1x = line.polygon[1][0] as f32;
                    let p2x = line.polygon[2][0] as f32;
                    let p3x = line.polygon[3][0] as f32;
                    line.polygon[1][0] = (p0x + (p1x - p0x) * keep_ratio).round() as i32;
                    line.polygon[2][0] = (p3x + (p2x - p3x) * keep_ratio).round() as i32;
                }
            }
            line
        })
        .collect();
    // Filter out wide composite multi-line OCR blocks when fine-grained column lines exist
    let filtered_rapid_lines: Vec<&crate::ml::ocr::OcrLine> = cleaned_rapid_lines.iter().filter(|line| {
        if line.score < 0.50 {
            return false;
        }
        let (lx, ly, lw, lh) = crate::ml::geometry::polygon_bounds(&line.polygon);
        if (lw as f32) >= (page_w as f32 * 0.65) && lh >= 120 {
            return false;
        }
        if is_cjk && line.text.contains('\n') && (lw as f32) >= lh as f32 * 0.85 {
            let has_sub_lines = fusion_res.rapid_lines.iter().any(|other| {
                if std::ptr::eq(other, *line) || other.text.contains('\n') {
                    return false;
                }
                let (ox, oy, ow, oh) = crate::ml::geometry::polygon_bounds(&other.polygon);
                let is_vert = oh > (ow as f32 * 1.10) as i32;
                let inter_x = (lx + lw).min(ox + ow) - lx.max(ox);
                let inter_y = (ly + lh).min(oy + oh) - ly.max(oy);
                is_vert && inter_x > 0 && inter_y > 0 && (inter_x * inter_y) as f32 / (ow * oh).max(1) as f32 >= 0.70
            });
            if has_sub_lines {
                return false;
            }
        }
        if is_cjk && !line.text.contains('\n') && lw >= 180 {
            let matched_bubbles: Vec<&crate::ml::schemas::BoxRect> = fusion_res.text_bubbles.iter().filter_map(|(tb, tb_score)| {
                if *tb_score < 0.35 {
                    return None;
                }
                let inter_x = (tb.x + tb.w).min(lx + lw) - tb.x.max(lx);
                let inter_y = (tb.y + tb.h).min(ly + lh) - tb.y.max(ly);
                if inter_x >= (tb.w as f32 * 0.50) as i32 && inter_y >= 10 {
                    Some(tb)
                } else {
                    None
                }
            }).collect();
            if matched_bubbles.len() >= 2 {
                let tb1 = matched_bubbles[0];
                let tb2 = matched_bubbles[1];
                let horiz_dist = (tb1.x - tb2.x).abs();
                if horiz_dist >= 80 && (lw as f32) >= (tb1.w + tb2.w) as f32 * 0.80 {
                    return false;
                }
            }
        }
        true
    }).collect();

    // A. Use Detector-First Text and Free-Text Boxes if available (Koharu / RT-DETR)
    let is_detector_first = fusion_res.backend == "rfdetr-seg-2xl" || fusion_res.backend == "rtdetr-v2";
    if is_detector_first && (!fusion_res.text_bubbles.is_empty() || !fusion_res.text_free.is_empty()) {
        for (b, score) in &fusion_res.text_bubbles {
            let inside_any_bubble = fusion_res.bubbles.iter().any(|pb| {
                let ix = (pb.x + pb.w).min(b.x + b.w) - pb.x.max(b.x);
                let iy = (pb.y + pb.h).min(b.y + b.h) - pb.y.max(b.y);
                ix > 0 && iy > 0 && (ix * iy) as f32 / (b.w * b.h).max(1) as f32 >= 0.50
            });
            let is_giant_screen_prop = !inside_any_bubble && (b.h >= 300 && b.w >= 250) && *score < 0.35;
            if is_giant_screen_prop {
                continue;
            }
            let matching_subboxes_count = if inside_any_bubble {
                fusion_res.text_bubbles.iter().filter(|(sub_b, sub_score)| {
                    let is_distinct_col = (sub_b.x >= b.x + b.w * 2 / 5) || (sub_b.x + sub_b.w <= b.x + b.w * 3 / 5);
                    let is_distinct_row = (sub_b.y >= b.y + b.h / 3) || (sub_b.y + sub_b.h <= b.y + b.h * 2 / 3);
                    *sub_score >= 0.35
                        && (is_distinct_col || is_distinct_row)
                        && sub_b.x >= b.x - 20
                        && sub_b.y >= b.y - 20
                        && (sub_b.x + sub_b.w) <= (b.x + b.w + 20)
                        && (sub_b.y + sub_b.h) <= (b.y + b.h + 20)
                        && (sub_b.w * sub_b.h) < (b.w * b.h * 9 / 10)
                }).count()
            } else {
                0
            };
            if matching_subboxes_count >= 2 {
                continue;
            }
            // IF THIS IS A HORIZONTAL SINGLE-LINE SUB-BOX FRAGMENT COMPLETELY ENCLOSED INSIDE A LONGER SINGLE-LINE BOX ON THE SAME ROW, SKIP THE FRAGMENT
            let is_subfragment = (b.h <= 45) && fusion_res.text_bubbles.iter().any(|(parent_b, _)| {
                parent_b != b
                    && parent_b.h <= 45
                    && parent_b.w >= b.w + 40
                    && (b.y - parent_b.y).abs() <= 10
                    && (b.y + b.h - (parent_b.y + parent_b.h)).abs() <= 10
                    && b.x >= parent_b.x - 8
                    && (b.x + b.w) <= (parent_b.x + parent_b.w + 8)
            });

            // IF THIS IS A PARTIAL VERTICAL SUB-BOX INSIDE A TALLER MULTI-LINE CONTAINER ON THE SAME COLUMN (WITHOUT MULTI-COLUMN SPLITS), SKIP THE PARTIAL SUB-BOX
            let is_vertical_subbox_redundancy = fusion_res.text_bubbles.iter().any(|(parent_b, parent_score)| {
                let parent_is_composite = fusion_res.text_bubbles.iter().filter(|(sub_b, sub_score)| {
                    let is_distinct_col = (sub_b.x >= parent_b.x + parent_b.w * 2 / 5) || (sub_b.x + sub_b.w <= parent_b.x + parent_b.w * 3 / 5);
                    let is_distinct_row = (sub_b.y >= parent_b.y + parent_b.h / 3) || (sub_b.y + sub_b.h <= parent_b.y + parent_b.h * 2 / 3);
                    let is_parent_bubble = fusion_res.bubbles.iter().any(|pb| {
                        let ix = (pb.x + pb.w).min(parent_b.x + parent_b.w) - pb.x.max(parent_b.x);
                        let iy = (pb.y + pb.h).min(parent_b.y + parent_b.h) - pb.y.max(parent_b.y);
                        ix > 0 && iy > 0 && (ix * iy) as f32 / (parent_b.w * parent_b.h).max(1) as f32 >= 0.50
                    });
                    let is_bubble_split = is_parent_bubble && *sub_score >= 0.35 && (is_distinct_col || is_distinct_row);
                    (is_bubble_split || (*sub_score >= 0.40 && (is_distinct_col || is_distinct_row)))
                        && sub_b.x >= parent_b.x - 20
                        && sub_b.y >= parent_b.y - 20
                        && (sub_b.x + sub_b.w) <= (parent_b.x + parent_b.w + 20)
                        && (sub_b.y + sub_b.h) <= (parent_b.y + parent_b.h + 20)
                        && (sub_b.w * sub_b.h) < (parent_b.w * parent_b.h * 9 / 10)
                }).count() >= 2;

                let is_distinct_side_column = (parent_b.w as f32) >= b.w as f32 * 1.4 && ((b.x + b.w <= parent_b.x + parent_b.w * 3 / 5) || (b.x >= parent_b.x + parent_b.w * 2 / 5));

                !parent_is_composite
                    && !is_distinct_side_column
                    && parent_b != b
                    && *score <= *parent_score + 0.10
                    && parent_b.h >= b.h + 15
                    && (b.x - parent_b.x).abs() <= 50
                    && (b.x + b.w - (parent_b.x + parent_b.w)).abs() <= 50
                    && b.y >= parent_b.y - 15
                    && (b.y + b.h) <= (parent_b.y + parent_b.h + 20)
            });
            // IF THIS IS A REDUNDANT PARTIAL ROW/SUB-CONTAINER (H <= 100) COVERED BY A TALLER NARRATION/BUBBLE CONTAINER
            let is_shorter_overlap_redundancy = (b.h <= 100)
                && fusion_res.text_bubbles.iter().any(|(parent_b, parent_score)| {
                    let parent_is_composite = fusion_res.text_bubbles.iter().filter(|(sub_b, sub_score)| {
                        let is_distinct_col = (sub_b.x >= parent_b.x + parent_b.w / 2) || (sub_b.x + sub_b.w <= parent_b.x + parent_b.w / 2);
                        let is_distinct_row = (sub_b.y >= parent_b.y + parent_b.h / 3) || (sub_b.y + sub_b.h <= parent_b.y + parent_b.h * 2 / 3);
                        (*sub_score >= 0.25 || (*sub_score >= 0.45 && (is_distinct_col || is_distinct_row)))
                            && sub_b.x >= parent_b.x - 20
                            && sub_b.y >= parent_b.y - 20
                            && (sub_b.x + sub_b.w) <= (parent_b.x + parent_b.w + 20)
                            && (sub_b.y + sub_b.h) <= (parent_b.y + parent_b.h + 20)
                            && (sub_b.w * sub_b.h) < (parent_b.w * parent_b.h * 9 / 10)
                    }).count() >= 2;

                    !parent_is_composite
                        && parent_b != b
                        && *score <= *parent_score + 0.30
                        && parent_b.h >= b.h + 10
                        && ((b.x + b.w).min(parent_b.x + parent_b.w) - b.x.max(parent_b.x)).max(0) as f32 / (b.w as f32) >= 0.50
                        && ((b.y + b.h).min(parent_b.y + parent_b.h) - b.y.max(parent_b.y)).max(0) as f32 / (b.h as f32) >= 0.70
                });

            // IF THIS IS A LOW-CONFIDENCE OVERSIZED VERTICAL EXPANSION (H >= 1.4 * COMPACT_H) EXTENDING INTO EMPTY BUBBLE SPACE WHILE A HIGH-CONFIDENCE COMPACT BOX EXISTS
            let is_oversized_empty_expansion = fusion_res.text_bubbles.iter().any(|(compact_b, compact_score)| {
                compact_b != b
                    && *compact_score >= *score + 0.20
                    && b.h >= (compact_b.h as f32 * 1.35) as i32
                    && (b.x - compact_b.x).abs() <= 35
                    && (b.x + b.w - (compact_b.x + compact_b.w)).abs() <= 35
                    && (b.y - compact_b.y).abs() <= 25
                    && (b.y + b.h) >= (compact_b.y + compact_b.h + 40)
            });

            if is_subfragment || is_vertical_subbox_redundancy || is_shorter_overlap_redundancy || is_oversized_empty_expansion {
                continue;
            }

            // IF THIS CANDIDATE OVERLAPS DETECTED ONOMATOPOEIA (SFX) WITH HIGHER OR COMPARABLE SCORE, SKIP IT
            // GUARD: If this text_bubble sits securely inside an actual speech bubble container, do not drop it (spiky bubbles often trigger onomatopoeia detectors)
            let is_inside_bubble = fusion_res.bubbles.iter().any(|pb| {
                let ix = (pb.x + pb.w).min(b.x + b.w) - pb.x.max(b.x);
                let iy = (pb.y + pb.h).min(b.y + b.h) - pb.y.max(b.y);
                ix > 0 && iy > 0 && (ix * iy) as f32 / (b.w * b.h).max(1) as f32 >= 0.50
            });
            let overlaps_sfx = !is_inside_bubble && fusion_res.onomatopoeia.iter().any(|(sfx_b, sfx_score)| {
                if *sfx_score < 0.25 {
                    return false;
                }
                let ix = (sfx_b.x + sfx_b.w).min(b.x + b.w) - sfx_b.x.max(b.x);
                let iy = (sfx_b.y + sfx_b.h).min(b.y + b.h) - sfx_b.y.max(b.y);
                if ix > 0 && iy > 0 {
                    let inter_area = (ix * iy) as f32;
                    let b_area = (b.w * b.h).max(1) as f32;
                    inter_area / b_area >= 0.50 && *sfx_score >= *score - 0.10
                } else {
                    false
                }
            });
            if overlaps_sfx {
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
        for line in &filtered_rapid_lines {
            let (lx, ly, lw, lh) = crate::ml::geometry::polygon_bounds(&line.polygon);
            let mut overlaps_any = false;
            for cb in &mut candidate_boxes {
                let (bx, by, bw, bh) = crate::ml::geometry::box_to_xywh_f32(cb);
                let ix = (bx + bw).min((lx + lw) as f32) - bx.max(lx as f32);
                let iy = (by + bh).min((ly + lh) as f32) - by.max(ly as f32);
                // For horizontal text paragraphs (bw >= bh * 1.15), extend downwards or upwards to catch immediate row continuations
                // (Only for multi-line paragraph continuation; do not merge single-line subtitles into large title headers where lh >= bh * 1.5, or across separate standalone single-line detector containers)
                let is_subtitle_to_title = bh <= 35.0 && (lh as f32) >= bh * 1.50;
                let is_separate_detector_box = fusion_res.text_bubbles.iter().chain(fusion_res.text_free.iter()).any(|(tb, _)| {
                    let is_different_box = (tb.x - bx as i32).abs() > 15 || (tb.y - by as i32).abs() > 15;
                    if !is_different_box {
                        return false;
                    }
                    let tb_iy = (tb.y + tb.h).min(ly + lh) - tb.y.max(ly);
                    let tb_ix = (tb.x + tb.w).min(lx + lw) - tb.x.max(lx);
                    tb_iy > 0 && tb_ix > 0 && (tb_ix * tb_iy) as f32 / (lw * lh).max(1) as f32 >= 0.40
                        && ((tb.y as f32 >= by + bh - 10.0 || by as f32 >= (tb.y + tb.h) as f32 - 10.0) || ((tb.x as f32 >= bx + bw - 10.0 || bx as f32 >= (tb.x + tb.w) as f32 - 10.0)))
                });
                let parent_bubble = fusion_res.bubbles.iter().find(|b| {
                    let ix = (bx + bw).min((b.x + b.w) as f32) - bx.max(b.x as f32);
                    let iy = (by + bh).min((b.y + b.h) as f32) - by.max(b.y as f32);
                    ix > 0.0 && iy > 0.0 && (ix * iy) / (bw * bh).max(1.0) >= 0.50
                });
                let leaks_outside_bubble = if let Some(pb) = parent_bubble {
                    (ly + lh) as f32 > (pb.y + pb.h + 15) as f32 || (ly as f32) < (pb.y - 15) as f32
                } else {
                    false
                };

                let is_distinct_rank_line = (bh <= 35.0 || (lh as f32) <= 35.0)
                    && (line.text.trim().ends_with("弟子") || line.text.trim().ends_with("阶") || line.text.trim().ends_with("级") || line.text.trim().ends_with("层") || line.text.trim().ends_with("段") || line.text.trim().ends_with("境") || line.text.trim().ends_with("部"))
                    && (ly as f32 >= by + bh + 10.0);
                let is_tabular_line = crate::ml::detect::is_repetitive_tabular_text(&line.text) || crate::ml::detect::is_standalone_table_cell(&line.text);
                let is_adjacent_trailing_row = !is_subtitle_to_title
                    && !is_separate_detector_box
                    && !is_distinct_rank_line
                    && !is_tabular_line
                    && !leaks_outside_bubble
                    && bw >= bh * 1.15
                    && (lx as f32 >= bx - 35.0)
                    && ((lx + lw) as f32 <= bx + bw + 35.0)
                    && (ly as f32 >= by + bh - 25.0)
                    && ((ly as f32) <= by + bh + 45.0)
                    && ix >= 0.35 * (lw as f32).min(bw);
                // Leading row check: merge upwards if a leading line is immediately above with high horizontal overlap
                let is_adjacent_leading_row = !is_subtitle_to_title
                    && !is_separate_detector_box
                    && !is_tabular_line
                    && !leaks_outside_bubble
                    && (lx as f32 >= bx - 35.0 && (lx + lw) as f32 <= bx + bw + 35.0)
                    && ((ly + lh) as f32 >= by - 25.0)
                    && ((ly + lh) as f32 <= by + 20.0)
                    && (ix >= 0.50 * (lw as f32).min(bw));

                if (ix > 0.0 && iy > 0.0) || is_adjacent_trailing_row || is_adjacent_leading_row {
                    let inter_area = ix.max(0.0) * iy.max(0.0);
                    let l_area = (lw * lh).max(1) as f32;
                    let b_area = (bw * bh).max(1.0);
                    let coverage_l = inter_area / l_area;
                    let coverage_b = inter_area / b_area;
                    // Do not fuse an unassigned multi-line line if it is much wider than a vertical detector box and extends far outside
                    let is_cross_panel_sfx_bleed = (bh > bw * 1.5) && ((lw as f32) > bw * 2.0) && ((lx as f32) < bx - 30.0 || ((lx + lw) as f32) > bx + bw + 30.0);
                    let overlaps_multiple_distinct_text_bubbles = {
                        let matching_bubbles: Vec<&crate::ml::schemas::BoxRect> = fusion_res.text_bubbles.iter().filter_map(|(tb, tb_score)| {
                            if *tb_score < 0.35 {
                                return None;
                            }
                            let inter_x = (tb.x + tb.w).min(lx + lw) - tb.x.max(lx);
                            let inter_y = (tb.y + tb.h).min(ly + lh) - tb.y.max(ly);
                            if inter_x >= 20 && inter_y >= 10 {
                                Some(tb)
                            } else {
                                None
                            }
                        }).collect();
                        if matching_bubbles.len() >= 2 {
                            let b1 = matching_bubbles[0];
                            let b2 = matching_bubbles[1];
                            (b1.x - b2.x).abs() >= 40 || (b1.y - b2.y).abs() >= 40
                        } else {
                            false
                        }
                    };
                    let char_count = line.text.chars().filter(|c| !c.is_whitespace()).count();
                    let is_giant_calligraphy_to_body = is_cjk && (lh as f32 >= 120.0 || (lw as f32 >= 350.0 && lh as f32 >= 80.0)) && char_count <= 4 && bh <= 200.0;
                    if !is_cross_panel_sfx_bleed && !is_giant_calligraphy_to_body && ((ix > 0.0 && iy > 0.0 && (coverage_l >= 0.25 || coverage_b >= 0.25)) || is_adjacent_trailing_row || is_adjacent_leading_row) {
                        overlaps_any = true;
                        if overlaps_multiple_distinct_text_bubbles {
                            continue;
                        }
                        // IF DETECTOR BOX IS A PARTIAL SINGLE-LINE SLICE AND RAPID OCR DETECTED A LONGER SENTENCE ON THE SAME ROW
                        let is_horiz_single_line = (bh <= 45.0 || (lh as f32) <= 45.0) && iy >= 0.40 * bh.min(lh as f32) && bh <= (lh as f32 * 1.6) && (lw as f32 >= bw * 1.05 || ix >= 0.25 * bw.min(lw as f32));
                        let is_vert_single_line = ix >= 0.40 * bw.min(lw as f32) && bw <= (lw as f32 * 1.6) && (lh as f32 >= bh * 1.05 || iy >= 0.25 * bh.min(lh as f32));
                        // IF DETECTOR BOX COVERS MULTI-LINE TEXT BUT MISSES THE BOTTOM-MOST LINE OR TOP-MOST EXTENSION
                        // GUARD: Do not expand into trailing pure-Latin OCR noise lines (e.g. clothing pattern HOSPITAL)
                        // when the source language is non-Latin (Korean/CJK) and the line has no native script.
                        let is_trailing_latin_noise = crate::ml::detect::is_non_latin_source(source_lang) && {
                            let lt = line.text.trim();
                            !crate::ml::detect::has_native_script_for_lang(lt, source_lang)
                                && lt.chars().all(|c| c.is_ascii_alphabetic() || c.is_whitespace() || c.is_ascii_punctuation())
                        };
                        let is_partial_vert_container = !is_subtitle_to_title
                            && !is_trailing_latin_noise
                            && !leaks_outside_bubble
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
                        inter_area / l_area >= 0.15 || inter_area / s_area >= 0.15
                    } else {
                        // Proximity check to onomatopoeia box
                        let dx = (sx - (lx + lw) as f32).max((lx as f32) - (sx + sw)).max(0.0);
                        let dy = (sy - (ly + lh) as f32).max((ly as f32) - (sy + sh)).max(0.0);
                        dx <= 20.0 && dy <= 20.0 && (crate::ml::detect::is_onomatopoeia_or_shout(&line.text) || line.text.chars().count() <= 2)
                    }
                });

                if overlaps_sfx {
                    continue;
                }

                if (lw as f32) >= (page_w as f32 * 0.55) && lh >= 70 {
                    continue;
                }

                // DO NOT RESCUE REPETITIVE TABULAR DATA, CHAPTER METRICS, OR STANDALONE TABLE CELL COUNTERS
                if crate::ml::detect::is_repetitive_tabular_text(&line.text) || crate::ml::detect::is_standalone_table_cell(&line.text) {
                    continue;
                }

                // LAYOUT-ANCHORED RESCUE: CHECK IF THE OCR LINE IS ADJACENT TO ANY CONFIDENT DETECTED LAYOUT BOX (BUBBLE OR TEXT CANDIDATE)
                let is_near_layout_anchor = fusion_res.bubbles.iter().chain(fusion_res.text_bubbles.iter().filter(|(_, s)| *s >= 0.40).map(|(b, _)| b)).chain(fusion_res.text_free.iter().filter(|(_, s)| *s >= 0.40).map(|(b, _)| b)).any(|b| {
                    let (bx, by, bw, bh) = (b.x as f32, b.y as f32, b.w as f32, b.h as f32);
                    let dx = (bx - (lx + lw) as f32).max((lx as f32) - (bx + bw)).max(0.0);
                    let dy = (by - (ly + lh) as f32).max((ly as f32) - (by + bh)).max(0.0);
                    dx <= 35.0 && dy <= 35.0
                });

                // DO NOT RESCUE UNASSIGNED OCR LINES ON NON-BUBBLE BACKGROUND IF THEY LIE INSIDE A PANEL ALREADY CONTAINING DETECTED SPEECH BUBBLES
                let inside_bubble_panel = fusion_res.panels.iter().any(|p| {
                    let (px, py, pw, ph) = (p.x as f32, p.y as f32, p.w as f32, p.h as f32);
                    let line_in_p = (lx as f32) >= px - 15.0 && ((lx + lw) as f32) <= (px + pw + 15.0) && (ly as f32) >= py - 15.0 && ((ly + lh) as f32) <= (py + ph + 15.0);
                    if line_in_p {
                        fusion_res.bubbles.iter().any(|b| {
                            let (bx, by, bw, bh) = (b.x as f32, b.y as f32, b.w as f32, b.h as f32);
                            let inter_x = (bx + bw).min(px + pw) - bx.max(px);
                            let inter_y = (by + bh).min(py + ph) - by.max(py);
                            inter_x > 0.0 && inter_y > 0.0
                        })
                    } else {
                        false
                    }
                });
                if inside_bubble_panel && !is_near_layout_anchor {
                    let is_native = crate::ml::detect::has_native_script_for_lang(&line.text, source_lang);
                    if !is_native || line.text.chars().filter(|c| !c.is_whitespace()).count() < 2 || line.score < 0.70 {
                        continue;
                    }
                }

                // DO NOT RESCUE VERTICAL FURIGANA / RUBY SATELLITE LINES (NARROW ADJACENT OCR SLICES ALONGSIDE PRIMARY CANDIDATE BOXES)
                let is_furigana_satellite = is_cjk && line.text.chars().count() <= 5 && candidate_boxes.iter().any(|cb| {
                    let (bx, by, bw, bh) = crate::ml::geometry::box_to_xywh_f32(cb);
                    let overlap_y = ((ly + lh) as f32).min(by + bh) - (ly as f32).max(by);
                    let vert_coverage = overlap_y.max(0.0) / (lh as f32).max(1.0);
                    let horiz_gap = if (lx as f32) >= bx + bw {
                        (lx as f32) - (bx + bw)
                    } else if bx >= (lx + lw) as f32 {
                        bx - (lx + lw) as f32
                    } else {
                        0.0
                    };
                    let is_narrow = (lw as f32) <= bw * 0.40;
                    let is_vert_col = lh > lw * 2;
                    let is_close_x = horiz_gap <= bw * 0.35;
                    is_vert_col && is_narrow && is_close_x && vert_coverage >= 0.70 && bh >= (lh as f32 * 1.5)
                });
                if is_furigana_satellite {
                    continue;
                }

                // IN NON-LATIN / CJK COMICS, DO NOT RESCUE ISOLATED LATIN NOISE / CLOTHING CREASES / STRAY DIGITS OUTSIDE SPEECH BUBBLES
                let is_non_latin = crate::ml::detect::is_non_latin_source(source_lang);
                let lacks_native = !crate::ml::detect::has_native_script_for_lang(&line.text, source_lang);
                let is_punct = line.text.chars().any(|c| matches!(c, '！' | '？' | '!' | '?' | '…' | '·' | '—' | '～' | '¿' | '¡'));
                let is_isolated_latin_or_digit = is_non_latin && lacks_native && !is_punct && line.text.chars().count() <= 3 && !crate::ml::detect::is_onomatopoeia_or_shout(&line.text);
                if is_isolated_latin_or_digit {
                    continue;
                }

                // IF NOT NEAR ANY LAYOUT DETECTION, ONLY RESCUE HIGH-CONFIDENCE NATIVE SCRIPT ON CLEAN GUTTER OR TITLE NARRATION
                let has_any_layout = !fusion_res.bubbles.is_empty() || !fusion_res.text_bubbles.is_empty() || !fusion_res.text_free.is_empty();
                if has_any_layout && !is_near_layout_anchor {
                    // Check if background is dark/artwork
                    let is_native = match source_lang {
                        Some(lang) if crate::ml::detect::is_non_latin_source(Some(lang)) => {
                            crate::ml::detect::has_native_script_for_lang(&line.text, Some(lang))
                        }
                        _ => true,
                    };
                    if !is_native || line.score < 0.75 || line.text.chars().filter(|c| !c.is_whitespace()).count() <= 4 {
                        continue;
                    }
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
            if line.score < 0.50 {
                continue;
            }
            let (lx, ly, lw, lh) = crate::ml::geometry::polygon_bounds(&line.polygon);
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
    let order = sort_regions_top_to_bottom(&dedup_boxes, page_h as usize, 0.5, source_lang);
    let stage2_duration_ms = t_stage2_start.elapsed().as_secs_f64() * 1000.0;

    // =========================================================================
    // STAGE 3: TARGETED TEXT RECOGNITION & REGION MASKING
    // =========================================================================
    let t_stage3_start = std::time::Instant::now();
    let split_clean_lines: Vec<crate::ml::ocr::OcrLine> = filtered_rapid_lines.into_iter().cloned().collect();
    let mut final_regions = build_regions(
        &mut engine.ocr,
        img,
        &dedup_boxes,
        &order,
        &split_clean_lines,
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
