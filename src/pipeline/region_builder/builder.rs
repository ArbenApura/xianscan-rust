// -- CRATE / EXTERNAL IMPORTS -- //
use image::DynamicImage;

// -- INTERNAL IMPORTS -- //
use crate::ml::geometry::{
    box_iou, box_iou_pts, calculate_box_angle, calculate_box_angle_i32,
    line_center_inside_box, polygon_bounds,
};
use crate::ml::ocr::{OcrLine, RapidOcr};
use crate::ml::schemas::{BoxRect, Region, RegionKind};
use super::clustering::{cluster_lines_into_utterances, format_lines_cluster};
use super::geometry::{compute_chromatic_color_variance, expand_box};

// -- FUNCTIONS & ALGORITHMS -- //

/// BUILD FINAL REGIONS FROM DETECTED CONTAINERS AND OCR LINES (PURE 2-STAGE NEURAL PIPELINE)
pub fn build_regions(
    ocr: &mut Option<RapidOcr>,
    img: &DynamicImage,
    dedup_boxes: &[Vec<[f32; 2]>],
    order: &[usize],
    split_lines: &[OcrLine],
    bubbles: &[BoxRect],
    text_free_boxes: &[(BoxRect, f32)],
    page_w: u32,
    page_h: u32,
    is_cjk: bool,
    _is_latin: bool,
    source_lang: Option<&str>,
    inpaint_padding_pct: Option<f32>,
    typeset_padding_pct: Option<f32>,
) -> Vec<Region> {
    let inpaint_pct = inpaint_padding_pct.unwrap_or(0.06);
    let typeset_pct = typeset_padding_pct.unwrap_or(0.12);
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

        // CONTAINER & BUBBLE ASSOCIATION (REQUIRES >= 75% OF TEXT BOX INSIDE BUBBLE)
        let (bx, by, bw, bh) = (box_rect.x, box_rect.y, box_rect.w, box_rect.h);
        let box_area = (bw * bh).max(1);

        let matched_bubble = bubbles.iter().find(|b| {
            let inter_x = (bx + bw).min(b.x + b.w) - bx.max(b.x);
            let inter_y = (by + bh).min(b.y + b.h) - by.max(b.y);
            if inter_x > 0 && inter_y > 0 {
                let inter_area = inter_x * inter_y;
                let coverage = inter_area as f32 / box_area as f32;
                coverage >= 0.75
            } else {
                false
            }
        });

        let mid_x = box_rect.x + box_rect.w / 2;
        let mid_y = box_rect.y + box_rect.h / 2;

        let is_detector_sfx = text_free_boxes.iter().any(|(tf, _)| {
            let iou = box_iou(tf, &box_rect);
            let contains = mid_x >= tf.x && mid_x <= tf.x + tf.w && mid_y >= tf.y && mid_y <= tf.y + tf.h;
            let ix = (box_rect.x + box_rect.w).min(tf.x + tf.w) - box_rect.x.max(tf.x);
            let iy = (box_rect.y + box_rect.h).min(tf.y + tf.h) - box_rect.y.max(tf.y);
            let overlap = if ix > 0 && iy > 0 {
                let inter = (ix * iy) as f32;
                let b_area = (box_rect.w * box_rect.h).max(1) as f32;
                let tf_area = (tf.w * tf.h).max(1) as f32;
                inter / b_area >= 0.25 || inter / tf_area >= 0.25
            } else {
                false
            };
            iou >= 0.25 || contains || overlap
        });

        let is_sfx = is_detector_sfx;
        let is_bubble_region = matched_bubble.is_some();

        let mut kind = if is_bubble_region {
            RegionKind::DialogueBubble
        } else if is_sfx {
            RegionKind::SoundEffect
        } else {
            RegionKind::FreeText
        };

        // MATCH OCR LINES WHOSE CENTER SITS INSIDE THIS CANDIDATE BOX
        let matched: Vec<&OcrLine> = split_lines
            .iter()
            .filter(|l| {
                let (lx, ly, lw, lh) = polygon_bounds(&l.polygon);
                // AN OCR LINE THAT IS SIGNIFICANTLY WIDER THAN THE CONTAINER BOX (LW >= 2.20 * BOX_RECT.W)
                // IS A CROSS-CONTAINER SPANNED LINE AND SHOULD NOT BE MATCHED TO THIS SUB-CONTAINER.
                if lw >= (box_rect.w as f32 * 2.20) as i32 && box_rect.w >= 40 && !is_sfx {
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
                // WHEN BOTH HORIZONTAL AND VERTICAL DETECTIONS COEXIST, SELECT DOMINANT PARAGRAPH ORIENTATION
                v_area > (h_area as f32 * 1.30) as i64 && v_count > h_count
            } else {
                v_count > h_count
            };

            // PRUNE PERPENDICULAR PHANTOM SLICES THAT CONFLICT WITH DOMINANT ORIENTATION
            let mut orientation_filtered: Vec<&OcrLine> = if h_count > 0 && v_count > 0 {
                matched.iter().copied().filter(|m| {
                    let (_, _, lw, lh) = polygon_bounds(&m.polygon);
                    let is_line_vert = lh > (lw as f32 * 1.25) as i32;
                    is_line_vert == is_container_vert
                }).collect()
            } else {
                matched.clone()
            };

            // IN CONTAINERS WITH A HIGH-CONFIDENCE DOMINANT LINE (SCORE >= 0.70), SUPPRESS WEAK BACKGROUND NOISE LINES
            let max_score = orientation_filtered.iter().map(|l| l.score).fold(0.0f32, f32::max);
            if max_score >= 0.70 {
                orientation_filtered.retain(|l| l.score >= 0.60 || l.score >= max_score * 0.85);
            }

            let mut filtered_matched: Vec<&OcrLine> = Vec::new();
            // In CJK mode, sanitize OCR lines with trailing noise strokes after a newline (e.g. "text...\n00o0")
            let mut sanitized_lines: Vec<OcrLine> = Vec::new();
            for &m in &orientation_filtered {
                let clean_m = m.text.trim();
                if clean_m.is_empty() {
                    continue;
                }
                if is_cjk && clean_m.contains('\n') {
                    let parts: Vec<&str> = clean_m.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
                    if parts.len() == 2 && crate::ml::detect::has_cjk_characters(parts[0]) {
                        let second = parts[1];
                        let is_second_noise = crate::ml::detect::is_standalone_noise_stroke(second)
                            || (second.chars().count() <= 6 && second.chars().all(|c| c == '0' || c == 'o' || c == 'O' || c.is_ascii_digit()));
                        if is_second_noise {
                            let mut clone_line = m.clone();
                            clone_line.text = parts[0].to_string();
                            sanitized_lines.push(clone_line);
                            continue;
                        }
                    }
                }
                sanitized_lines.push(m.clone());
            }

            for m in &sanitized_lines {
                let clean_m = m.text.trim();
                if clean_m.is_empty() {
                    continue;
                }
                // SUPPRESS INDIVIDUAL WATERMARK LINES INSIDE CONTAINER (E.G. COLLIDING BANNER WATERMARKS)
                if crate::ml::detect::is_watermark_line(clean_m) {
                    continue;
                }
                let (mx, my, mw, mh) = polygon_bounds(&m.polygon);
                let mut is_dup = false;
                for existing in &filtered_matched {
                    let clean_o = existing.text.trim();
                    let (ox, oy, ow, oh) = polygon_bounds(&existing.polygon);
                    let iou = box_iou_pts(&m.polygon, &existing.polygon);
                    let is_exact = clean_m == clean_o;
                    let is_sub = clean_o.contains(clean_m) && clean_o.chars().count() > clean_m.chars().count();
                    let overlap_x = (mx + mw).min(ox + ow) - mx.max(ox);
                    let overlap_y = (my + mh).min(oy + oh) - my.max(oy);
                    let overlap_area = overlap_x.max(0) * overlap_y.max(0);
                    let m_area = (mw * mh).max(1);
                    let overlap_ratio_m = overlap_area as f32 / m_area as f32;

                    // IN VERTICAL TEXT, LINES THAT SHARE COLUMN SPAN (VERTICAL OVERLAP >= 50%) AND HAVE OVERLAPPING CHARACTER STEMS OR LOWER CONFIDENCE ARE ECHOES
                    let vert_col_overlap = if is_container_vert && mh > 0 && oh > 0 {
                        overlap_y.max(0) as f32 / mh.min(oh) as f32 >= 0.50 && overlap_x >= -30
                    } else {
                        false
                    };

                    // IN HORIZONTAL CJK TEXT, A TINY TRAILING SINGLE-DIGIT / NOISE SLICE OVERLAPPING THE RIGHT EDGE OF A LONGER SENTENCE IS AN OCR ECHO
                    let is_horizontal_suffix_noise = !is_container_vert
                        && clean_m.chars().count() == 1
                        && clean_m.chars().all(|c| c.is_ascii_digit())
                        && clean_o.chars().count() >= 6
                        && mx >= ox + (ow * 3 / 4)
                        && overlap_y.max(0) as f32 / mh.min(oh).max(1) as f32 >= 0.50;

                    if (iou >= 0.40 || overlap_ratio_m >= 0.60 || (vert_col_overlap && is_sub) || is_horizontal_suffix_noise) && (is_exact || is_sub || is_horizontal_suffix_noise) {
                        is_dup = true;
                        break;
                    }
                }
                if !is_dup {
                    // ALSO PRUNE SHORTER SUBSTRING LINES ALREADY IN FILTERED_MATCHED IF M IS MORE COMPLETE
                    filtered_matched.retain(|existing| {
                        let clean_o = existing.text.trim();
                        let (ox, oy, ow, oh) = polygon_bounds(&existing.polygon);
                        let iou = box_iou_pts(&m.polygon, &existing.polygon);
                        let is_existing_sub = clean_m.contains(clean_o) && clean_m.chars().count() > clean_o.chars().count();
                        let overlap_x = (mx + mw).min(ox + ow) - mx.max(ox);
                        let overlap_y = (my + mh).min(oy + oh) - my.max(oy);
                        let vert_col_overlap = if is_container_vert && mh > 0 && oh > 0 {
                            overlap_y.max(0) as f32 / mh.min(oh) as f32 >= 0.50 && overlap_x >= -30
                        } else {
                            false
                        };
                        let is_existing_suffix_noise = !is_container_vert
                            && clean_o.chars().count() == 1
                            && clean_o.chars().all(|c| c.is_ascii_digit())
                            && clean_m.chars().count() >= 6
                            && ox >= mx + (mw * 3 / 4)
                            && overlap_y.max(0) as f32 / mh.min(oh).max(1) as f32 >= 0.50;

                        !(((iou >= 0.40 || vert_col_overlap) && is_existing_sub) || is_existing_suffix_noise)
                    });
                    filtered_matched.push(m);
                }
            }

            let clusters = cluster_lines_into_utterances(&filtered_matched, is_cjk, is_sfx, is_container_vert, 0.0, 1.0);

            for cluster_lines in clusters {
                if cluster_lines.is_empty() {
                    continue;
                }
                let box_angle = calculate_box_angle(box_pts);
                let line_angles: Vec<f32> = cluster_lines
                    .iter()
                    .filter_map(|l| {
                        let (_, _, lw, lh) = polygon_bounds(&l.polygon);
                        if lw >= 40 || lh >= 40 {
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

                angle_deg = if matched_bubble.is_some() || is_container_vert {
                    0.0
                } else if !cluster_lines.is_empty() && median_line_angle.abs() < 1.5 && box_angle.abs() < 8.0 {
                    // Lines are horizontal, ignore noisy detector box slant
                    0.0
                } else if !cluster_lines.is_empty() && median_line_angle.abs() >= 1.5 {
                    // If constituent OCR line(s) have clear orientation angle, prefer line angle
                    if median_line_angle.abs() < 3.5 && (box_angle == 0.0 || (box_angle.abs() < 1.5)) {
                        0.0
                    } else {
                        median_line_angle
                    }
                } else if box_angle.abs() >= 1.5 {
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

                // IF FULL-PAGE OCR MISSED CHARACTERS IN A BUBBLE OR WIDE/TALL CANDIDATE CONTAINER (E.G. TRAILING ELLIPSIS), ATTEMPT CROP RECOGNITION REFINEMENT
                let container_w = box_rect.w;
                let container_h = box_rect.h;
                let is_container_wider = container_w >= cluster_rect.w + 20 || (container_w as f32) >= (cluster_rect.w as f32 * 1.20);
                let is_container_taller = container_h >= cluster_rect.h + 20 || (container_h as f32) >= (cluster_rect.h as f32 * 1.20);
                let is_short_text_partial = cluster_lines.len() == 1 && (is_container_wider || is_container_taller);
                let full_page_is_complete = cluster_lines.len() >= 3 && avg_score >= 0.70 && !is_container_wider && !is_container_taller;
                let is_standalone_alphanumeric_risk = is_cjk && crate::ml::detect::is_standalone_alphanumeric_without_cjk(&combined_text);
                let can_refine_crop = (is_bubble_region || is_container_wider || is_container_taller || is_short_text_partial || is_standalone_alphanumeric_risk) && (cluster_rect.w >= 16 || box_rect.w >= 16) && (cluster_rect.h >= 16 || box_rect.h >= 16) && !full_page_is_complete;

                if can_refine_crop {
                    // ENCOMPASS CANDIDATE CONTAINER BOUNDARY
                    let target_rect = if is_bubble_region || (is_container_taller && cluster_lines.len() <= 2) || (is_container_wider && cluster_lines.len() <= 2) || (is_standalone_alphanumeric_risk && cluster_lines.len() <= 2) {
                        BoxRect {
                            x: cluster_rect.x.min(box_rect.x),
                            y: cluster_rect.y.min(box_rect.y),
                            w: (cluster_rect.x + cluster_rect.w).max(box_rect.x + box_rect.w) - cluster_rect.x.min(box_rect.x),
                            h: (cluster_rect.y + cluster_rect.h).max(box_rect.y + box_rect.h) - cluster_rect.y.min(box_rect.y),
                        }
                    } else {
                        cluster_rect.clone()
                    };
                    let pad_x = if is_container_vert { 8 } else { 16 };
                    let pad_y = if is_container_vert { 16 } else { 8 };
                    let crop_x = (target_rect.x - pad_x).max(0) as u32;
                    let crop_y = (target_rect.y - pad_y).max(0) as u32;
                    let crop_w = ((target_rect.w + pad_x * 2) as u32).min(page_w - crop_x);
                    let crop_h = ((target_rect.h + pad_y * 2) as u32).min(page_h - crop_y);
                    if crop_w >= 16 && crop_h >= 16 {
                        if let Some(ref mut o) = ocr {
                            let crop = img.crop_imm(crop_x, crop_y, crop_w, crop_h);
                            if let Ok(Some(res)) = o.recognize_crop_with_lang(&crop, source_lang) {
                                let mut valid_crop_lines: Vec<_> = if is_cjk {
                                    res.lines
                                        .iter()
                                        .filter(|(_, text, score)| {
                                             let t = text.trim();
                                            if t.is_empty() {
                                                return false;
                                            }
                                            if crate::ml::detect::is_watermark_line(t) {
                                                return false;
                                            }
                                            if crate::ml::detect::is_standalone_alphanumeric_without_cjk(t) && t.chars().count() <= 5 && *score < 0.85 {
                                                return false;
                                            }
                                            true
                                        })
                                        .cloned()
                                        .collect()
                                } else {
                                    res.lines
                                        .iter()
                                        .filter(|(_, text, _)| !crate::ml::detect::is_watermark_line(text.trim()))
                                        .cloned()
                                        .collect()
                                };

                                // DEDUPLICATE INTERNAL SUBSTRING / FRAGMENTED LINES INSIDE THE CROP
                                let mut dedup_crop_lines: Vec<(Vec<[i32; 2]>, String, f32)> = Vec::new();
                                for line in &valid_crop_lines {
                                    let clean_l = line.1.trim();
                                    let is_dup = dedup_crop_lines.iter().any(|existing| {
                                        let clean_e = existing.1.trim();
                                        clean_e == clean_l || (clean_e.contains(clean_l) && clean_e.chars().count() > clean_l.chars().count())
                                    });
                                    if !is_dup {
                                        dedup_crop_lines.retain(|existing| {
                                            let clean_e = existing.1.trim();
                                            !(clean_l.contains(clean_e) && clean_l.chars().count() > clean_e.chars().count())
                                        });
                                        dedup_crop_lines.push(line.clone());
                                    }
                                }

                                // IF CROP CONTAINS A DOMINANT HIGH-CONFIDENCE SENTENCE LINE (SCORE >= 0.70), SUPPRESS LOW-CONFIDENCE NOISE FRAGMENTS
                                let crop_max_score = dedup_crop_lines.iter().map(|l| l.2).fold(0.0f32, f32::max);
                                if crop_max_score >= 0.70 {
                                    dedup_crop_lines.retain(|l| l.2 >= 0.62 || l.2 >= crop_max_score * 0.85);
                                }

                                // SORT CROP LINES IN READING ORDER
                                if is_container_vert {
                                    dedup_crop_lines.sort_by(|a, b| {
                                        let (ax, ay, _, _) = polygon_bounds(&a.0);
                                        let (bx, by, _, _) = polygon_bounds(&b.0);
                                        bx.cmp(&ax).then_with(|| ay.cmp(&by))
                                    });
                                } else {
                                    dedup_crop_lines.sort_by(|a, b| {
                                        let (_, ay, _, _) = polygon_bounds(&a.0);
                                        let (_, by, _, _) = polygon_bounds(&b.0);
                                        ay.cmp(&by)
                                    });
                                }
                                valid_crop_lines = dedup_crop_lines;

                                let clean_crop_text = if !valid_crop_lines.is_empty() {
                                    valid_crop_lines.iter().map(|(_, t, _)| t.clone()).collect::<Vec<_>>().join("\n")
                                } else {
                                    res.text.trim().to_string()
                                };

                                let crop_cjk_count = clean_crop_text.chars().filter(|c| !c.is_whitespace()).count();
                                let combined_cjk_count = combined_text.chars().filter(|c| !c.is_whitespace()).count();
                                let has_more_ellipsis = (clean_crop_text.contains('…') && !combined_text.contains('…')) || (clean_crop_text.contains("..") && !combined_text.contains(".."));

                                // IF THE CROP RESULT MERGED LINES ACROSS MULTIPLE SEPARATE DIALOGUE SENTENCES, DO NOT REPLACE
                                let is_excessive_expansion = matched_bubble.is_none() && combined_cjk_count >= 3 && crop_cjk_count >= (combined_cjk_count * 5 / 2);

                                let is_improved = if is_cjk {
                                    !is_excessive_expansion && (
                                        crop_cjk_count > combined_cjk_count
                                            || has_more_ellipsis
                                            || (crop_cjk_count == combined_cjk_count && res.score > avg_score + 0.02)
                                            || (res.score >= 0.70 && avg_score < 0.60)
                                    )
                                } else {
                                    let crop_alphanumeric = clean_crop_text.chars().filter(|c| c.is_alphanumeric()).count();
                                    let combined_alphanumeric = combined_text.chars().filter(|c| c.is_alphanumeric()).count();
                                    let crop_chars = clean_crop_text.chars().filter(|c| !c.is_whitespace()).count();
                                    let combined_chars = combined_text.chars().filter(|c| !c.is_whitespace()).count();
                                    let has_meaningful_more_text = crop_alphanumeric > combined_alphanumeric || (crop_alphanumeric == combined_alphanumeric && crop_chars > combined_chars && (has_more_ellipsis || !clean_crop_text.ends_with("??")));
                                    !is_excessive_expansion && (
                                        has_meaningful_more_text
                                            || has_more_ellipsis
                                            || (crop_chars == combined_chars && res.score > avg_score + 0.02)
                                            || (res.score >= 0.70 && avg_score < 0.60)
                                    )
                                };

                                if is_improved && !clean_crop_text.is_empty() {
                                    let is_slanted_multiline_block = cluster_lines.len() >= 3 && angle_deg.abs() >= 1.5 && valid_crop_lines.len() <= 2;
                                    combined_text = clean_crop_text;
                                    avg_score = res.score;
                                    if !valid_crop_lines.is_empty() && !is_slanted_multiline_block {
                                        active_line_polys.clear();
                                        let mut crop_v_count = 0;
                                        let mut crop_h_count = 0;
                                        for (line_poly, _, _) in &valid_crop_lines {
                                            let page_poly: Vec<[i32; 2]> = line_poly
                                                .iter()
                                                .map(|p| [(p[0] + crop_x as i32).max(0), (p[1] + crop_y as i32).max(0)])
                                                .collect();
                                            let (_, _, pw, ph) = polygon_bounds(&page_poly);
                                            if ph > (pw as f32 * 1.25) as i32 {
                                                crop_v_count += 1;
                                            } else {
                                                crop_h_count += 1;
                                            }
                                            active_line_polys.push(page_poly);
                                        }
                                        if crop_v_count > 0 || crop_h_count > 0 {
                                            is_container_vert = crop_v_count > crop_h_count;
                                            if is_container_vert {
                                                angle_deg = 0.0;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                let cleaned = combined_text.trim().to_string();
                let is_sfx = is_detector_sfx || (matched_bubble.is_none() && crate::ml::detect::is_onomatopoeia_or_shout(&cleaned));
                if cleaned.is_empty() && !is_sfx {
                    continue;
                }

                // 1. DROP GIANT ARTWORK HALLUCINATIONS OR SPRAWLING NOISE BOXES
                if matched_bubble.is_none() && cluster_rect.w >= 300 && cluster_rect.h >= 500 && avg_score < 0.65 {
                    continue;
                }
                if matched_bubble.is_none() && !is_sfx {
                    if cluster_rect.w >= (page_w as f32 * 0.65) as i32 && cluster_rect.h >= 120 {
                        continue;
                    }
                }

                // 2. DROP HIGH-TILT NON-DIALOGUE WITH LOW RECOGNITION CONFIDENCE
                if matched_bubble.is_none() && angle_deg.abs() >= 12.0 && avg_score < 0.65 && !is_sfx {
                    continue;
                }

                if !cleaned.is_empty() {
                    // 3. DROP STANDALONE REPEATED NOISE STROKES
                    if crate::ml::detect::is_standalone_noise_stroke(&cleaned) {
                        continue;
                    }
                    if is_cjk && !is_sfx && !is_detector_sfx && crate::ml::detect::is_standalone_alphanumeric_without_cjk(&cleaned) {
                        let char_count = cleaned.chars().filter(|c| !c.is_whitespace()).count();
                        let is_sparse_giant_box = matched_bubble.is_none() && (cluster_rect.w >= 100 || cluster_rect.h >= 100) && char_count <= 4;
                        let is_short_noise_code = matched_bubble.is_none()
                            && char_count <= 3
                            && !crate::ml::detect::is_onomatopoeia_or_shout(&cleaned)
                            && !(cluster_rect.w >= 45 && cluster_rect.h >= 25 && (cleaned.contains('Z') || cleaned.contains('z') || cleaned.contains('S') || cleaned.contains('A')));
                        if cluster_rect.h <= 15
                            || is_sparse_giant_box
                            || is_short_noise_code
                            || (matched_bubble.is_none() && cluster_rect.w <= 35 && cluster_rect.h <= 35)
                            || (matched_bubble.is_none() && avg_score < 0.70 && !(cluster_rect.w >= 45 && cluster_rect.h >= 25 && (cleaned.contains('Z') || cleaned.contains('z') || cleaned.contains('S') || cleaned.contains('A'))))
                            || (matched_bubble.is_none() && cleaned.chars().count() == 1 && !is_sfx && !(cluster_rect.w >= 45 && cluster_rect.h >= 25 && (cleaned == "Z" || cleaned == "z" || cleaned == "S" || cleaned == "s" || cleaned == "A" || cleaned == "B")))
                        {
                            continue;
                        }
                    }
                    if !is_sfx && !is_detector_sfx && crate::ml::detect::is_pure_watermark_region(&cleaned) {
                        continue;
                    }
                    if is_cjk && (cluster_rect.y + cluster_rect.h >= page_h as i32 - 50) && cleaned.chars().count() == 1 && (cleaned == "动" || cleaned == "初" || cleaned == "腾" || cleaned == "漫" || cleaned == "漫客" || cleaned == "客") {
                        continue;
                    }
                    // SUPPRESS LOW-CONFIDENCE ISOLATED SINGLE-CHARACTER ARTWORK ARTIFACTS
                    let is_sign_or_narration_box = cluster_rect.w >= 60 && cluster_rect.h >= 40 && (cleaned.contains("市") || cleaned.contains("省") || cleaned.contains("县") || cleaned.contains("区") || cleaned.contains("镇") || cleaned.contains("村") || cleaned.contains("室") || cleaned.contains("馆") || cleaned.contains("部") || cleaned.contains("堂") || cleaned.contains("院") || cleaned.contains("校") || cleaned.contains("门"));
                    let is_margin_isolated_char = (cluster_rect.x <= 5 || cluster_rect.x + cluster_rect.w >= page_w as i32 - 5) && avg_score < 0.75;
                    if cleaned.chars().count() == 1 && matched_bubble.is_none() && !is_sfx && !is_detector_sfx && !is_sign_or_narration_box && (!crate::ml::detect::is_onomatopoeia_or_shout(&cleaned) || avg_score < 0.60) && (compute_chromatic_color_variance(img, &cluster_rect) >= 15.0 || is_margin_isolated_char || (avg_score < 0.75 && cluster_rect.w <= 40 && cluster_rect.h <= 40)) {
                        continue;
                    }
                    // SUPPRESS FOLIAGE NOISE / CHROMATIC BACKGROUND TEXTURE ON TINY STROKE FRAGMENTS
                    if matched_bubble.is_none() && !is_detector_sfx && !is_sfx && cluster_rect.w <= 40 && cluster_rect.h <= 55 && compute_chromatic_color_variance(img, &cluster_rect) >= 15.0 {
                        continue;
                    }
                    // SUPPRESS TINY SUB-PIXEL / NOISE FRAGMENTS
                    if cluster_rect.w <= 15 && cluster_rect.h <= 15 {
                        continue;
                    }
                    // SUPPRESS TINY ISOLATED NON-BUBBLE STROKE FRAGMENTS
                    if matched_bubble.is_none() && !is_detector_sfx && !is_sfx && cluster_rect.w <= 40 && cluster_rect.h <= 55 {
                        continue;
                    }
                    // SUPPRESS OPTICAL BORDER SLIVERS
                    if matched_bubble.is_none() && !is_sfx && cluster_rect.w <= 35 && cluster_rect.h >= 60 && avg_score < 0.60 {
                        continue;
                    }
                    // SUPPRESS LOW-CONFIDENCE ISOLATED PSEUDO-WORD HALLUCINATIONS ON COMPLEX BACKGROUND ARTWORK
                    if matched_bubble.is_none() && !is_sfx && !is_detector_sfx && !is_sign_or_narration_box && avg_score < 0.65 && cleaned.chars().count() <= 6 && compute_chromatic_color_variance(img, &cluster_rect) >= 15.0 {
                        continue;
                    }

                    // RECLASSIFY BORDERLESS ISOLATED EXCLAMATIONS / VEHICLE SOUNDS AS SOUNDEFFECT
                    if matched_bubble.is_none() && (is_sfx || is_detector_sfx || crate::ml::detect::is_onomatopoeia_or_shout(&cleaned)) {
                        kind = RegionKind::SoundEffect;
                    }
                }

                let is_detector_vert = box_rect.h >= (box_rect.w as f32 * 1.35) as i32;
                if is_detector_vert && cleaned.chars().count() <= 4 {
                    is_container_vert = true;
                    angle_deg = 0.0;
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

                    // IF DETECTOR CONTAINER EXTENDS FURTHER TO THE RIGHT, COVER IT
                    let max_horiz_pad = if is_container_vert || is_detector_vert { 60 } else { 30 };
                    if (box_rect.x + box_rect.w) > max_x && (box_rect.x + box_rect.w - max_x) <= max_horiz_pad && min_x >= box_rect.x - 25 {
                        max_x = max_x.max(box_rect.x + box_rect.w);
                    }

                    // IF VERTICAL CONTAINER EXTENDS FURTHER TO THE LEFT (E.G. MISSED LEFTMOST COLUMNS IN MULTI-COLUMN VERTICAL SPEECH BUBBLES)
                    if (is_container_vert || is_detector_vert || is_bubble_region) && box_rect.x < min_x && (min_x - box_rect.x) <= 60 {
                        min_x = min_x.min(box_rect.x);
                    }

                    // IF VERTICAL CONTAINER EXTENDS FURTHER UPWARDS
                    if (is_container_vert || is_detector_vert) && box_rect.y < min_y && (min_y - box_rect.y) <= 80 {
                        min_y = min_y.min(box_rect.y);
                    }

                    // IF VERTICAL TEXT EXTENDS FURTHER DOWNWARDS
                    let max_vert_trailing_pad = ((box_rect.h as f32 * 0.50).round() as i32).max(180);
                    if (is_container_vert || is_detector_vert) && (box_rect.y + box_rect.h) > max_y && (box_rect.y + box_rect.h - max_y) <= max_vert_trailing_pad {
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

                let bubble_box = matched_bubble.cloned();
                let bubble_polygon = bubble_box.as_ref().map(|b| vec![
                    [b.x, b.y],
                    [b.x + b.w, b.y],
                    [b.x + b.w, b.y + b.h],
                    [b.x, b.y + b.h],
                ]);

                let centroid = if let Some(ref bb) = bubble_box {
                    Some(crate::ml::schemas::Point2D {
                        x: bb.x as f32 + bb.w as f32 / 2.0,
                        y: bb.y as f32 + bb.h as f32 / 2.0,
                    })
                } else {
                    Some(crate::ml::schemas::Point2D {
                        x: final_box_rect.x as f32 + final_box_rect.w as f32 / 2.0,
                        y: final_box_rect.y as f32 + final_box_rect.h as f32 / 2.0,
                    })
                };

                let new_r = Region {
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
                    kind,
                    is_title: false,
                    is_subtitle: false,
                };
                regions.push(new_r);
            }
        } else {
            // FALLBACK: RAPIDOCR MISSED THIS DETECTOR BOX -> RUN TARGETED ISOLATED RECOGNITION CROP
            let pad_x = if matched_bubble.is_some() { 6 } else if is_container_vert { 8 } else { 15 };
            let pad_y = if matched_bubble.is_some() { 6 } else if is_container_vert { 18 } else { 8 };
            let crop_x = (box_rect.x - pad_x).max(0) as u32;
            let crop_y = (box_rect.y - pad_y).max(0) as u32;
            let crop_w = ((box_rect.w + pad_x * 2) as u32).min(page_w - crop_x);
            let crop_h = ((box_rect.h + pad_y * 2) as u32).min(page_h - crop_y);

            let mut isolated_text = String::new();
            let mut isolated_score = 0.80;

            let mut fallback_polys = Vec::new();
            if crop_w >= 16 && crop_h >= 16 {
                if let Some(ref mut o) = ocr {
                    let crop = img.crop_imm(crop_x, crop_y, crop_w, crop_h);
                    if let Ok(Some(res)) = o.recognize_crop_with_lang(&crop, source_lang) {
                        isolated_text = res.text.trim().to_string();
                        isolated_score = res.score;
                        if !res.lines.is_empty() {
                            for (l_poly, _, _) in res.lines {
                                let offset_poly: Vec<[i32; 2]> = l_poly.iter().map(|p| [p[0] + crop_x as i32, p[1] + crop_y as i32]).collect();
                                fallback_polys.push(offset_poly);
                            }
                        }
                    }
                    if isolated_text.is_empty() {
                        if let Ok(Some(res)) = o.recognize_line_with_lang(&crop, source_lang) {
                            isolated_text = res.text.trim().to_string();
                            isolated_score = res.score;
                        }
                    }
                }
            }

            let cleaned = isolated_text.trim().to_string();
            let is_sfx = is_detector_sfx || (matched_bubble.is_none() && crate::ml::detect::is_onomatopoeia_or_shout(&cleaned));
            if cleaned.is_empty() && !is_sfx {
                continue;
            }

            // 1. DROP GIANT ARTWORK HALLUCINATIONS
            if matched_bubble.is_none() && !is_sfx && box_rect.w >= (page_w as f32 * 0.65) as i32 && box_rect.h >= 120 {
                continue;
            }

            // 2. DROP HIGH-TILT NON-DIALOGUE WITH LOW RECOGNITION CONFIDENCE
            if matched_bubble.is_none() && angle_deg.abs() >= 12.0 && isolated_score < 0.65 && !is_sfx {
                continue;
            }

            if !cleaned.is_empty() {
                // 3. DROP STANDALONE REPEATED NOISE STROKES
                if crate::ml::detect::is_standalone_noise_stroke(&cleaned) {
                    continue;
                }
                if is_cjk && !is_detector_sfx && crate::ml::detect::is_standalone_alphanumeric_without_cjk(&cleaned) && (box_rect.h <= 15 || (matched_bubble.is_none() && box_rect.w <= 35 && box_rect.h <= 35) || (matched_bubble.is_none() && isolated_score < 0.70 && !(box_rect.w >= 45 && box_rect.h >= 25 && (cleaned.contains('Z') || cleaned.contains('z') || cleaned.contains('S') || cleaned.contains('A')))) || (matched_bubble.is_none() && cleaned.chars().count() == 1 && !is_sfx && !(box_rect.w >= 45 && box_rect.h >= 25 && (cleaned == "Z" || cleaned == "z" || cleaned == "S" || cleaned == "s" || cleaned == "A" || cleaned == "B")))) {
                    continue;
                }
                if !is_sfx && !is_detector_sfx && crate::ml::detect::is_pure_watermark_region(&cleaned) {
                    continue;
                }
                if cleaned.chars().count() == 1 && matched_bubble.is_none() && !is_sfx && !is_detector_sfx && (!crate::ml::detect::is_onomatopoeia_or_shout(&cleaned) || isolated_score < 0.60) && (compute_chromatic_color_variance(img, &box_rect) >= 15.0 || (isolated_score < 0.80 && box_rect.w <= 40 && box_rect.h <= 40)) {
                    continue;
                }
                if matched_bubble.is_none() && !is_detector_sfx && box_rect.w <= 40 && box_rect.h <= 55 && compute_chromatic_color_variance(img, &box_rect) >= 15.0 {
                    continue;
                }
                if box_rect.w <= 15 && box_rect.h <= 15 {
                    continue;
                }
                if matched_bubble.is_none() && !is_detector_sfx && !is_sfx && box_rect.w <= 40 && box_rect.h <= 55 {
                    continue;
                }
            }

            // 4. CHROMATIC VARIANCE GATE FOR FREE-FLOATING TEXT
            if matched_bubble.is_none() && isolated_score < 0.70 && compute_chromatic_color_variance(img, &box_rect) >= 18.0 {
                kind = RegionKind::SoundEffect;
            }

            let final_box_rect = if !fallback_polys.is_empty() {
                let mut min_x = i32::MAX;
                let mut min_y = i32::MAX;
                let mut max_x = i32::MIN;
                let mut max_y = i32::MIN;
                for poly in &fallback_polys {
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
                Some(crate::ml::schemas::Point2D {
                    x: bb.x as f32 + bb.w as f32 / 2.0,
                    y: bb.y as f32 + bb.h as f32 / 2.0,
                })
            } else {
                Some(crate::ml::schemas::Point2D {
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
                confidence: isolated_score,
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

    // DEDUPLICATE & UNIFY SLANTED STATUS CARD REGIONS
    let mut deduped_regions: Vec<Region> = Vec::new();
    for r in regions {
        let clean_r = r.text.trim();
        let r_rect = &r.box_;
        let (rx, ry, rw, rh) = (r_rect.x, r_rect.y, r_rect.w, r_rect.h);
        let r_area = (rw * rh).max(1);

        let mut is_duplicate = false;
        for existing in &mut deduped_regions {
            let clean_e = existing.text.trim();
            let e_rect = &existing.box_;
            let (ex, ey, ew, eh) = (e_rect.x, e_rect.y, e_rect.w, e_rect.h);
            let e_area = (ew * eh).max(1);

            let ix = (rx + rw).min(ex + ew) - rx.max(ex);
            let iy = (ry + rh).min(ey + eh) - ry.max(ey);
            let inter_area = if ix > 0 && iy > 0 { ix * iy } else { 0 };
            let overlap_r = inter_area as f32 / r_area as f32;
            let overlap_e = inter_area as f32 / e_area as f32;
            let iou = if inter_area > 0 { inter_area as f32 / (r_area + e_area - inter_area) as f32 } else { 0.0 };

            // A. STANDARD DUPLICATE / CONTAINMENT DEDUPLICATION
            let lines_r: Vec<&str> = r.text.lines().map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
            let lines_e: Vec<&str> = existing.text.lines().map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
            let has_shared_major_line = lines_r.iter().any(|lr| lr.chars().count() >= 3 && lines_e.iter().any(|le| le == lr || le.contains(lr) || lr.contains(le)));
            let clean_r_no_space: String = clean_r.chars().filter(|c| !c.is_whitespace()).collect();
            let clean_e_no_space: String = clean_e.chars().filter(|c| !c.is_whitespace()).collect();
            let is_contained_text = clean_r_no_space == clean_e_no_space
                || clean_e_no_space.contains(&clean_r_no_space)
                || clean_r_no_space.contains(&clean_e_no_space);
            let has_cjk_sub = (clean_r_no_space.chars().count() >= 2 && clean_e_no_space.contains(&clean_r_no_space))
                || (clean_e_no_space.chars().count() >= 2 && clean_r_no_space.contains(&clean_e_no_space));
            let has_shared_char_subset = (clean_r_no_space.chars().count() <= clean_e_no_space.chars().count() && clean_r_no_space.chars().all(|c| clean_e_no_space.contains(c)))
                || (clean_e_no_space.chars().count() <= clean_r_no_space.chars().count() && clean_e_no_space.chars().all(|c| clean_r_no_space.contains(c)));

            let text_contains = clean_r == clean_e || clean_e.contains(clean_r) || clean_r.contains(clean_e) || has_shared_major_line || is_contained_text || has_cjk_sub || has_shared_char_subset;

            let is_bubble_subset = (existing.bubble_box.is_some() || r.bubble_box.is_some())
                && text_contains
                && inter_area > 0
                && (overlap_r >= 0.40 || overlap_e >= 0.40 || iou >= 0.30);

            let is_spatial_containment_subset = text_contains
                && inter_area > 0
                && (overlap_r >= 0.40 || overlap_e >= 0.40 || iou >= 0.30);

            let is_high_spatial_overlap = inter_area > 0 && (iou >= 0.50 || overlap_r >= 0.60 || overlap_e >= 0.60);

            if (is_high_spatial_overlap && text_contains)
                || is_bubble_subset
                || is_spatial_containment_subset
            {
                is_duplicate = true;
                let clean_r_chars = clean_r_no_space.chars().count();
                let clean_e_chars = clean_e_no_space.chars().count();
                if (r.bubble_box.is_some() && existing.bubble_box.is_none()) || clean_r_chars > clean_e_chars || (clean_r_chars == clean_e_chars && r.confidence > existing.confidence) {
                    *existing = r.clone();
                }
                break;
            }

            // B. SLANTED STATUS CARD / PARAGRAPH SLICE UNIFICATION
            let angle_diff = (r.angle - existing.angle).abs();
            let is_slanted_card_slice = r.bubble_box.is_none() && existing.bubble_box.is_none() && r.angle.abs() >= 6.0 && existing.angle.abs() >= 6.0 && angle_diff <= 5.0;
            if is_slanted_card_slice {
                let x_dist = (rx.max(ex) - (rx + rw).min(ex + ew)).max(0);
                let y_dist = (ry.max(ey) - (ry + rh).min(ey + eh)).max(0);
                if inter_area > 0 || (x_dist <= 40 && y_dist <= 60) {
                    is_duplicate = true;
                    let ux = rx.min(ex);
                    let uy = ry.min(ey);
                    let uw = (rx + rw).max(ex + ew) - ux;
                    let uh = (ry + rh).max(ey + eh) - uy;
                    existing.box_ = BoxRect { x: ux, y: uy, w: uw, h: uh };
                    existing.inpaint_box = Some(expand_box(&existing.box_, inpaint_pct, page_w, page_h));
                    existing.typeset_box = Some(expand_box(&existing.box_, typeset_pct, page_w, page_h));

                    let mut merged_pts = existing.polygon.clone();
                    merged_pts.extend(r.polygon.clone());
                    let angle_rad = existing.angle * (std::f32::consts::PI / 180.0);
                    let cos_m = angle_rad.cos();
                    let sin_m = angle_rad.sin();
                    let mut min_u = f32::MAX;
                    let mut max_u = f32::MIN;
                    let mut min_v = f32::MAX;
                    let mut max_v = f32::MIN;
                    for p in &merged_pts {
                        let px = p[0] as f32;
                        let py = p[1] as f32;
                        let u = px * cos_m + py * sin_m;
                        let v = -px * sin_m + py * cos_m;
                        min_u = min_u.min(u);
                        max_u = max_u.max(u);
                        min_v = min_v.min(v);
                        max_v = max_v.max(v);
                    }
                    let u_v_corners = [
                        (min_u, min_v),
                        (max_u, min_v),
                        (max_u, max_v),
                        (min_u, max_v),
                    ];
                    existing.polygon = u_v_corners
                        .iter()
                        .map(|&(u, v)| {
                            let rx = u * cos_m - v * sin_m;
                            let ry = u * sin_m + v * cos_m;
                            [rx.round() as i32, ry.round() as i32]
                        })
                        .collect();

                    let mut combined_lines: Vec<String> = existing.text.lines().map(|s| s.trim().to_string()).collect();
                    for line in r.text.lines() {
                        let l_trim = line.trim();
                        if !l_trim.is_empty() && !combined_lines.iter().any(|cl| cl == l_trim || cl.contains(l_trim)) {
                            combined_lines.push(l_trim.to_string());
                        }
                    }
                    existing.text = combined_lines.join("\n");
                    break;
                }
            }
        }
        if !is_duplicate {
            deduped_regions.push(r);
        }
    }

    // RE-INDEX REGION IDS
    for (i, r) in deduped_regions.iter_mut().enumerate() {
        r.id = format!("r{}", i);
    }

    deduped_regions
}
