// -- CRATE / EXTERNAL IMPORTS -- //
use image::DynamicImage;

// -- INTERNAL IMPORTS -- //
use crate::ml::geometry::{
    box_iou, box_iou_pts, calculate_box_angle, calculate_box_angle_i32,
    line_center_inside_box, polygon_bounds,
};
use crate::ml::ocr::{OcrLine, RapidOcr};
use crate::ml::schemas::{BoxRect, Point2D, Region, RegionKind};
use super::clustering::{cluster_lines_into_utterances, format_lines_cluster};
use super::dedup::deduplicate_and_unify_regions;
use super::expansion::expand_bubble_text_boxes;
use super::filter::should_reject_candidate_region;
use super::geometry::expand_box;
use super::refine::{run_fallback_crop_recognition, try_refine_cluster_crop};

// -- FUNCTIONS & ALGORITHMS -- //

/// BUILD FINAL REGIONS FROM DETECTED CONTAINERS AND OCR LINES (PURE 2-STAGE NEURAL PIPELINE)
pub fn build_regions(
    ocr: &mut Option<RapidOcr>,
    img: &DynamicImage,
    dedup_boxes: &[Vec<[f32; 2]>],
    order: &[usize],
    split_lines: &[OcrLine],
    bubbles: &[BoxRect],
    page_w: u32,
    page_h: u32,
    is_cjk: bool,
    _is_latin: bool,
    source_lang: Option<&str>,
    inpaint_padding_pct: Option<f32>,
    typeset_padding_pct: Option<f32>,
) -> Vec<Region> {
    let inpaint_pct = inpaint_padding_pct.unwrap_or(0.03);
    let typeset_pct = typeset_padding_pct.unwrap_or(0.00);
    let mut regions: Vec<Region> = Vec::new();

    for &idx in order {
        let box_pts = &dedup_boxes[idx];
        let (bx, by, bw, bh) = crate::ml::geometry::box_to_xywh_f32(box_pts);
        let sx = bx.max(0.0) as i32;
        let sy = by.max(0.0) as i32;
        let sw = (bw.max(1.0) as i32).min(page_w as i32 - sx);
        let sh = (bh.max(1.0) as i32).min(page_h as i32 - sy);

        let box_rect = BoxRect {
            x: sx,
            y: sy,
            w: sw,
            h: sh,
        };

        // CONTAINER & BUBBLE ASSOCIATION (REQUIRES >= 50% COVERAGE INSIDE BUBBLE)
        let (bx, by, bw, bh) = (box_rect.x, box_rect.y, box_rect.w, box_rect.h);
        let box_area = (bw * bh).max(1);

        let matched_bubble = bubbles.iter().find(|b| {
            let inter_x = (bx + bw).min(b.x + b.w) - bx.max(b.x);
            let inter_y = (by + bh).min(b.y + b.h) - by.max(b.y);
            if inter_x > 0 && inter_y > 0 {
                let inter_area = inter_x * inter_y;
                let coverage = inter_area as f32 / box_area as f32;
                coverage >= 0.50
            } else {
                false
            }
        });

        let is_bubble_region = matched_bubble.is_some();
        let kind = if is_bubble_region {
            RegionKind::DialogueBubble
        } else {
            RegionKind::FreeText
        };

        // MATCH OCR LINES WHOSE CENTER SITS INSIDE THIS CANDIDATE BOX
        let mut matched: Vec<&OcrLine> = split_lines
            .iter()
            .filter(|l| {
                let (lx, ly, lw, lh) = polygon_bounds(&l.polygon);
                if box_rect.w < 100 && lw >= (box_rect.w as f32 * 2.50) as i32 {
                    return false;
                }
                if line_center_inside_box(&l.polygon, &box_rect) {
                    return true;
                }
                let l_rect = BoxRect { x: lx, y: ly, w: lw, h: lh };
                let iou = box_iou(&box_rect, &l_rect);
                let inter_x = (box_rect.x + box_rect.w).min(lx + lw) - box_rect.x.max(lx);
                let inter_y = (box_rect.y + box_rect.h).min(ly + lh) - box_rect.y.max(ly);
                let inter_area = inter_x.max(0) * inter_y.max(0);
                let l_area = (lw * lh).max(1);
                let coverage = inter_area as f32 / l_area as f32;

                iou >= 0.25 || coverage >= 0.40
            })
            .collect();

        // IN NON-LATIN SCRIPT SOURCES (E.G. KOREAN, CJK), DROP OVERLAPPING PURE LATIN NOISE LINES
        if crate::ml::detect::is_non_latin_source(source_lang) && matched.iter().any(|l| {
            let t = l.text.trim();
            crate::ml::detect::has_native_script_for_lang(t, source_lang) || t.chars().any(|c| matches!(c, '！' | '？' | '!' | '?' | '…'))
        }) {
            matched.retain(|l| {
                let t = l.text.trim();
                let lacks_native = !crate::ml::detect::has_native_script_for_lang(t, source_lang);
                let is_punct = t.chars().any(|c| matches!(c, '！' | '？' | '!' | '?' | '…'));
                let is_pure_latin_word = lacks_native && !is_punct && t.chars().all(|c| c.is_ascii_alphabetic() || c.is_whitespace() || c.is_ascii_punctuation());
                !is_pure_latin_word || crate::ml::detect::is_onomatopoeia_or_shout(t)
            });
        }

        let mut is_container_vert = box_rect.h > (box_rect.w as f32 * 1.3) as i32;
        let mut angle_deg = 0.0f32;

        if !matched.is_empty() {
            // DETERMINE DOMINANT TEXT ORIENTATION INSIDE THIS CONTAINER (HORIZONTAL VS VERTICAL TBRL)
            let mut h_area = 0i64;
            let mut v_area = 0i64;
            let mut h_count = 0usize;
            let mut v_count = 0usize;

            for &m in &matched {
                let (_, _, lw, lh) = polygon_bounds(&m.polygon);
                let area = (lw * lh) as i64;
                if lh > (lw as f32 * 1.25) as i32 {
                    v_count += 1;
                    v_area += area;
                } else {
                    h_count += 1;
                    h_area += area;
                }
            }

            is_container_vert = if v_count > 0 && h_count > 0 {
                v_area > (h_area as f32 * 1.30) as i64 || (box_rect.h > (box_rect.w as f32 * 1.3) as i32 && v_count >= h_count)
            } else if v_count > 0 {
                true
            } else if h_count > 0 {
                false
            } else {
                box_rect.h > (box_rect.w as f32 * 1.3) as i32
            };

            // PRUNE PERPENDICULAR PHANTOM SLICES THAT CONFLICT WITH DOMINANT ORIENTATION
            let mut orientation_filtered: Vec<&OcrLine> = if h_count > 0 && v_count > 0 {
                matched.iter().copied().filter(|m| {
                    let (_, _, lw, lh) = polygon_bounds(&m.polygon);
                    let is_line_vert = lh > (lw as f32 * 1.25) as i32;
                    let t = m.text.trim();
                    let is_punct = t.chars().all(|c| c.is_ascii_punctuation() || matches!(c, '！' | '？' | '!' | '?' | '…'));
                    is_line_vert == is_container_vert || (is_container_vert && is_punct)
                }).collect()
            } else {
                matched.clone()
            };

            // IN CONTAINERS WITH A HIGH-CONFIDENCE DOMINANT LINE (SCORE >= 0.70), SUPPRESS WEAK BACKGROUND NOISE LINES
            let max_score = orientation_filtered.iter().map(|l| l.score).fold(0.0f32, f32::max);
            if max_score >= 0.70 {
                orientation_filtered.retain(|l| l.score >= 0.60 || l.score >= max_score * 0.85);
            }

            // IN NON-LATIN CONTAINERS, SUPPRESS PURE LATIN NOISE / CLOTHING PATTERN / DIGIT NOISE LINES
            let has_native_or_punct_line = orientation_filtered.iter().any(|l| {
                let t = l.text.trim();
                l.score >= 0.65 && (crate::ml::detect::has_native_script_for_lang(t, source_lang) || t.chars().any(|c| matches!(c, '！' | '？' | '!' | '?' | '…')))
            });
            if has_native_or_punct_line && crate::ml::detect::is_non_latin_source(source_lang) {
                orientation_filtered.retain(|l| {
                    let t = l.text.trim();
                    let lacks_native = !crate::ml::detect::has_native_script_for_lang(t, source_lang);
                    let is_punct = t.chars().any(|c| matches!(c, '！' | '？' | '!' | '?' | '…'));
                    let is_pure_latin_word = lacks_native && !is_punct && t.chars().all(|c| c.is_ascii_alphabetic() || c.is_whitespace() || c.is_ascii_punctuation());
                    let is_noise_or_digit = lacks_native && !is_punct && (crate::ml::detect::is_standalone_digit_or_particle_noise(t) || crate::ml::detect::is_standalone_noise_stroke(t));
                    (!is_pure_latin_word && !is_noise_or_digit) || crate::ml::detect::is_onomatopoeia_or_shout(t)
                });
            }

            let mut sanitized_lines: Vec<OcrLine> = Vec::new();
            for &m in &orientation_filtered {
                let clean_m = crate::ml::detect::clean_stray_ocr_artifacts(&m.text);
                let clean_m = clean_m.trim();
                if clean_m.is_empty() {
                    continue;
                }
                let mut clone_line = m.clone();
                clone_line.text = clean_m.to_string();
                sanitized_lines.push(clone_line);
            }

            let mut filtered_matched: Vec<&OcrLine> = Vec::new();
            for m in &sanitized_lines {
                let clean_m = m.text.trim();
                if clean_m.is_empty() || crate::ml::detect::is_watermark_line(clean_m) {
                    continue;
                }
                let (mx, my, mw, mh) = polygon_bounds(&m.polygon);
                let mut is_dup = false;
                for existing in &filtered_matched {
                    let clean_o = existing.text.trim();
                    let (ox, oy, ow, oh) = polygon_bounds(&existing.polygon);
                    let iou = box_iou_pts(&m.polygon, &existing.polygon);
                    let is_exact = clean_m == clean_o;
                    let norm_m: String = clean_m.chars().filter(|c| !c.is_whitespace()).collect();
                    let norm_o: String = clean_o.chars().filter(|c| !c.is_whitespace()).collect();
                    let is_sub = norm_o.contains(&norm_m) && norm_o.chars().count() > norm_m.chars().count();
                    let overlap_x = (mx + mw).min(ox + ow) - mx.max(ox);
                    let overlap_y = (my + mh).min(oy + oh) - my.max(oy);
                    let overlap_area = overlap_x.max(0) * overlap_y.max(0);
                    let m_area = (mw * mh).max(1);
                    let overlap_ratio_m = overlap_area as f32 / m_area as f32;

                    let min_h_mo = mh.min(oh);
                    let max_neg_col_x = -(min_h_mo as f32 * 0.60).max(15.0) as i32;
                    let vert_col_overlap = if is_container_vert && mh > 0 && oh > 0 {
                        overlap_y.max(0) as f32 / min_h_mo as f32 >= 0.50 && overlap_x >= max_neg_col_x
                    } else {
                        false
                    };

                    let is_horizontal_suffix_noise = !is_container_vert
                        && clean_m.chars().count() == 1
                        && clean_m.chars().all(|c| c.is_ascii_digit())
                        && clean_o.chars().count() >= 6
                        && mx >= ox + (ow * 3 / 4)
                        && overlap_y.max(0) as f32 / mh.min(oh).max(1) as f32 >= 0.50;

                    let is_punct_m = clean_m.chars().all(|c| c.is_ascii_punctuation() || matches!(c, '！' | '？' | '!' | '?' | '…'));
                    let is_punct_o = clean_o.chars().all(|c| c.is_ascii_punctuation() || matches!(c, '！' | '？' | '!' | '?' | '…'));
                    let is_vert_col_text_and_punct = is_container_vert && (is_punct_m != is_punct_o);

                    if ((iou >= 0.40 || overlap_ratio_m >= 0.60 || (vert_col_overlap && is_sub) || is_horizontal_suffix_noise || (overlap_ratio_m >= 0.30 && is_sub)) && (is_exact || is_sub || is_horizontal_suffix_noise))
                        && !is_vert_col_text_and_punct
                    {
                        is_dup = true;
                        break;
                    }
                }
                if !is_dup {
                    filtered_matched.retain(|existing| {
                        let clean_o = existing.text.trim();
                        let (ox, oy, ow, oh) = polygon_bounds(&existing.polygon);
                        let iou = box_iou_pts(&m.polygon, &existing.polygon);
                        let norm_m: String = clean_m.chars().filter(|c| !c.is_whitespace()).collect();
                        let norm_o: String = clean_o.chars().filter(|c| !c.is_whitespace()).collect();
                        let is_existing_sub = norm_m.contains(&norm_o) && norm_m.chars().count() > norm_o.chars().count();
                        let overlap_x = (mx + mw).min(ox + ow) - mx.max(ox);
                        let overlap_y = (my + mh).min(oy + oh) - my.max(oy);
                        let overlap_area = overlap_x.max(0) * overlap_y.max(0);
                        let o_area = (ow * oh).max(1);
                        let overlap_ratio_o = overlap_area as f32 / o_area as f32;
                        let min_h_mo = mh.min(oh);
                        let max_neg_col_x = -(min_h_mo as f32 * 0.60).max(15.0) as i32;
                        let vert_col_overlap = if is_container_vert && mh > 0 && oh > 0 {
                            overlap_y.max(0) as f32 / min_h_mo as f32 >= 0.50 && overlap_x >= max_neg_col_x
                        } else {
                            false
                        };
                        let is_existing_suffix_noise = !is_container_vert
                            && clean_o.chars().count() == 1
                            && clean_o.chars().all(|c| c.is_ascii_digit())
                            && clean_m.chars().count() >= 6
                            && ox >= mx + (mw * 3 / 4)
                            && overlap_y.max(0) as f32 / mh.min(oh).max(1) as f32 >= 0.50;

                        let is_punct_o = clean_o.chars().all(|c| c.is_ascii_punctuation() || matches!(c, '！' | '？' | '!' | '?' | '…'));
                        let is_punct_m = clean_m.chars().all(|c| c.is_ascii_punctuation() || matches!(c, '！' | '？' | '!' | '?' | '…'));
                        let is_vert_col_text_and_punct = is_container_vert && (is_punct_m != is_punct_o);

                        (!(((iou >= 0.40 || vert_col_overlap || overlap_ratio_o >= 0.30) && is_existing_sub) || is_existing_suffix_noise)) || is_vert_col_text_and_punct
                    });
                    filtered_matched.push(m);
                }
            }

            let line_angles: Vec<f32> = filtered_matched
                .iter()
                .filter_map(|l| {
                    let (_, _, lw, lh) = polygon_bounds(&l.polygon);
                    let th = super::clustering::polygon_thickness(&l.polygon);
                    let min_dim = (th * 1.8).max(18.0) as i32;
                    if lw >= min_dim || lh >= min_dim {
                        let a = calculate_box_angle_i32(&l.polygon);
                        if a != 0.0 { Some(a) } else { None }
                    } else {
                        None
                    }
                })
                .collect();

            let median_line_angle = if !line_angles.is_empty() {
                let mut sorted = line_angles;
                sorted.sort_by(|a, b| a.total_cmp(b));
                sorted[sorted.len() / 2]
            } else {
                0.0
            };

            let rad_a = median_line_angle.to_radians();
            let (sin_a, cos_a) = (rad_a.sin(), rad_a.cos());

            let clusters = cluster_lines_into_utterances(&filtered_matched, is_cjk, is_container_vert, sin_a, cos_a);

            for cluster_lines in clusters {
                if cluster_lines.is_empty() {
                    continue;
                }
                let box_angle = calculate_box_angle(box_pts);
                let line_angles: Vec<f32> = cluster_lines
                    .iter()
                    .filter_map(|l| {
                        let (_, _, lw, lh) = polygon_bounds(&l.polygon);
                        let th = super::clustering::polygon_thickness(&l.polygon);
                        let min_dim = (th * 1.8).max(18.0) as i32;
                        if lw >= min_dim || lh >= min_dim {
                            let a = calculate_box_angle_i32(&l.polygon);
                            if a != 0.0 { Some(a) } else { None }
                        } else {
                            None
                        }
                    })
                    .collect();

                let median_line_angle = if !line_angles.is_empty() {
                    let mut sorted = line_angles;
                    sorted.sort_by(|a, b| a.total_cmp(b));
                    sorted[sorted.len() / 2]
                } else {
                    0.0
                };

                angle_deg = if !cluster_lines.is_empty() && median_line_angle.abs() >= 1.5 {
                    if median_line_angle.abs() < 3.5 && (box_angle == 0.0 || (box_angle.abs() < 1.5)) {
                        0.0
                    } else {
                        median_line_angle
                    }
                } else if is_container_vert {
                    0.0
                } else if !cluster_lines.is_empty() && median_line_angle.abs() < 1.5 && box_angle.abs() < 8.0 {
                    0.0
                } else if box_angle.abs() >= 1.5 && matched_bubble.is_none() {
                    box_angle
                } else {
                    median_line_angle
                };

                let alpha_rad = angle_deg * (std::f32::consts::PI / 180.0);
                let cos_a = alpha_rad.cos();
                let sin_a = alpha_rad.sin();

                let mut active_line_polys: Vec<Vec<[i32; 2]>> = cluster_lines.iter().map(|l| l.polygon.clone()).collect();
                let mut combined_text = format_lines_cluster(&cluster_lines, is_cjk, is_container_vert, sin_a, cos_a);
                let mut avg_score = cluster_lines.iter().map(|l| l.score).sum::<f32>() / cluster_lines.len() as f32;

                // COMPUTE TIGHT BOUNDS OF THIS CLUSTER
                let mut c_min_x = i32::MAX;
                let mut c_min_y = i32::MAX;
                let mut c_max_x = i32::MIN;
                let mut c_max_y = i32::MIN;
                for l in &cluster_lines {
                    let (lx, ly, lw, lh) = polygon_bounds(&l.polygon);
                    c_min_x = c_min_x.min(lx);
                    c_min_y = c_min_y.min(ly);
                    c_max_x = c_max_x.max(lx + lw);
                    c_max_y = c_max_y.max(ly + lh);
                }
                let cluster_rect = BoxRect {
                    x: c_min_x.max(0),
                    y: c_min_y.max(0),
                    w: (c_max_x - c_min_x).max(1),
                    h: (c_max_y - c_min_y).max(1),
                };

                // REFINEMENT VIA TARGETED CROP RECOGNITION
                if let Some(refined) = try_refine_cluster_crop(
                    ocr,
                    img,
                    &box_rect,
                    &cluster_rect,
                    &cluster_lines,
                    &combined_text,
                    avg_score,
                    angle_deg,
                    is_container_vert,
                    is_bubble_region,
                    is_cjk,
                    source_lang,
                    page_w,
                    page_h,
                ) {
                    combined_text = refined.text;
                    avg_score = refined.avg_score;
                    if !refined.active_line_polys.is_empty() {
                        active_line_polys = refined.active_line_polys;
                        is_container_vert = refined.is_container_vert;
                        angle_deg = refined.angle_deg;
                    }
                }

                let is_cluster_in_bubble = is_bubble_region || matched_bubble.is_some() || bubbles.iter().any(|b| {
                    let cx = cluster_rect.x + cluster_rect.w / 2;
                    let cy = cluster_rect.y + cluster_rect.h / 2;
                    cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h
                });

                let cleaned = combined_text.trim().to_string();
                if should_reject_candidate_region(
                    &cleaned,
                    &cluster_rect,
                    avg_score,
                    angle_deg,
                    is_cluster_in_bubble,
                    is_cjk,
                    source_lang,
                    img,
                    page_w,
                    page_h,
                    split_lines,
                    bubbles,
                ) {
                    continue;
                }

                let is_detector_vert = box_rect.h >= (box_rect.w as f32 * 1.35) as i32;
                // COUNT ONLY MEANINGFUL GLYPHS (NEWLINE / WHITESPACE SEPARATORS BETWEEN VERTICAL STACKED SYLLABLES ARE NOT CHARACTERS)
                let glyph_count = cleaned.chars().filter(|c| !c.is_whitespace()).count();
                if is_detector_vert && glyph_count <= 4 {
                    is_container_vert = true;
                    if angle_deg.abs() < 3.5 {
                        angle_deg = 0.0;
                    }
                }

                let vertical = is_container_vert;
                let angle = angle_deg;

                let final_box_rect = if !active_line_polys.is_empty() {
                    let mut min_x = i32::MAX;
                    let mut min_y = i32::MAX;
                    let mut max_x = i32::MIN;
                    let mut max_y = i32::MIN;
                    for poly in &active_line_polys {
                        for p in poly {
                            min_x = min_x.min(p[0]);
                            min_y = min_y.min(p[1]);
                            max_x = max_x.max(p[0]);
                            max_y = max_y.max(p[1]);
                        }
                    }

                    let max_horiz_pad = if is_container_vert || is_detector_vert { 60 } else { 30 };
                    if (box_rect.x + box_rect.w) > max_x && (box_rect.x + box_rect.w - max_x) <= max_horiz_pad && min_x >= box_rect.x - 25 {
                        max_x = max_x.max(box_rect.x + box_rect.w);
                    }

                    if (box_rect.x < min_x) && (min_x - box_rect.x) <= 160 && (box_rect.y <= min_y + 15 && box_rect.y + box_rect.h >= max_y - 15) {
                        min_x = min_x.min(box_rect.x);
                    }

                    if (box_rect.y < min_y) && (min_y - box_rect.y) <= 45 && (box_rect.x <= min_x + 15 && box_rect.x + box_rect.w >= max_x - 15) {
                        min_y = min_y.min(box_rect.y);
                    } else if (is_container_vert || is_detector_vert || matched_bubble.is_some()) && box_rect.y < min_y && (min_y - box_rect.y) <= 400 {
                        min_y = min_y.min(box_rect.y);
                    }

                    let max_vert_trailing_pad = ((box_rect.h as f32 * 0.50).round() as i32).max(180);
                    if (is_container_vert || is_detector_vert) && (box_rect.y + box_rect.h) > max_y && (box_rect.y + box_rect.h - max_y) <= max_vert_trailing_pad {
                        max_y = max_y.max(box_rect.y + box_rect.h);
                    } else if matched_bubble.is_some() && (box_rect.y + box_rect.h) > max_y && (box_rect.y + box_rect.h - max_y) <= 25 && min_x >= box_rect.x - 10 && max_x <= box_rect.x + box_rect.w + 10 {
                        max_y = max_y.max(box_rect.y + box_rect.h);
                    }

                    let fx = min_x.max(0);
                    let fy = min_y.max(0);
                    let fw = (max_x - min_x).max(1).min(page_w as i32 - fx);
                    let fh = (max_y - min_y).max(1).min(page_h as i32 - fy);

                    BoxRect { x: fx, y: fy, w: fw, h: fh }
                } else {
                    cluster_rect
                };

                let inpaint_box = Some(expand_box(&final_box_rect, inpaint_pct, page_w, page_h));
                let typeset_box = Some(expand_box(&final_box_rect, typeset_pct, page_w, page_h));

                let text_polygon = if angle.abs() >= 1.5 && !active_line_polys.is_empty() {
                    let mut min_u = f32::MAX;
                    let mut max_u = f32::MIN;
                    let mut min_v = f32::MAX;
                    let mut max_v = f32::MIN;
                    for poly in &active_line_polys {
                        for p in poly {
                            let px = p[0] as f32;
                            let py = p[1] as f32;
                            let u = px * cos_a + py * sin_a;
                            let v = -px * sin_a + py * cos_a;
                            min_u = min_u.min(u);
                            max_u = max_u.max(u);
                            min_v = min_v.min(v);
                            max_v = max_v.max(v);
                        }
                    }
                    let u_v_corners = [
                        (min_u, min_v),
                        (max_u, min_v),
                        (max_u, max_v),
                        (min_u, max_v),
                    ];
                    u_v_corners
                        .iter()
                        .map(|&(u, v)| {
                            let rx = u * cos_a - v * sin_a;
                            let ry = u * sin_a + v * cos_a;
                            [rx.round() as i32, ry.round() as i32]
                        })
                        .collect()
                } else {
                    vec![
                        [final_box_rect.x, final_box_rect.y],
                        [final_box_rect.x + final_box_rect.w, final_box_rect.y],
                        [final_box_rect.x + final_box_rect.w, final_box_rect.y + final_box_rect.h],
                        [final_box_rect.x, final_box_rect.y + final_box_rect.h],
                    ]
                };

                let matched_bubble_final = if matched_bubble.is_some() {
                    matched_bubble.cloned()
                } else {
                    let f_area = (final_box_rect.w * final_box_rect.h).max(1);
                    bubbles.iter().find(|b| {
                        let ix = (final_box_rect.x + final_box_rect.w).min(b.x + b.w) - final_box_rect.x.max(b.x);
                        let iy = (final_box_rect.y + final_box_rect.h).min(b.y + b.h) - final_box_rect.y.max(b.y);
                        if ix > 0 && iy > 0 {
                            let inter = (ix * iy) as f32;
                            inter / f_area as f32 >= 0.60
                        } else {
                            false
                        }
                    }).cloned()
                };

                let final_kind = if matched_bubble_final.is_some() {
                    RegionKind::DialogueBubble
                } else {
                    kind
                };

                let bubble_box = matched_bubble_final;
                let bubble_polygon = bubble_box.as_ref().map(|b| vec![
                    [b.x, b.y],
                    [b.x + b.w, b.y],
                    [b.x + b.w, b.y + b.h],
                    [b.x, b.y + b.h],
                ]);

                let centroid = if let Some(ref bb) = bubble_box {
                    Some(Point2D {
                        x: bb.x as f32 + bb.w as f32 / 2.0,
                        y: bb.y as f32 + bb.h as f32 / 2.0,
                    })
                } else {
                    Some(Point2D {
                        x: final_box_rect.x as f32 + final_box_rect.w as f32 / 2.0,
                        y: final_box_rect.y as f32 + final_box_rect.h as f32 / 2.0,
                    })
                };

                regions.push(Region {
                    id: format!("r{}", regions.len()),
                    box_: final_box_rect,
                    polygon: text_polygon,
                    inpaint_box,
                    typeset_box,
                    text: cleaned,
                    confidence: avg_score,
                    vertical,
                    angle,
                    bubble_box,
                    bubble_polygon,
                    centroid,
                    kind: final_kind,
                    is_title: false,
                    is_subtitle: false,
                });
            }
        } else {
            // FALLBACK: TARGETED ISOLATED RECOGNITION CROP FOR MISSED CANDIDATE CONTAINER
            if let Some(fallback) = run_fallback_crop_recognition(
                ocr,
                img,
                &box_rect,
                is_bubble_region,
                is_container_vert,
                source_lang,
                page_w,
                page_h,
            ) {
                let cleaned = fallback.text.trim().to_string();
                if should_reject_candidate_region(
                    &cleaned,
                    &box_rect,
                    fallback.score,
                    angle_deg,
                    is_bubble_region,
                    is_cjk,
                    source_lang,
                    img,
                    page_w,
                    page_h,
                    split_lines,
                    bubbles,
                ) {
                    continue;
                }

                let final_box_rect = if !fallback.polys.is_empty() {
                    let mut min_x = i32::MAX;
                    let mut min_y = i32::MAX;
                    let mut max_x = i32::MIN;
                    let mut max_y = i32::MIN;
                    for poly in &fallback.polys {
                        for p in poly {
                            min_x = min_x.min(p[0]);
                            min_y = min_y.min(p[1]);
                            max_x = max_x.max(p[0]);
                            max_y = max_y.max(p[1]);
                        }
                    }
                    let fx = min_x.max(0);
                    let fy = min_y.max(0);
                    let fw = (max_x - min_x).max(1).min(page_w as i32 - fx);
                    let fh = (max_y - min_y).max(1).min(page_h as i32 - fy);
                    BoxRect { x: fx, y: fy, w: fw, h: fh }
                } else {
                    box_rect
                };

                let inpaint_box = Some(expand_box(&final_box_rect, inpaint_pct, page_w, page_h));
                let typeset_box = Some(expand_box(&final_box_rect, typeset_pct, page_w, page_h));

                let text_polygon = vec![
                    [final_box_rect.x, final_box_rect.y],
                    [final_box_rect.x + final_box_rect.w, final_box_rect.y],
                    [final_box_rect.x + final_box_rect.w, final_box_rect.y + final_box_rect.h],
                    [final_box_rect.x, final_box_rect.y + final_box_rect.h],
                ];

                let bubble_box = matched_bubble.cloned();
                let bubble_polygon = bubble_box.as_ref().map(|b| vec![
                    [b.x, b.y],
                    [b.x + b.w, b.y],
                    [b.x + b.w, b.y + b.h],
                    [b.x, b.y + b.h],
                ]);

                let centroid = if let Some(ref bb) = bubble_box {
                    Some(Point2D {
                        x: bb.x as f32 + bb.w as f32 / 2.0,
                        y: bb.y as f32 + bb.h as f32 / 2.0,
                    })
                } else {
                    Some(Point2D {
                        x: final_box_rect.x as f32 + final_box_rect.w as f32 / 2.0,
                        y: final_box_rect.y as f32 + final_box_rect.h as f32 / 2.0,
                    })
                };

                regions.push(Region {
                    id: format!("r{}", regions.len()),
                    box_: final_box_rect,
                    polygon: text_polygon,
                    inpaint_box,
                    typeset_box,
                    text: cleaned,
                    confidence: fallback.score,
                    vertical: is_container_vert,
                    angle: angle_deg,
                    bubble_box,
                    bubble_polygon,
                    centroid,
                    kind,
                    is_title: false,
                    is_subtitle: false,
                });
            }
        }
    }

    // DEDUPLICATE & UNIFY SLANTED STATUS CARD REGIONS
    let mut deduped_regions = deduplicate_and_unify_regions(regions, img, page_w, page_h, inpaint_pct, typeset_pct);

    // EXPAND DIALOGUE-BUBBLE TEXT BASE BOUNDARY TO UTILIZE UNUSED BUBBLE AREA (BUBBLE TEXT ONLY)
    expand_bubble_text_boxes(&mut deduped_regions, Some(img), page_w, page_h, inpaint_pct, typeset_pct);

    deduped_regions
}
