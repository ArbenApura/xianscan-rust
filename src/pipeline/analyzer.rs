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
use super::region_builder::{build_regions, extract_dark_bubble_envelope, extract_white_bubble_envelope};

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

fn check_composite_subboxes<'a>(
    parent_b: &crate::ml::schemas::BoxRect,
    candidates: impl Iterator<Item = (&'a crate::ml::schemas::BoxRect, f32)>,
    is_bubble: bool,
) -> bool {
    let subboxes: Vec<&crate::ml::schemas::BoxRect> = candidates
        .filter_map(|(sub_b, sub_score)| {
            if sub_b == parent_b {
                return None;
            }
            let is_distinct_col = (sub_b.x >= parent_b.x + parent_b.w * 2 / 5) || (sub_b.x + sub_b.w <= parent_b.x + parent_b.w * 3 / 5);
            let is_distinct_row = (sub_b.y >= parent_b.y + parent_b.h / 3) || (sub_b.y + sub_b.h <= parent_b.y + parent_b.h * 2 / 3);
            let min_score = if is_bubble { 0.35 } else { 0.40 };
            if sub_score >= min_score
                && (is_distinct_col || is_distinct_row)
                && sub_b.x >= parent_b.x - 20
                && sub_b.y >= parent_b.y - 20
                && (sub_b.x + sub_b.w) <= (parent_b.x + parent_b.w + 20)
                && (sub_b.y + sub_b.h) <= (parent_b.y + parent_b.h + 20)
                && (sub_b.w * sub_b.h) < (parent_b.w * parent_b.h * 9 / 10)
            {
                Some(sub_b)
            } else {
                None
            }
        })
        .collect();

    if subboxes.len() < 2 {
        return false;
    }

    // CHECK IF AT LEAST TWO SUBBOXES ARE GENUINELY SEPARATED (EITHER HORIZONTALLY SEPARATED COLUMNS OR VERTICALLY SEPARATED LOBES WITH GAP >= 25PX OR BOTH MULTI-LINE LOBES)
    for i in 0..subboxes.len() {
        for j in (i + 1)..subboxes.len() {
            let s1 = subboxes[i];
            let s2 = subboxes[j];
            let both_substantial = s1.w >= 35 && s1.h >= 30 && s2.w >= 35 && s2.h >= 30;
            if !both_substantial {
                continue;
            }
            let vert_overlap = (s1.y + s1.h).min(s2.y + s2.h) - s1.y.max(s2.y);
            let min_h = s1.h.min(s2.h);
            let on_same_horizontal_row = vert_overlap > 0 && (vert_overlap as f32 / min_h as f32 >= 0.50);

            let is_vert_tbrl_column = s1.h >= (s1.w as f32 * 1.15) as i32 && s2.h >= (s2.w as f32 * 1.15) as i32;
            let horiz_gap = if s2.x >= s1.x + s1.w { s2.x - (s1.x + s1.w) } else if s1.x >= s2.x + s2.w { s1.x - (s2.x + s2.w) } else { 0 };
            let horiz_sep = (is_vert_tbrl_column && (s1.x + s1.w <= s2.x + 10 || s2.x + s2.w <= s1.x + 10))
                || (!on_same_horizontal_row && horiz_gap >= 35);
            let center_stagger = !on_same_horizontal_row && ((s1.x + s1.w / 2) - (s2.x + s2.w / 2)).abs() >= 65;
            let vert_gap_sep = s2.y >= s1.y + s1.h + 25 || s1.y >= s2.y + s2.h + 25;
            let lobe_offset = ((s1.x + s1.w / 2) - (s2.x + s2.w / 2)).abs() >= 25 || (s1.x - s2.x).abs() >= 20;
            let both_multiline_distinct_lobes = s1.h >= 50 && s2.h >= 50 && lobe_offset && (s2.y >= s1.y + s1.h || s1.y >= s2.y + s2.h);
            if horiz_sep || center_stagger || vert_gap_sep || both_multiline_distinct_lobes {
                return true;
            }
        }
    }
    false
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
            let (lead_cleaned, start_ratio) = crate::ml::detect::strip_leading_watermark_debris(&line.text, source_lang);
            let (trail_cleaned, keep_ratio) = crate::ml::detect::strip_trailing_watermark_debris(&lead_cleaned, source_lang);
            let was_multiline = line.text.contains('\n');
            let has_change = start_ratio > 0.01 || keep_ratio < 0.99;
            if has_change && keep_ratio > 0.10 {
                line.text = trail_cleaned;
                if line.polygon.len() == 4 {
                    if was_multiline {
                        let p0y = line.polygon[0][1] as f32;
                        let p1y = line.polygon[1][1] as f32;
                        let p2y = line.polygon[2][1] as f32;
                        let p3y = line.polygon[3][1] as f32;
                        let orig_h_left = p3y - p0y;
                        let orig_h_right = p2y - p1y;
                        line.polygon[0][1] = (p0y + orig_h_left * start_ratio).round() as i32;
                        line.polygon[1][1] = (p1y + orig_h_right * start_ratio).round() as i32;
                        line.polygon[2][1] = (p1y + orig_h_right * (start_ratio + (1.0 - start_ratio) * keep_ratio)).round() as i32;
                        line.polygon[3][1] = (p0y + orig_h_left * (start_ratio + (1.0 - start_ratio) * keep_ratio)).round() as i32;
                    } else {
                        let p0x = line.polygon[0][0] as f32;
                        let p1x = line.polygon[1][0] as f32;
                        let p2x = line.polygon[2][0] as f32;
                        let p3x = line.polygon[3][0] as f32;
                        let orig_w_top = p1x - p0x;
                        let orig_w_bot = p2x - p3x;
                        line.polygon[0][0] = (p0x + orig_w_top * start_ratio).round() as i32;
                        line.polygon[1][0] = (p0x + orig_w_top * (start_ratio + (1.0 - start_ratio) * keep_ratio)).round() as i32;
                        line.polygon[2][0] = (p3x + orig_w_bot * (start_ratio + (1.0 - start_ratio) * keep_ratio)).round() as i32;
                        line.polygon[3][0] = (p3x + orig_w_bot * start_ratio).round() as i32;
                    }
                }
            }
            line
        })
        .collect();

    let filtered_rapid_lines: Vec<&crate::ml::ocr::OcrLine> = cleaned_rapid_lines.iter().filter(|line| {
        if line.score < 0.50 {
            return false;
        }
        let t = line.text.trim();
        // DROP WATERMARK RESIDUE AND SCANLATOR WATERMARK LINES
        if crate::ml::detect::is_watermark_line(t) || crate::ml::detect::is_pure_watermark_region(t) {
            return false;
        }
        let (lx, ly, lw, lh) = crate::ml::geometry::polygon_bounds(&line.polygon);
        let char_count = line.text.chars().filter(|c| !c.is_whitespace()).count();
        let is_sentence_dialogue = crate::ml::detect::has_native_script_for_lang(&line.text, source_lang)
            && char_count >= 4
            && !crate::ml::detect::is_onomatopoeia_or_shout(&line.text);
        if !is_sentence_dialogue && (lw as f32) >= (page_w as f32 * 0.65) && lh >= 120 {
            return false;
        }
        if is_cjk && line.text.contains('\n') {
            let has_sub_lines = cleaned_rapid_lines.iter().any(|other| {
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
                let has_enclosing_box = matched_bubbles.iter().any(|b| {
                    (b.w as f32) >= (lw as f32 * 0.75) && (b.x - lx).abs() <= 35
                });
                if !has_enclosing_box {
                    let tb1 = matched_bubbles[0];
                    let tb2 = matched_bubbles[1];
                    let vert_overlap = (tb1.y + tb1.h).min(tb2.y + tb2.h) - tb1.y.max(tb2.y);
                    let min_h = tb1.h.min(tb2.h);
                    let on_same_horizontal_row = vert_overlap > 0 && (vert_overlap as f32 / min_h as f32 >= 0.50);

                    let both_in_same_bubble = fusion_res.bubbles.iter().any(|pb| {
                        let in_b1 = tb1.x >= pb.x - 10 && tb1.y >= pb.y - 10 && (tb1.x + tb1.w) <= pb.x + pb.w + 10 && (tb1.y + tb1.h) <= pb.y + pb.h + 10;
                        let in_b2 = tb2.x >= pb.x - 10 && tb2.y >= pb.y - 10 && (tb2.x + tb2.w) <= pb.x + pb.w + 10 && (tb2.y + tb2.h) <= pb.y + pb.h + 10;
                        in_b1 && in_b2
                    });
                    let is_vert_tbrl_column = tb1.h >= (tb1.w as f32 * 1.15) as i32 && tb2.h >= (tb2.w as f32 * 1.15) as i32;
                    let are_horiz_disjoint = (is_vert_tbrl_column && (tb1.x + tb1.w <= tb2.x + 15 || tb2.x + tb2.w <= tb1.x + 15))
                        || (!on_same_horizontal_row && (tb1.x + tb1.w <= tb2.x + 15 || tb2.x + tb2.w <= tb1.x + 15));
                    if !both_in_same_bubble || are_horiz_disjoint {
                        let horiz_dist = (tb1.x - tb2.x).abs();
                        let both_substantial = tb1.w >= 45 && tb1.h >= 35 && tb2.w >= 45 && tb2.h >= 35;
                        if both_substantial && horiz_dist >= 80 && (lw as f32) >= (tb1.w + tb2.w) as f32 * 0.80 {
                            return false;
                        }
                    }
                }
            }
        }
        if is_cjk {
            // FILTER OVEREXTENDED DILATED DUPLICATE LINES (E.G. DILATED ACROSS HAIR OR BACKGROUND ART)
            let is_dilated_duplicate = cleaned_rapid_lines.iter().any(|other| {
                if std::ptr::eq(other, *line) {
                    return false;
                }
                let (_ox, oy, ow, oh) = crate::ml::geometry::polygon_bounds(&other.polygon);
                let iy = ((ly + lh).min(oy + oh) - ly.max(oy)).max(0);
                let vert_overlap = iy as f32 / lh.min(oh).max(1) as f32;
                if vert_overlap < 0.60 {
                    return false;
                }
                let t_line = line.text.trim();
                let t_other = other.text.trim();
                let same_text = t_line == t_other || (!t_line.is_empty() && (t_line.ends_with(t_other) || t_other.ends_with(t_line)));
                same_text && (lw as f32) >= (ow as f32 * 1.50) && lw >= 180 && (line.score <= other.score || (lw as f32) >= (ow as f32 * 2.0))
            });
            if is_dilated_duplicate {
                return false;
            }
        }
        true
    }).collect();

    // DETECT AND ADD MISSED DARK OR INVERTED SPEECH BUBBLE CONTAINERS (CHINESE COMICS)
    let is_zh = matches!(source_lang, Some("zh_hans") | Some("zh_hant") | Some("zh-Hans") | Some("zh-Hant"));
    let mut effective_bubbles: Vec<crate::ml::schemas::BoxRect> = fusion_res.bubbles.clone();
    let mut effective_text_bubbles: Vec<(crate::ml::schemas::BoxRect, f32)> = fusion_res.text_bubbles.clone();

    // MERGE HORIZONTAL PROLONGED DASH SHOUT CANDIDATE BOXES (E.G. '醉——————————哥！')
    // WHEN A WIDE SPEECH BALLOON CONTAINS A HORIZONTAL PROLONGED DASH, DETECTORS OFTEN PREDICT
    // DISJOINT BOXES ON THE LEFT PREFIX WORD AND RIGHT SUFFIX WORD WITH AN INTERVENING STROKE GAP.
    if is_zh && effective_text_bubbles.len() >= 2 {
        let mut merged_indices = std::collections::HashSet::new();
        let mut new_merged_boxes = Vec::new();
        let rgb_img = img.to_rgb8();

        for i in 0..effective_text_bubbles.len() {
            if merged_indices.contains(&i) {
                continue;
            }
            let (tb1, s1) = &effective_text_bubbles[i];
            for j in (i + 1)..effective_text_bubbles.len() {
                if merged_indices.contains(&j) {
                    continue;
                }
                let (tb2, s2) = &effective_text_bubbles[j];

                // MUST BE ON THE SAME HORIZONTAL ROW
                let vert_overlap = (tb1.y + tb1.h).min(tb2.y + tb2.h) - tb1.y.max(tb2.y);
                let min_h = tb1.h.min(tb2.h);
                if vert_overlap <= 0 || (vert_overlap as f32 / min_h as f32) < 0.50 {
                    continue;
                }
                if tb1.h > 80 || tb2.h > 80 {
                    continue;
                }

                let (left_tb, right_tb) = if tb1.x < tb2.x { (tb1, tb2) } else { (tb2, tb1) };
                let gap = right_tb.x - (left_tb.x + left_tb.w);
                if gap < 40 || gap > 700 {
                    continue;
                }

                // CHECK IF THERE ARE ANY OTHER TEXT BUBBLES IN BETWEEN
                let has_intermediate = effective_text_bubbles.iter().enumerate().any(|(k, (mid_tb, _))| {
                    k != i && k != j
                        && mid_tb.x >= left_tb.x + left_tb.w - 10
                        && (mid_tb.x + mid_tb.w) <= right_tb.x + 10
                        && ((mid_tb.y + mid_tb.h).min(left_tb.y + left_tb.h) - mid_tb.y.max(left_tb.y)) > 0
                });
                if has_intermediate {
                    continue;
                }

                // AT LEAST ONE CANDIDATE MUST BE DIRECTLY CONNECTED TO A PROLONGED HORIZONTAL DASH
                let left_ends_with_dash = filtered_rapid_lines.iter().any(|l| {
                    let (lx, ly, lw, lh) = crate::ml::geometry::polygon_bounds(&l.polygon);
                    let ix = (left_tb.x + left_tb.w).min(lx + lw) - left_tb.x.max(lx);
                    let iy = (left_tb.y + left_tb.h).min(ly + lh) - left_tb.y.max(ly);
                    if ix > 0 && iy > 0 {
                        let t = l.text.trim();
                        t.ends_with('-') || t.ends_with('\u{2014}') || t.ends_with('–') || t.contains('\u{2014}')
                    } else {
                        false
                    }
                }) || fusion_res.crop_cache.iter().any(|c| {
                    let cx = c.crop_rect[0];
                    let cy = c.crop_rect[1];
                    let in_left = (left_tb.x - cx).abs() <= 35 && (left_tb.y - cy).abs() <= 35;
                    in_left && {
                        let t = c.result.text.trim();
                        t.ends_with('-') || t.ends_with('\u{2014}') || t.ends_with('–') || t.contains('\u{2014}')
                    }
                });
                let right_starts_with_dash = filtered_rapid_lines.iter().any(|l| {
                    let (lx, ly, lw, lh) = crate::ml::geometry::polygon_bounds(&l.polygon);
                    let ix = (right_tb.x + right_tb.w).min(lx + lw) - right_tb.x.max(lx);
                    let iy = (right_tb.y + right_tb.h).min(ly + lh) - right_tb.y.max(ly);
                    if ix > 0 && iy > 0 {
                        let t = l.text.trim();
                        t.starts_with('-') || t.starts_with('\u{2014}') || t.starts_with('–') || t.contains('\u{2014}')
                    } else {
                        false
                    }
                }) || fusion_res.crop_cache.iter().any(|c| {
                    let cx = c.crop_rect[0];
                    let cy = c.crop_rect[1];
                    let in_right = (right_tb.x - cx).abs() <= 35 && (right_tb.y - cy).abs() <= 35;
                    in_right && {
                        let t = c.result.text.trim();
                        t.starts_with('-') || t.starts_with('\u{2014}') || t.starts_with('–') || t.contains('\u{2014}')
                    }
                });
                if !left_ends_with_dash && !right_starts_with_dash {
                    continue;
                }

                // CHECK FOR CONTINUOUS OR REPEATED HORIZONTAL DASH STROKE IN THE GAP
                let y_mid = (left_tb.y + left_tb.h / 2 + right_tb.y + right_tb.h / 2) / 2;
                let sample_start = left_tb.x + left_tb.w + 15;
                let sample_end = right_tb.x - 15;
                if sample_end <= sample_start {
                    continue;
                }

                let mut dash_hits = 0usize;
                let mut total_samples = 0usize;
                for sx in (sample_start..sample_end).step_by(8) {
                    if sx < 0 || sx >= page_w as i32 {
                        continue;
                    }
                    total_samples += 1;
                    let is_stroke = (-3..=3).any(|dy| {
                        let sy = y_mid + dy;
                        if sy >= 0 && sy < page_h as i32 {
                            let p = rgb_img.get_pixel(sx as u32, sy as u32);
                            let lum = (0.299 * p[0] as f32 + 0.587 * p[1] as f32 + 0.114 * p[2] as f32) as u8;
                            lum < 140
                        } else {
                            false
                        }
                    });
                    if is_stroke {
                        dash_hits += 1;
                    }
                }

                let has_dash_stroke = total_samples >= 3 && (dash_hits as f32 / total_samples as f32) >= 0.30;
                if has_dash_stroke {
                    let min_x = left_tb.x.min(right_tb.x);
                    let min_y = left_tb.y.min(right_tb.y);
                    let max_x = (left_tb.x + left_tb.w).max(right_tb.x + right_tb.w);
                    let max_y = (left_tb.y + left_tb.h).max(right_tb.y + right_tb.h);

                    merged_indices.insert(i);
                    merged_indices.insert(j);
                    new_merged_boxes.push((
                        crate::ml::schemas::BoxRect {
                            x: min_x,
                            y: min_y,
                            w: max_x - min_x,
                            h: max_y - min_y,
                        },
                        s1.max(*s2),
                    ));
                    break;
                }
            }
        }

        if !merged_indices.is_empty() {
            let mut retained = Vec::new();
            for (idx, item) in effective_text_bubbles.into_iter().enumerate() {
                if !merged_indices.contains(&idx) {
                    retained.push(item);
                }
            }
            for (mb, _) in &new_merged_boxes {
                let env_x = (mb.x - 20).max(0);
                let env_y = (mb.y - 18).max(0);
                let env_w = (mb.w + 40).min(page_w as i32 - env_x);
                let env_h = (mb.h + 36).min(page_h as i32 - env_y);
                effective_bubbles.push(crate::ml::schemas::BoxRect {
                    x: env_x,
                    y: env_y,
                    w: env_w,
                    h: env_h,
                });
            }
            retained.extend(new_merged_boxes);
            effective_text_bubbles = retained;
        }
    }

    if is_zh {
        // 1. RECOVER WHITE SPEECH BUBBLE CONTAINERS FOR DETECTOR TEXT BUBBLES OUTSIDE ANY DETECTED BUBBLE
        for (tb, tb_score) in &effective_text_bubbles {
            if *tb_score < 0.60 {
                continue;
            }
            let in_existing_bubble = effective_bubbles.iter().any(|pb| {
                let ix = (pb.x + pb.w).min(tb.x + tb.w) - pb.x.max(tb.x);
                let iy = (pb.y + pb.h).min(tb.y + tb.h) - pb.y.max(tb.y);
                ix > 0 && iy > 0 && (ix * iy) as f32 / (tb.w * tb.h).max(1) as f32 >= 0.50
            });
            if in_existing_bubble {
                continue;
            }

            let has_dialogue_marker = filtered_rapid_lines.iter().any(|l| {
                let (lx, ly, lw, lh) = crate::ml::geometry::polygon_bounds(&l.polygon);
                let ix = (tb.x + tb.w).min(lx + lw) - tb.x.max(lx);
                let iy = (tb.y + tb.h).min(ly + lh) - tb.y.max(ly);
                if ix > 0 && iy > 0 && (ix * iy) as f32 / (lw * lh).max(1) as f32 >= 0.40 {
                    let t = l.text.trim();
                    t.chars().any(|c| matches!(c, '！' | '!' | '？' | '?' | '“' | '”' | '「' | '」' | '…'))
                        || crate::ml::detect::is_onomatopoeia_or_shout(t)
                } else {
                    false
                }
            }) || fusion_res.crop_cache.iter().any(|c| {
                let cx = c.crop_rect[0];
                let cy = c.crop_rect[1];
                let cw = c.crop_rect[2];
                let ch = c.crop_rect[3];
                let ix = (tb.x + tb.w).min(cx + cw) - tb.x.max(cx);
                let iy = (tb.y + tb.h).min(cy + ch) - tb.y.max(cy);
                if ix > 0 && iy > 0 && (ix * iy) as f32 / (tb.w * tb.h).max(1) as f32 >= 0.50 {
                    c.result.text.chars().any(|c| matches!(c, '！' | '!' | '？' | '?' | '“' | '”' | '「' | '」' | '…'))
                } else {
                    false
                }
            });

            if !has_dialogue_marker {
                continue;
            }

            if let Some(white_b) = extract_white_bubble_envelope(img, tb.x, tb.y, tb.w, tb.h, page_w, page_h) {
                if let Some(pos) = effective_bubbles.iter().position(|eb| {
                    let ix = (eb.x + eb.w).min(white_b.x + white_b.w) - eb.x.max(white_b.x);
                    let iy = (eb.y + eb.h).min(white_b.y + white_b.h) - eb.y.max(white_b.y);
                    ix > 0 && iy > 0 && (ix * iy) as f32 / ((eb.w * eb.h).min(white_b.w * white_b.h)).max(1) as f32 >= 0.35
                }) {
                    let eb = &mut effective_bubbles[pos];
                    let min_x = eb.x.min(white_b.x);
                    let min_y = eb.y.min(white_b.y);
                    let max_x = (eb.x + eb.w).max(white_b.x + white_b.w);
                    let max_y = (eb.y + eb.h).max(white_b.y + white_b.h);
                    eb.x = min_x;
                    eb.y = min_y;
                    eb.w = max_x - min_x;
                    eb.h = max_y - min_y;
                } else {
                    effective_bubbles.push(white_b);
                }
            }
        }

        // 2. RECOVER DARK BUBBLE CONTAINERS AND CANDIDATES FOR UNASSIGNED INVERTED OCR LINES
        for line in &filtered_rapid_lines {
            let char_count = line.text.chars().filter(|c| !c.is_whitespace()).count();
            if char_count < 2 {
                continue;
            }
            let is_sfx = crate::ml::detect::is_onomatopoeia_or_shout(&line.text);
            let has_exclaim = line.text.contains('！') || line.text.contains('!');
            if is_sfx && !has_exclaim {
                continue;
            }
            let has_dialogue_marker = line.text.chars().any(|c| matches!(c, '！' | '!' | '？' | '?' | '“' | '”' | '「' | '」' | '…'))
                || crate::ml::detect::is_onomatopoeia_or_shout(&line.text);
            if !has_dialogue_marker {
                continue;
            }

            let (lx, ly, lw, lh) = crate::ml::geometry::polygon_bounds(&line.polygon);
            let in_existing_bubble = effective_bubbles.iter().any(|pb| {
                let ix = (pb.x + pb.w).min(lx + lw) - pb.x.max(lx);
                let iy = (pb.y + pb.h).min(ly + lh) - pb.y.max(ly);
                ix > 0 && iy > 0 && (ix * iy) as f32 / (lw * lh).max(1) as f32 >= 0.50
            });
            let in_multiline_text_bubble = effective_text_bubbles.iter().any(|(tb, _)| {
                let ix = (tb.x + tb.w).min(lx + lw) - tb.x.max(lx);
                let iy = (tb.y + tb.h).min(ly + lh) - tb.y.max(ly);
                ix > 0 && iy > 0 && (ix * iy) as f32 / (lw * lh).max(1) as f32 >= 0.50 && tb.h >= (lh as f32 * 1.35) as i32
            });
            if !in_existing_bubble && !in_multiline_text_bubble {
                if let Some(dark_b) = extract_dark_bubble_envelope(img, lx, ly, lw, lh, page_w, page_h) {
                    if let Some(pos) = effective_bubbles.iter().position(|eb| {
                        let ix = (eb.x + eb.w).min(dark_b.x + dark_b.w) - eb.x.max(dark_b.x);
                        let iy = (eb.y + eb.h).min(dark_b.y + dark_b.h) - eb.y.max(dark_b.y);
                        ix > 0 && iy > 0 && (ix * iy) as f32 / ((eb.w * eb.h).min(dark_b.w * dark_b.h)).max(1) as f32 >= 0.35
                    }) {
                        let eb = &mut effective_bubbles[pos];
                        let min_x = eb.x.min(dark_b.x);
                        let min_y = eb.y.min(dark_b.y);
                        let max_x = (eb.x + eb.w).max(dark_b.x + dark_b.w);
                        let max_y = (eb.y + eb.h).max(dark_b.y + dark_b.h);
                        eb.x = min_x;
                        eb.y = min_y;
                        eb.w = max_x - min_x;
                        eb.h = max_y - min_y;
                    } else {
                        effective_bubbles.push(dark_b);
                    }

                    let already_in_tb = effective_text_bubbles.iter().any(|(tb, _)| {
                        (tb.x - lx).abs() <= 15 && (tb.y - ly).abs() <= 15
                    });
                    if !already_in_tb {
                        effective_text_bubbles.push((crate::ml::schemas::BoxRect { x: lx, y: ly, w: lw, h: lh }, line.score));
                    }
                }
            }
        }
    }

    // A. Use Detector-First Text and Free-Text Boxes if available (Koharu / RT-DETR)
    let is_detector_first = fusion_res.backend == "rfdetr-seg-2xl" || fusion_res.backend == "rtdetr-v2";
    if is_detector_first && (!effective_text_bubbles.is_empty() || !fusion_res.text_free.is_empty()) {
        // UNIFY ADJACENT PARALLEL VERTICAL COLUMNS WITHIN THE SAME SINGLE-CHAMBER SPEECH BUBBLE
        let mut merged_tb: Vec<(crate::ml::schemas::BoxRect, f32)> = Vec::new();
        let mut tb_merged_flags = vec![false; effective_text_bubbles.len()];
        for i in 0..effective_text_bubbles.len() {
            if tb_merged_flags[i] {
                continue;
            }
            let (mut cur_b, mut cur_score) = effective_text_bubbles[i].clone();
            for j in (i + 1)..effective_text_bubbles.len() {
                if tb_merged_flags[j] {
                    continue;
                }
                let (b2, s2) = &effective_text_bubbles[j];
                // BOTH MUST BE IN THE SAME SPEECH BUBBLE
                let shared_bubble = effective_bubbles.iter().find(|pb| {
                    let ix1 = (pb.x + pb.w).min(cur_b.x + cur_b.w) - pb.x.max(cur_b.x);
                    let iy1 = (pb.y + pb.h).min(cur_b.y + cur_b.h) - pb.y.max(cur_b.y);
                    let cov1 = (ix1.max(0) * iy1.max(0)) as f32 / (cur_b.w * cur_b.h).max(1) as f32;

                    let ix2 = (pb.x + pb.w).min(b2.x + b2.w) - pb.x.max(b2.x);
                    let iy2 = (pb.y + pb.h).min(b2.y + b2.h) - pb.y.max(b2.y);
                    let cov2 = (ix2.max(0) * iy2.max(0)) as f32 / (b2.w * b2.h).max(1) as f32;

                    cov1 >= 0.60 && cov2 >= 0.60
                });

                if let Some(pb) = shared_bubble {
                    // SINGLE-CHAMBER BUBBLE CHECK
                    let pb_ratio = pb.w as f32 / pb.h.max(1) as f32;
                    let is_single_chamber = pb_ratio >= 0.50 && pb_ratio <= 1.80;

                    let is_b1_vert = cur_b.h >= (cur_b.w as f32 * 1.15) as i32;
                    let is_b2_vert = b2.h >= (b2.w as f32 * 1.15) as i32;

                    if is_single_chamber && is_b1_vert && is_b2_vert {
                        let (left_b, right_b) = if cur_b.x < b2.x { (&cur_b, b2) } else { (b2, &cur_b) };
                        let horiz_gap = right_b.x - (left_b.x + left_b.w);
                        let vert_overlap = (left_b.y + left_b.h).min(right_b.y + right_b.h) - left_b.y.max(right_b.y);
                        let min_h = left_b.h.min(right_b.h);

                        if horiz_gap >= -15 && horiz_gap <= 55 && vert_overlap > 0 && (vert_overlap as f32 / min_h as f32 >= 0.25) {
                            let min_x = cur_b.x.min(b2.x);
                            let min_y = cur_b.y.min(b2.y);
                            let max_x = (cur_b.x + cur_b.w).max(b2.x + b2.w);
                            let max_y = (cur_b.y + cur_b.h).max(b2.y + b2.h);
                            cur_b = crate::ml::schemas::BoxRect {
                                x: min_x,
                                y: min_y,
                                w: max_x - min_x,
                                h: max_y - min_y,
                            };
                            cur_score = cur_score.max(*s2);
                            tb_merged_flags[j] = true;
                        }
                    }
                }
            }
            merged_tb.push((cur_b, cur_score));
        }
        effective_text_bubbles = merged_tb;

        for (b, score) in &effective_text_bubbles {
            let inside_any_bubble = effective_bubbles.iter().any(|pb| {
                let ix = (pb.x + pb.w).min(b.x + b.w) - pb.x.max(b.x);
                let iy = (pb.y + pb.h).min(b.y + b.h) - pb.y.max(b.y);
                ix > 0 && iy > 0 && (ix * iy) as f32 / (b.w * b.h).max(1) as f32 >= 0.50
            });
            let is_giant_screen_prop = !inside_any_bubble && (b.h >= 300 && b.w >= 250) && *score <= 0.35;
            if is_giant_screen_prop {
                continue;
            }
            let is_composite = inside_any_bubble
                && check_composite_subboxes(b, fusion_res.text_bubbles.iter().map(|(sb, sc)| (sb, *sc)), true);
            if is_composite {
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
                let parent_is_composite = check_composite_subboxes(
                    parent_b,
                    fusion_res.text_bubbles.iter().map(|(sb, sc)| (sb, *sc)),
                    true,
                );

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
                    let parent_is_composite = check_composite_subboxes(
                        parent_b,
                        fusion_res.text_bubbles.iter().map(|(sb, sc)| (sb, *sc)),
                        true,
                    );

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
            let is_inside_bubble = effective_bubbles.iter().any(|pb| {
                let ix = (pb.x + pb.w).min(b.x + b.w) - pb.x.max(b.x);
                let iy = (pb.y + pb.h).min(b.y + b.h) - pb.y.max(b.y);
                ix > 0 && iy > 0 && (ix * iy) as f32 / (b.w * b.h).max(1) as f32 >= 0.50
            });
            let has_matching_ocr = filtered_rapid_lines.iter().any(|l| {
                let (lx, ly, lw, lh) = crate::ml::geometry::polygon_bounds(&l.polygon);
                let ix = (b.x + b.w).min(lx + lw) - b.x.max(lx);
                let iy = (b.y + b.h).min(ly + lh) - b.y.max(ly);
                if ix > 0 && iy > 0 {
                    let inter = (ix * iy) as f32;
                    inter / (b.w * b.h).max(1) as f32 >= 0.35 || inter / (lw * lh).max(1) as f32 >= 0.35
                } else {
                    false
                }
            });
            let overlaps_sfx = !is_inside_bubble && !has_matching_ocr && fusion_res.onomatopoeia.iter().any(|(sfx_b, sfx_score)| {
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
            let is_inside_bubble = effective_bubbles.iter().any(|pb| {
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
                    inter_area / b_area >= 0.40 && *sfx_score >= *score - 0.10
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
                let is_separate_detector_box = effective_text_bubbles.iter().map(|(b, s)| (b, s)).chain(fusion_res.text_free.iter().map(|(b, s)| (b, s))).any(|(tb, _)| {
                    let is_different_box = (tb.x - bx as i32).abs() > 15 || (tb.y - by as i32).abs() > 15;
                    if !is_different_box {
                        return false;
                    }
                    let tb_iy = (tb.y + tb.h).min(ly + lh) - tb.y.max(ly);
                    let tb_ix = (tb.x + tb.w).min(lx + lw) - tb.x.max(lx);
                    tb_iy > 0 && tb_ix > 0 && (tb_ix * tb_iy) as f32 / (lw * lh).max(1) as f32 >= 0.40
                        && ((tb.y as f32 >= by + bh - 10.0 || by as f32 >= (tb.y + tb.h) as f32 - 10.0) || ((tb.x as f32 >= bx + bw - 10.0 || bx as f32 >= (tb.x + tb.w) as f32 - 10.0)))
                });
                let parent_bubble = effective_bubbles.iter().find(|b| {
                    let ix = (bx + bw).min((b.x + b.w) as f32) - bx.max(b.x as f32);
                    let iy = (by + bh).min((b.y + b.h) as f32) - by.max(b.y as f32);
                    ix > 0.0 && iy > 0.0 && (ix * iy) / (bw * bh).max(1.0) >= 0.50
                });
                let leaks_outside_bubble = if let Some(pb) = parent_bubble {
                    (ly + lh) as f32 > (pb.y + pb.h + 15) as f32
                        || (ly as f32) < (pb.y - 15) as f32
                        || (lx + lw) as f32 > (pb.x + pb.w + 15) as f32
                        || (lx as f32) < (pb.x - 15) as f32
                } else {
                    false
                };

                let is_distinct_rank_line = (bh <= 35.0 || (lh as f32) <= 35.0)
                    && (line.text.trim().ends_with("弟子") || line.text.trim().ends_with("阶") || line.text.trim().ends_with("级") || line.text.trim().ends_with("层") || line.text.trim().ends_with("段") || line.text.trim().ends_with("境") || line.text.trim().ends_with("部"))
                    && (ly as f32 >= by + bh + 10.0);
                let is_tabular_line = parent_bubble.is_none() && (crate::ml::detect::is_repetitive_tabular_text(&line.text) || crate::ml::detect::is_standalone_table_cell(&line.text));
                let is_adjacent_trailing_row = !is_subtitle_to_title
                    && !is_separate_detector_box
                    && !is_distinct_rank_line
                    && !is_tabular_line
                    && !leaks_outside_bubble
                    && (bw >= bh * 0.70 || (lw as f32) >= lh as f32 * 1.20)
                    && !(bh > bw * 1.60 && (lw as f32) < bw * 0.70)
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
                        let matching_bubbles: Vec<&crate::ml::schemas::BoxRect> = effective_text_bubbles.iter().filter_map(|(tb, tb_score)| {
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
                            let has_enclosing_box = matching_bubbles.iter().any(|b| {
                                (b.w as f32) >= (lw as f32 * 0.75) && (b.x - lx).abs() <= 35
                            });
                            if has_enclosing_box {
                                false
                            } else {
                                let b1 = matching_bubbles[0];
                                let b2 = matching_bubbles[1];
                                let both_substantial = b1.w >= 45 && b1.h >= 35 && b2.w >= 45 && b2.h >= 35;
                                let vert_overlap = (b1.y + b1.h).min(b2.y + b2.h) - b1.y.max(b2.y);
                                let min_h = b1.h.min(b2.h);
                                let on_same_row = vert_overlap > 0 && (vert_overlap as f32 / min_h as f32 >= 0.50);
                                both_substantial && ((!on_same_row && (b1.x - b2.x).abs() >= 40) || (b1.y - b2.y).abs() >= 40)
                            }
                        } else {
                            false
                        }
                    };
                    let char_count = line.text.chars().filter(|c| !c.is_whitespace()).count();
                    let is_slanted_free_line = crate::ml::geometry::calculate_box_angle_i32(&line.polygon).abs() >= 12.0;
                    let effective_glyph_h = if is_slanted_free_line {
                        super::region_builder::polygon_thickness(&line.polygon)
                    } else {
                        lh as f32
                    };
                    let is_giant_calligraphy_to_body = is_cjk && (effective_glyph_h >= 120.0 || (lw as f32 >= 350.0 && effective_glyph_h >= 80.0)) && char_count <= 4 && bh <= 200.0;
                    let is_bubble_cb = fusion_res.bubbles.iter().any(|b| {
                        let ix = (bx + bw).min((b.x + b.w) as f32) - bx.max(b.x as f32);
                        let iy = (by + bh).min((b.y + b.h) as f32) - by.max(b.y as f32);
                        ix > 0.0 && iy > 0.0 && (ix * iy) / (bw * bh).max(1.0) >= 0.50
                    });
                    if is_slanted_free_line && is_bubble_cb {
                        continue;
                    }
                    if !is_cross_panel_sfx_bleed && !is_giant_calligraphy_to_body && ((ix > 0.0 && iy > 0.0 && (coverage_l >= 0.25 || coverage_b >= 0.25)) || is_adjacent_trailing_row || is_adjacent_leading_row) {
                        let is_line_covered_by_cb = coverage_l >= 0.50 || crate::ml::geometry::line_center_inside_box(&line.polygon, &crate::ml::schemas::BoxRect { x: bx as i32, y: by as i32, w: bw as i32, h: bh as i32 });
                        if is_line_covered_by_cb {
                            overlaps_any = true;
                        }
                        if overlaps_multiple_distinct_text_bubbles {
                            continue;
                        }
                        // IF DETECTOR BOX IS A PARTIAL SINGLE-LINE SLICE AND RAPID OCR DETECTED A LONGER SENTENCE ON THE SAME ROW
                        let is_horiz_single_line = !leaks_outside_bubble
                            && (bh <= 45.0 || (lh as f32) <= 45.0)
                            && iy >= 0.40 * bh.min(lh as f32)
                            && bh <= (lh as f32 * 1.6)
                            && (lw as f32 >= bw * 1.05 || ix >= 0.25 * bw.min(lw as f32));
                        let is_vert_single_line = !leaks_outside_bubble
                            && ix >= 0.40 * bw.min(lw as f32)
                            && bw <= (lw as f32 * 1.6)
                            && (lh as f32 >= bh * 1.05 || iy >= 0.25 * bh.min(lh as f32));
                        // IF DETECTOR BOX COVERS MULTI-LINE TEXT BUT MISSES THE BOTTOM-MOST LINE OR TOP-MOST EXTENSION
                        // GUARD: Do not expand into trailing pure-Latin OCR noise lines (e.g. clothing pattern HOSPITAL)
                        // when the source language is non-Latin (Korean/CJK) and the line has no native script.
                        let is_trailing_latin_noise = crate::ml::detect::is_non_latin_source(source_lang) && {
                            let lt = line.text.trim();
                            !crate::ml::detect::has_native_script_for_lang(lt, source_lang)
                                && lt.chars().all(|c| c.is_ascii_alphabetic() || c.is_whitespace() || c.is_ascii_punctuation())
                        };
                        let is_partial_vert_container = !is_subtitle_to_title
                            && !is_separate_detector_box
                            && !is_trailing_latin_noise
                            && !leaks_outside_bubble
                            && (bw >= bh * 1.15)
                            && (lx as f32 >= bx - 35.0)
                            && ((lx + lw) as f32 <= bx + bw + 35.0)
                            && (ly as f32 >= by - 15.0)
                            && ((ly + lh) as f32 > by + bh)
                            && ((ly as f32) <= by + bh + 45.0);
                        let is_horiz_contained_line = !is_subtitle_to_title
                            && !is_separate_detector_box
                            && !is_trailing_latin_noise
                            && !leaks_outside_bubble
                            && iy >= 0.35 * (lh as f32).min(bh)
                            && ix >= 0.35 * (lw as f32).min(bw)
                            && (bw <= (lw as f32 * 1.6) || (lw as f32) >= bw * 0.85);

                        if !is_tabular_line && (is_horiz_single_line || is_vert_single_line || is_partial_vert_container || is_horiz_contained_line || is_adjacent_trailing_row || is_adjacent_leading_row) && !is_trailing_latin_noise {
                            // GUARD: Do not expand a compact dialogue detector box if the line is slanted free-text or distant crowd reaction
                            let is_slanted_line = crate::ml::geometry::calculate_box_angle_i32(&line.polygon).abs() >= 12.0;
                            if !is_slanted_line {
                                let (union_x, union_y, union_w, union_h) = if let Some(pb) = parent_bubble {
                                    let ux = bx.min(lx as f32).max((pb.x - 5) as f32);
                                    let uy = by.min(ly as f32).max((pb.y - 5) as f32);
                                    let mx = ((bx + bw).max((lx + lw) as f32)).min((pb.x + pb.w + 5) as f32);
                                    let my = ((by + bh).max((ly + lh) as f32)).min((pb.y + pb.h + 5) as f32);
                                    (ux, uy, (mx - ux).max(1.0), (my - uy).max(1.0))
                                } else {
                                    let ux = bx.min(lx as f32);
                                    let uy = by.min(ly as f32);
                                    let uw = (bx + bw).max((lx + lw) as f32) - ux;
                                    let uh = (by + bh).max((ly + lh) as f32) - uy;
                                    (ux, uy, uw, uh)
                                };
                                *cb = vec![
                                    [union_x, union_y],
                                    [union_x + union_w, union_y],
                                    [union_x + union_w, union_y + union_h],
                                    [union_x, union_y + union_h],
                                ];
                                overlaps_any = true;
                                break;
                            }
                        }
                        if is_line_covered_by_cb {
                            break;
                        }
                    }
                }
            }
            if !overlaps_any {
                // DO NOT RESCUE LINE AS MISSED TEXT IF IT OVERLAPS DETECTED ONOMATOPOEIA (SFX)
                let is_sentence_dialogue = crate::ml::detect::has_native_script_for_lang(&line.text, source_lang)
                    && line.text.chars().filter(|c| !c.is_whitespace()).count() >= 3
                    && !crate::ml::detect::is_onomatopoeia_or_shout(&line.text);
                let overlaps_sfx = !is_sentence_dialogue && fusion_res.onomatopoeia.iter().any(|(sfx_b, score)| {
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

                if !is_sentence_dialogue && (lw as f32) >= (page_w as f32 * 0.55) && lh >= 70 {
                    continue;
                }

                // DO NOT RESCUE REPETITIVE TABULAR DATA, CHAPTER METRICS, OR STANDALONE TABLE CELL COUNTERS
                let line_inside_any_bubble = effective_bubbles.iter().any(|b| {
                    crate::ml::geometry::line_center_inside_box(&line.polygon, b)
                });
                if !line_inside_any_bubble && (crate::ml::detect::is_repetitive_tabular_text(&line.text) || crate::ml::detect::is_standalone_table_cell(&line.text)) {
                    continue;
                }

                // LAYOUT-ANCHORED RESCUE: CHECK IF THE OCR LINE IS ADJACENT TO ANY CONFIDENT DETECTED LAYOUT BOX (BUBBLE OR TEXT CANDIDATE)
                let is_near_layout_anchor = effective_bubbles.iter().chain(effective_text_bubbles.iter().filter(|(_, s)| *s >= 0.25).map(|(b, _)| b)).chain(fusion_res.text_free.iter().filter(|(_, s)| *s >= 0.25).map(|(b, _)| b)).any(|b| {
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
                        effective_bubbles.iter().any(|b| {
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
                    let is_dialogue_utterance = line.text.chars().count() >= 4
                        && (line.text.contains('！') || line.text.contains('？') || line.text.contains('!') || line.text.contains('?'));
                    let is_credits = crate::ml::detect::is_credits_or_metadata_text(&line.text);
                    if !is_dialogue_utterance && !is_credits {
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

                // IN NON-LATIN / CJK COMICS, DO NOT RESCUE ISOLATED LATIN NOISE / CLOTHING CREASES / STRAY DIGITS OR FOREIGN SFX SCRIPT OUTSIDE SPEECH BUBBLES
                let is_non_latin = crate::ml::detect::is_non_latin_source(source_lang);
                let lacks_native = !crate::ml::detect::has_native_script_for_lang(&line.text, source_lang);
                let is_punct = line.text.chars().any(|c| matches!(c, '！' | '？' | '!' | '?' | '…' | '·' | '—' | '～' | '¿' | '¡'));
                if is_non_latin && lacks_native && !is_punct {
                    continue;
                }

                // IF NOT NEAR ANY LAYOUT DETECTION, ONLY RESCUE HIGH-CONFIDENCE NATIVE SCRIPT ON CLEAN GUTTER OR TITLE NARRATION
                let has_any_layout = !effective_bubbles.is_empty() || !effective_text_bubbles.is_empty() || !fusion_res.text_free.is_empty();
                if has_any_layout && !is_near_layout_anchor {
                    // Check if background is dark/artwork
                    let is_native = match source_lang {
                        Some(lang) if crate::ml::detect::is_non_latin_source(Some(lang)) => {
                            crate::ml::detect::has_native_script_for_lang(&line.text, Some(lang))
                        }
                        _ => true,
                    };
                    let is_adjacent_to_native = filtered_rapid_lines.iter().any(|other| {
                        if std::ptr::eq(*other, *line) { return false; }
                        let other_is_native = crate::ml::detect::has_native_script_for_lang(&other.text, source_lang);
                        if !other_is_native { return false; }
                        let (ox, oy, ow, oh) = crate::ml::geometry::polygon_bounds(&other.polygon);
                        let dx = (ox - (lx + lw)).max(lx - (ox + ow)).max(0);
                        let dy = (oy - (ly + lh)).max(ly - (oy + oh)).max(0);
                        dx <= 45 && dy <= 35
                    });
                    let is_native_or_stat = is_native || (is_adjacent_to_native && line.text.chars().all(|c| c.is_ascii_digit() || c.is_ascii_punctuation()));
                    let min_chars = match source_lang {
                        Some("zh_hans") | Some("zh_hant") | Some("zh-Hans") | Some("zh-Hant") => 2,
                        _ => 3,
                    };
                    if !is_native_or_stat || line.score < 0.70 || line.text.chars().filter(|c| !c.is_whitespace()).count() < min_chars {
                        continue;
                    }
                }

                let is_adjacent_stat_line = filtered_rapid_lines.iter().any(|other| {
                    if std::ptr::eq(*other, *line) { return false; }
                    let other_is_native = crate::ml::detect::has_native_script_for_lang(&other.text, source_lang);
                    if !other_is_native { return false; }
                    let (ox, oy, ow, oh) = crate::ml::geometry::polygon_bounds(&other.polygon);
                    let dx = (ox - (lx + lw)).max(lx - (ox + ow)).max(0);
                    let dy = (oy - (ly + lh)).max(ly - (oy + oh)).max(0);
                    dx <= 45 && dy <= 35
                });
                if lw <= 40 && lh <= 55 {
                    let has_cjk = crate::ml::detect::has_cjk_characters(&line.text);
                    if (!has_cjk && !is_adjacent_stat_line && line.score < 0.85) || (has_cjk && line.score < 0.70) {
                        continue;
                    }
                }
                candidate_boxes.push(line.polygon.iter().map(|p| [p[0] as f32, p[1] as f32]).collect());
                candidate_scores.push(line.score);
            }
        }
    } else {
        // Fallback: Group adjacent RapidOCR lines into unified candidates (horizontal rows or vertical columns)
        let mut valid_lines: Vec<&crate::ml::ocr::OcrLine> = Vec::new();
        for line in &fusion_res.rapid_lines {
            if line.score < 0.50 {
                continue;
            }
            let (lx, ly, lw, lh) = crate::ml::geometry::polygon_bounds(&line.polygon);
            let is_sentence_dialogue = crate::ml::detect::has_native_script_for_lang(&line.text, source_lang)
                && line.text.chars().filter(|c| !c.is_whitespace()).count() >= 3
                && !crate::ml::detect::is_onomatopoeia_or_shout(&line.text);
            let overlaps_sfx = !is_sentence_dialogue && fusion_res.onomatopoeia.iter().any(|(sfx_b, score)| {
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
            valid_lines.push(line);
        }

        let n = valid_lines.len();
        let mut visited = vec![false; n];
        for i in 0..n {
            if visited[i] {
                continue;
            }
            let mut cluster = vec![i];
            visited[i] = true;
            let mut q = std::collections::VecDeque::new();
            q.push_back(i);
            while let Some(curr) = q.pop_front() {
                let (cx, cy, cw, ch) = crate::ml::geometry::polygon_bounds(&valid_lines[curr].polygon);
                for j in 0..n {
                    if visited[j] {
                        continue;
                    }
                    let (jx, jy, jw, jh) = crate::ml::geometry::polygon_bounds(&valid_lines[j].polygon);
                    // Horizontal row continuation check: lines on the same row
                    let iy = ((cy + ch).min(jy + jh) - cy.max(jy)).max(0);
                    let vert_overlap = iy as f32 / (ch.min(jh) as f32).max(1.0);
                    let horiz_gap = (jx - (cx + cw)).max(cx - (jx + jw));
                    let is_horiz_row = vert_overlap >= 0.55
                        && (ch.max(jh) as f32 <= ch.min(jh) as f32 * 1.6)
                        && (horiz_gap <= 45 || (horiz_gap < 0 && horiz_gap >= -90));

                    if is_horiz_row {
                        visited[j] = true;
                        cluster.push(j);
                        q.push_back(j);
                    }
                }
            }

            let mut min_x = i32::MAX;
            let mut min_y = i32::MAX;
            let mut max_x = i32::MIN;
            let mut max_y = i32::MIN;
            let mut score_sum = 0.0f32;
            for &idx in &cluster {
                let l = valid_lines[idx];
                for p in &l.polygon {
                    min_x = min_x.min(p[0]);
                    min_y = min_y.min(p[1]);
                    max_x = max_x.max(p[0]);
                    max_y = max_y.max(p[1]);
                }
                score_sum += l.score;
            }
            let avg_score = score_sum / cluster.len() as f32;
            candidate_boxes.push(vec![
                [min_x as f32, min_y as f32],
                [max_x as f32, min_y as f32],
                [max_x as f32, max_y as f32],
                [min_x as f32, max_y as f32],
            ]);
            candidate_scores.push(avg_score);
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
            crop_cache: Vec::new(),
        });
    }


    let (dedup_boxes, _) = deduplicate_boxes(&candidate_boxes, &candidate_scores, 0.40);
    let order = sort_regions_top_to_bottom(&dedup_boxes, page_h as usize, 0.5, source_lang);
    let stage2_duration_ms = t_stage2_start.elapsed().as_secs_f64() * 1000.0;

    // =========================================================================
    // STAGE 3: TARGETED TEXT RECOGNITION & REGION MASKING
    // =========================================================================
    let t_stage3_start = std::time::Instant::now();
    let split_clean_lines: Vec<crate::ml::ocr::OcrLine> = filtered_rapid_lines.into_iter().cloned().collect();
    let mut active_crops = fusion_res.crop_cache.clone();
    let mut final_regions = build_regions(
        &mut engine.ocr,
        Some(&mut active_crops),
        img,
        &dedup_boxes,
        &order,
        &split_clean_lines,
        &effective_bubbles,
        page_w,
        page_h,
        is_cjk,
        is_latin,
        source_lang,
        options.and_then(|o| o.inpaint_padding_pct),
        options.and_then(|o| o.enable_typeset_centering),
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
        crop_cache: active_crops,
    })
}
