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

// -- CONSTANTS (BUBBLE-TEXT BASE BOUNDARY EXPANSION) -- //
// SAFE INTERIOR INSET FROM THE STROKED BUBBLE OUTLINE (INSCRIBED CORE THE TEXT MAY FILL)
const BUBBLE_INSET_FRAC: f32 = 0.08;
const BUBBLE_INSET_MIN: i32 = 6;
const BUBBLE_INSET_MAX: i32 = 18;
// MIN GAP KEPT BETWEEN A BUBBLE TEXT BOX AND ITS SIBLING TEXT (FUSED 2-3 TEXT BUBBLES)
const SIBLING_GAP: i32 = 5;
// THRESHOLDS: ONLY SCALE AN AXIS WHEN THE UNUSED ROOM EXCEEDS THESE (NO-OP ON CRAMPED BUBBLES)
const MIN_UNUSED_RATIO: f32 = 0.10;
const MIN_SCALE: f32 = 1.10;
// PER-AXIS SAFE SCALE CAPS (PRIMARY = READING-DIRECTION AXIS, SECONDARY = CROSS AXIS)
const CAP_PRIMARY: f32 = 1.35;
const CAP_SECONDARY: f32 = 1.20;
// CROSS AXIS USES ONLY THIS FRACTION OF ITS AVAILABLE ROOM
const CROSS_AXIS_FRACTION: f32 = 0.70;

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
                coverage >= 0.60
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
                // AN OCR LINE THAT IS SIGNIFICANTLY WIDER THAN THE CONTAINER BOX (LW >= 2.50 * BOX_RECT.W)
                // IS A CROSS-CONTAINER SPANNED LINE ONLY WHEN BOX_RECT.W IS A SMALL SUB-BOX (< 100PX)
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

        // IN NON-LATIN SCRIPT SOURCES (E.G. KOREAN, CJK), IF CANDIDATE BOX CONTAINS NATIVE LINES, DROP OVERLAPPING PURE LATIN NOISE LINES
        if crate::ml::detect::is_non_latin_source(source_lang) && matched.iter().any(|l| crate::ml::detect::has_native_script_for_lang(&l.text, source_lang)) {
            matched.retain(|l| {
                let t = l.text.trim();
                let lacks_native = !crate::ml::detect::has_native_script_for_lang(t, source_lang);
                let is_pure_latin_word = lacks_native && t.chars().all(|c| c.is_ascii_alphabetic() || c.is_whitespace() || c.is_ascii_punctuation());
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

            // IN NON-LATIN CONTAINERS (E.G. CJK/KOREAN SPEECH BUBBLES/FREE TEXT), IF NATIVE SCRIPT LINES EXIST (SCORE >= 0.65), SUPPRESS PURE LATIN NOISE / CLOTHING PATTERN / DIGIT NOISE LINES
            let has_native_script_line = orientation_filtered.iter().any(|l| {
                l.score >= 0.65 && crate::ml::detect::has_native_script_for_lang(&l.text, source_lang)
            });
            if has_native_script_line && crate::ml::detect::is_non_latin_source(source_lang) {
                orientation_filtered.retain(|l| {
                    let t = l.text.trim();
                    let lacks_native = !crate::ml::detect::has_native_script_for_lang(t, source_lang);
                    let is_pure_latin_word = lacks_native && t.chars().all(|c| c.is_ascii_alphabetic() || c.is_whitespace() || c.is_ascii_punctuation());
                    let is_noise_or_digit = lacks_native && (crate::ml::detect::is_standalone_digit_or_particle_noise(t) || crate::ml::detect::is_standalone_noise_stroke(t));
                    (!is_pure_latin_word && !is_noise_or_digit) || crate::ml::detect::is_onomatopoeia_or_shout(t)
                });
            }

            let mut filtered_matched: Vec<&OcrLine> = Vec::new();
            // In CJK mode, sanitize OCR lines with trailing noise strokes after a newline (e.g. "text...\n00o0")
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

            let line_angles: Vec<f32> = filtered_matched
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

                angle_deg = if !cluster_lines.is_empty() && median_line_angle.abs() >= 1.5 {
                    // If constituent OCR line(s) have clear orientation angle, prefer line angle
                    if median_line_angle.abs() < 3.5 && (box_angle == 0.0 || (box_angle.abs() < 1.5)) {
                        0.0
                    } else {
                        median_line_angle
                    }
                } else if is_container_vert {
                    0.0
                } else if !cluster_lines.is_empty() && median_line_angle.abs() < 1.5 && box_angle.abs() < 8.0 {
                    // Lines are horizontal, ignore noisy detector box slant
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

                // IF FULL-PAGE OCR MISSED CHARACTERS IN A BUBBLE OR WIDE/TALL CANDIDATE CONTAINER (E.G. TRAILING ELLIPSIS), ATTEMPT CROP RECOGNITION REFINEMENT
                let container_w = box_rect.w;
                let container_h = box_rect.h;
                let is_container_wider = container_w >= cluster_rect.w + 20 || (container_w as f32) >= (cluster_rect.w as f32 * 1.20);
                let is_container_taller = container_h >= cluster_rect.h + 20 || (container_h as f32) >= (cluster_rect.h as f32 * 1.20);
                let is_short_text_partial = cluster_lines.len() == 1 && (is_container_wider || is_container_taller);
                let is_combined_pure_punct = !combined_text.is_empty() && combined_text.chars().all(|c| {
                    c.is_ascii_punctuation()
                        || c.is_whitespace()
                        || matches!(c, '…' | '·' | '—' | '～' | '！' | '？' | '。' | '，' | '、' | '–' | '¿' | '¡')
                });
                let is_clean_single_line = cluster_lines.len() == 1 && avg_score >= 0.70 && !is_container_wider && !is_container_taller;
                let full_page_is_complete = (cluster_lines.len() >= 3 || is_clean_single_line) && avg_score >= 0.70 && !is_container_wider && !is_container_taller;
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

                                // IF THE CROP RESULT MERGED LINES ACROSS MULTIPLE SEPARATE DIALOGUE SENTENCES OR EXPANDED SINGLE NARRATION LINES INTO MULTI-ROW SENTENCES, DO NOT REPLACE
                                let is_excessive_expansion = matched_bubble.is_none() && (
                                    (combined_cjk_count >= 3 && crop_cjk_count >= (combined_cjk_count * 5 / 2))
                                        || (cluster_lines.len() == 1 && avg_score >= 0.70 && !combined_text.contains('\n') && clean_crop_text.contains('\n') && !is_container_vert && combined_cjk_count >= 8)
                                );

                                // PREVENT CORRUPTING VALID PUNCTUATION CLUSTERS (?!, !?, ...) INTO SPLIT DIGIT/BULLET ARTIFACTS (21, ●)
                                let is_crop_digits_or_bullets_only = clean_crop_text.chars().all(|c| {
                                    c.is_ascii_digit() || c.is_whitespace() || matches!(c, '●' | '○' | '•' | '·')
                                });
                                let is_corrupted_punct_to_digits = is_combined_pure_punct && is_crop_digits_or_bullets_only;

                                let is_improved = if is_cjk {
                                    !is_excessive_expansion && !is_corrupted_punct_to_digits && (
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
                                    let has_meaningful_more_text = !is_corrupted_punct_to_digits && (
                                        (crop_alphanumeric > combined_alphanumeric && (!is_combined_pure_punct || clean_crop_text.chars().any(|c| c.is_alphabetic())))
                                            || (crop_alphanumeric == combined_alphanumeric && crop_chars > combined_chars && (has_more_ellipsis || !clean_crop_text.ends_with("??")))
                                    );
                                    !is_excessive_expansion && !is_corrupted_punct_to_digits && (
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
                if cleaned.is_empty() {
                    continue;
                }

                // 1. DROP GIANT ARTWORK HALLUCINATIONS OR SPRAWLING NOISE BOXES
                if matched_bubble.is_none() && cluster_rect.w >= 300 && cluster_rect.h >= 500 && avg_score < 0.65 {
                    continue;
                }
                if matched_bubble.is_none() {
                    if cluster_rect.w >= (page_w as f32 * 0.75) as i32 && cluster_rect.h >= 140 {
                        continue;
                    }
                }

                // 2. DROP HIGH-TILT NON-DIALOGUE WITH LOW RECOGNITION CONFIDENCE
                if matched_bubble.is_none() && angle_deg.abs() >= 12.0 && avg_score < 0.65 {
                    continue;
                }

                if !cleaned.is_empty() {
                    // 3. DROP STANDALONE REPEATED NOISE STROKES
                    if crate::ml::detect::is_standalone_noise_stroke(&cleaned) {
                        continue;
                    }
                    // SUPPRESS TINY LOW-CONFIDENCE NOISE BUBBLES (E.G. '一\n0', '4' IN COMPACT ARTIFACT BUBBLES W <= 35, H <= 55)
                    if matched_bubble.is_some() && (cluster_rect.w <= 35 || box_rect.w <= 35) && (cluster_rect.h <= 55 || box_rect.h <= 55) {
                        let is_noise_or_digit = crate::ml::detect::is_standalone_digit_or_particle_noise(&cleaned)
                            || crate::ml::detect::is_standalone_noise_stroke(&cleaned)
                            || cleaned.lines().all(|l| crate::ml::detect::is_standalone_noise_stroke(l.trim()) || crate::ml::detect::is_standalone_digit_or_particle_noise(l.trim()));
                        if avg_score < 0.68 || is_noise_or_digit {
                            continue;
                        }
                    }
                    // IN NON-LATIN SCRIPT SOURCES (CJK, CYRILLIC, THAI), NEVER EXTRACT STANDALONE ALPHANUMERIC / LATIN TEXT UNLESS COMBINED WITH SOURCE SCRIPT
                    let is_non_latin = crate::ml::detect::is_non_latin_source(source_lang);
                    let lacks_native_script = !crate::ml::detect::has_native_script_for_lang(&cleaned, source_lang);
                    let is_pure_latin = lacks_native_script && cleaned.chars().all(|c| c.is_ascii_alphabetic() || c.is_whitespace() || c.is_ascii_punctuation());
                    if is_non_latin && is_pure_latin && !crate::ml::detect::is_onomatopoeia_or_shout(&cleaned) {
                        // Suppress background texture / clothing words (e.g. "HOSPITAL", "OSPITAL") in CJK/Korean sources
                        // But allow if matched_bubble contains native dialogue that was merged or candidate is native
                        continue;
                    }
                    if is_non_latin && lacks_native_script && crate::ml::detect::has_alphanumeric_characters(&cleaned) {
                        let char_count = cleaned.chars().filter(|c| !c.is_whitespace()).count();
                        let is_sparse_giant_box = matched_bubble.is_none() && (cluster_rect.w >= 100 || cluster_rect.h >= 100) && char_count <= 4;
                        let is_short_noise_code = matched_bubble.is_none()
                            && char_count <= 3
                            && !crate::ml::detect::is_onomatopoeia_or_shout(&cleaned)
                            && !(cluster_rect.w >= 45 && cluster_rect.h >= 25 && (cleaned.contains('Z') || cleaned.contains('z') || cleaned.contains('S') || cleaned.contains('A')));
                        let is_non_bubble_alphanumeric = matched_bubble.is_none() && !crate::ml::detect::is_onomatopoeia_or_shout(&cleaned);
                        if cluster_rect.h <= 15
                            || is_sparse_giant_box
                            || is_short_noise_code
                            || is_non_bubble_alphanumeric
                            || (matched_bubble.is_none() && cluster_rect.w <= 35 && cluster_rect.h <= 35)
                            || (matched_bubble.is_none() && avg_score < 0.70 && !(cluster_rect.w >= 45 && cluster_rect.h >= 25 && (cleaned.contains('Z') || cleaned.contains('z') || cleaned.contains('S') || cleaned.contains('A'))))
                            || (matched_bubble.is_none() && cleaned.chars().count() == 1 && !(cluster_rect.w >= 45 && cluster_rect.h >= 25 && (cleaned == "Z" || cleaned == "z" || cleaned == "S" || cleaned == "s" || cleaned == "A" || cleaned == "B")))
                        {
                            continue;
                        }
                    }
                    if crate::ml::detect::is_pure_watermark_region(&cleaned) {
                        continue;
                    }
                    // SUPPRESS STANDALONE PUNCTUATION / SYMBOL-ONLY REGIONS (E.G. '?!', '!', '?', '…', '~')
                    if crate::ml::detect::is_pure_punctuation_only(&cleaned) {
                        continue;
                    }

                    // SUPPRESS STANDALONE DIGIT / DEGREE / PARTICLE NOISE OUTSIDE SPEECH BUBBLES ACROSS ALL LANGUAGES
                    if matched_bubble.is_none() && crate::ml::detect::is_standalone_digit_or_particle_noise(&cleaned) {
                        let char_count = cleaned.chars().filter(|c| !c.is_whitespace()).count();
                        let is_sparse_giant_box = (cluster_rect.w >= 100 || cluster_rect.h >= 100) && char_count <= 5;
                        if char_count <= 4
                            || is_sparse_giant_box
                            || cluster_rect.h <= 20
                            || cluster_rect.w <= 40
                            || (avg_score < 0.75 && char_count <= 6)
                        {
                            continue;
                        }
                    }
                    if is_cjk && (cluster_rect.y + cluster_rect.h >= page_h as i32 - 50) && cleaned.chars().count() == 1 && (cleaned == "动" || cleaned == "初" || cleaned == "腾" || cleaned == "漫" || cleaned == "漫客" || cleaned == "客") {
                        continue;
                    }
                    // SUPPRESS LOW-CONFIDENCE ISOLATED SINGLE-CHARACTER ARTWORK ARTIFACTS
                    let is_sign_or_narration_box = is_cjk && cluster_rect.w >= 60 && cluster_rect.h >= 40 && (cleaned.contains("省") || cleaned.contains("县") || cleaned.contains("区") || cleaned.contains("镇") || cleaned.contains("村") || cleaned.contains("室") || cleaned.contains("馆") || cleaned.contains("部") || cleaned.contains("堂") || cleaned.contains("院") || cleaned.contains("校") || cleaned.contains("门"));
                    let is_margin_isolated_char = (cluster_rect.x <= 5 || cluster_rect.x + cluster_rect.w >= page_w as i32 - 5) && avg_score < 0.75;
                    let char_count = cleaned.chars().filter(|c| !c.is_whitespace()).count();
                    let is_valid_cjk_glyph = is_cjk && cleaned.chars().any(|c| crate::ml::detect::has_cjk_characters(&c.to_string())) && avg_score >= 0.70 && !is_margin_isolated_char;
                    let is_low_conf_single_char = char_count == 1 && (avg_score < 0.68 || cluster_rect.w >= 100 || cluster_rect.h >= 100);
                    let is_isolated_sfx = char_count <= 4 && crate::ml::detect::is_onomatopoeia_or_shout(&cleaned);
                    if char_count <= 4 && matched_bubble.is_none() && !is_sign_or_narration_box && (!is_valid_cjk_glyph || is_low_conf_single_char || is_margin_isolated_char || is_isolated_sfx) && (!crate::ml::detect::is_onomatopoeia_or_shout(&cleaned) || avg_score < 0.60 || is_margin_isolated_char || is_low_conf_single_char || is_isolated_sfx) && (compute_chromatic_color_variance(img, &cluster_rect) >= 15.0 || is_margin_isolated_char || is_low_conf_single_char || is_isolated_sfx || (avg_score < 0.75 && cluster_rect.w <= 40 && cluster_rect.h <= 40)) {
                        continue;
                    }
                    // SUPPRESS TRANSLUCENT AGGREGATOR WATERMARKS (E.G. '数据' OVERLAID WITH 'ACloudMerge.com' OR '集云')
                    if is_cjk && matched_bubble.is_none() && (cleaned == "数据" || cleaned == "集云" || cleaned == "集云数据") {
                        continue;
                    }
                    // SUPPRESS LOW-CONFIDENCE REPEATED SFX GLYPHS GENERATED FROM LIGHTNING / BACKGROUND SPEEDLINES (E.G. '呼呼', '叫呼呼' ON CHROMATIC BACKGROUND WITH SCORE < 0.65)
                    if is_cjk && matched_bubble.is_none() && (cleaned.contains("呼呼") || cleaned == "呼" || cleaned == "叫呼呼") && avg_score < 0.65 && compute_chromatic_color_variance(img, &cluster_rect) >= 15.0 {
                        continue;
                    }
                    // SUPPRESS OCR HALLUCINATIONS FROM DECORATIVE ENERGY-BURST / LIGHTNING ARTWORK GLYPHS:
                    // WHEN EACH LINE OF A LOW-CONFIDENCE REGION CONTAINS MIXED DIGIT/LATIN NOISE ARTIFACTS
                    // CORRUPTING A SHORT REPEATED CJK SFX GLYPH (E.G. '1呼\n呼t.1'), STRIP ALL NON-CJK CHARS
                    // PER LINE AND CHECK IF THE RESIDUE IS A SINGLE IDENTICAL SHORT GLYPH ACROSS ALL LINES.
                    // THIS CATCHES ENERGY BURST / SPEEDLINE MISREADS THAT EVADE THE INLINE '呼呼' CHECK.
                    if is_cjk && matched_bubble.is_none() && avg_score < 0.70 && compute_chromatic_color_variance(img, &cluster_rect) >= 15.0 {
                        let lines: Vec<&str> = cleaned.lines().collect();
                        if lines.len() >= 2 {
                            let cjk_residues: Vec<String> = lines
                                .iter()
                                .map(|l| l.chars().filter(|c| crate::ml::detect::has_cjk_characters(&c.to_string())).collect::<String>())
                                .collect();
                            let all_non_empty = cjk_residues.iter().all(|r| !r.is_empty());
                            let all_single_glyph = cjk_residues.iter().all(|r| r.chars().count() == 1);
                            let all_identical = cjk_residues.windows(2).all(|w| w[0] == w[1]);
                            // EACH LINE HAS EXACTLY ONE UNIQUE CJK CHAR BUT IS POLLUTED BY DIGIT/LATIN ARTIFACTS
                            let has_digit_latin_noise = lines.iter().any(|l| {
                                l.chars().any(|c| c.is_ascii_alphanumeric() && !crate::ml::detect::has_cjk_characters(&c.to_string()))
                            });
                            if all_non_empty && all_single_glyph && all_identical && has_digit_latin_noise {
                                continue;
                            }
                        }
                    }
                    // SUPPRESS FOLIAGE NOISE / CHROMATIC BACKGROUND TEXTURE ON TINY STROKE FRAGMENTS
                    if matched_bubble.is_none() && cluster_rect.w <= 40 && cluster_rect.h <= 55 && compute_chromatic_color_variance(img, &cluster_rect) >= 15.0 {
                        continue;
                    }
                    // SUPPRESS ISOLATED SINGLE-PUNCTUATION / REACTION SYMBOL SLICES (E.G. '!', '?', 'i', 'l', '1', '|' WITH W <= 12PX)
                    let is_narrow_symbol_slice = cluster_rect.w <= 12 && (cleaned == "i" || cleaned == "l" || cleaned == "!" || cleaned == "1" || cleaned == "|" || cleaned == "I");
                    if is_narrow_symbol_slice {
                        continue;
                    }

                    // SUPPRESS TINY SUB-PIXEL / NOISE FRAGMENTS (UNLESS VALID CJK CHAR WITH HIGH CONFIDENCE ON CLEAN BACKGROUND)
                    let is_clean_bg = compute_chromatic_color_variance(img, &cluster_rect) < 15.0;
                    let is_valid_cjk_glyph = is_cjk && cleaned.chars().any(|c| crate::ml::detect::has_cjk_characters(&c.to_string())) && avg_score >= 0.70 && is_clean_bg;
                    if cluster_rect.w <= 15 && cluster_rect.h <= 15 && !is_valid_cjk_glyph {
                        continue;
                    }
                    // SUPPRESS TINY ISOLATED NON-BUBBLE STROKE FRAGMENTS
                    if matched_bubble.is_none() && cluster_rect.w <= 40 && cluster_rect.h <= 55 && !is_valid_cjk_glyph {
                        continue;
                    }
                    // SUPPRESS OPTICAL BORDER SLIVERS
                    if matched_bubble.is_none() && cluster_rect.w <= 35 && cluster_rect.h >= 60 && avg_score < 0.60 {
                        continue;
                    }
                    // SUPPRESS LOW-CONFIDENCE ISOLATED PSEUDO-WORD HALLUCINATIONS ON COMPLEX BACKGROUND ARTWORK
                    if matched_bubble.is_none() && !is_sign_or_narration_box && ((avg_score < 0.65 && cleaned.chars().count() <= 6 && compute_chromatic_color_variance(img, &cluster_rect) >= 15.0) || (avg_score < 0.70 && cleaned.chars().count() <= 16)) {
                        continue;
                    }

                    // SUPPRESS TRUNCATED MARGIN NOISE FRAGMENTS SLICED AT THE VERY EDGE OF THE IMAGE CANVAS (WITHOUT SPEECH BUBBLE)
                    let is_margin_flush = cluster_rect.x <= 5 || cluster_rect.x + cluster_rect.w >= page_w as i32 - 5;
                    if matched_bubble.is_none() && is_margin_flush && (cluster_rect.w <= 75 || cluster_rect.h <= 65) && avg_score < 0.75 {
                        continue;
                    }

                    // SUPPRESS MASSIVE NON-BUBBLE BACKGROUND TEXT OCCLUDED ACROSS SCENE ARTWORK (W >= 75% CANVAS WIDTH AND H >= 100PX)
                    if matched_bubble.is_none() && (cluster_rect.w as f32 >= page_w as f32 * 0.75) && cluster_rect.h >= 100 {
                        continue;
                    }

                    // SUPPRESS NON-BUBBLE DETECTOR HALLUCINATIONS WHOSE TEXT IS A DUPLICATE / ECHO OF AN ADJACENT SPEECH BUBBLE (E.G. '雪\n传灵塔组织还')
                    let is_speech_bubble_echo = matched_bubble.is_none() && split_lines.iter().any(|rl| {
                        let t_rl = rl.text.trim();
                        let (rx, ry, rw, rh) = polygon_bounds(&rl.polygon);
                        let rl_in_bubble = bubbles.iter().any(|b| {
                            let (rcx, rcy) = (rx + rw / 2, ry + rh / 2);
                            rcx >= b.x && rcx <= b.x + b.w && rcy >= b.y && rcy <= b.y + b.h
                        });
                        if rl_in_bubble && t_rl.chars().count() >= 4 {
                            let common_chars = cleaned.chars().filter(|c| !c.is_whitespace() && t_rl.contains(*c)).count();
                            let clean_chars = cleaned.chars().filter(|c| !c.is_whitespace()).count();
                            common_chars >= 4 && (common_chars as f32 / clean_chars.max(1) as f32 >= 0.60)
                        } else {
                            false
                        }
                    }) && bubbles.iter().any(|b| {
                        let (cx, cy) = (cluster_rect.x + cluster_rect.w / 2, cluster_rect.y + cluster_rect.h / 2);
                        let (bx, by) = (b.x + b.w / 2, b.y + b.h / 2);
                        (cx - bx).abs() <= 200 && (cy - by).abs() <= 350
                    });
                    if is_speech_bubble_echo {
                        continue;
                    }

                    // SUPPRESS SPARSE GIANT NON-BUBBLE DETECTIONS (E.G. BACKGROUND BUILDING / DOORWAY PLAQUES W >= 250PX, H >= 150PX WITH <= 3 CHARACTERS)
                    let is_sparse_giant_non_bubble = matched_bubble.is_none()
                        && !crate::ml::detect::is_onomatopoeia_or_shout(&cleaned)
                        && (cluster_rect.w >= 250 && cluster_rect.h >= 150)
                        && cleaned.chars().filter(|c| !c.is_whitespace()).count() <= 3;
                    if is_sparse_giant_non_bubble {
                        continue;
                    }
                }

                let is_detector_vert = box_rect.h >= (box_rect.w as f32 * 1.35) as i32;
                if is_detector_vert && cleaned.chars().count() <= 4 {
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

                    // IF DETECTOR CONTAINER EXTENDS FURTHER TO THE RIGHT, COVER IT
                    let max_horiz_pad = if is_container_vert || is_detector_vert { 60 } else { 30 };
                    if (box_rect.x + box_rect.w) > max_x && (box_rect.x + box_rect.w - max_x) <= max_horiz_pad && min_x >= box_rect.x - 25 {
                        max_x = max_x.max(box_rect.x + box_rect.w);
                    }

                    // IF CONTAINER EXTENDS FURTHER TO THE LEFT (E.G. MISSED LEADING LEFT COLUMNS / BRACKETS)
                    if (box_rect.x < min_x) && (min_x - box_rect.x) <= 160 && (box_rect.y <= min_y + 15 && box_rect.y + box_rect.h >= max_y - 15) {
                        min_x = min_x.min(box_rect.x);
                    }

                    // IF CONTAINER EXTENDS FURTHER UPWARDS (E.G. MISSED LEADING ROW IN MACRO-CONTAINER)
                    if (box_rect.y < min_y) && (min_y - box_rect.y) <= 45 && (box_rect.x <= min_x + 15 && box_rect.x + box_rect.w >= max_x - 15) {
                        min_y = min_y.min(box_rect.y);
                    }

                    // IF VERTICAL TEXT EXTENDS FURTHER DOWNWARDS
                    let max_vert_trailing_pad = ((box_rect.h as f32 * 0.50).round() as i32).max(180);
                    if (is_container_vert || is_detector_vert) && (box_rect.y + box_rect.h) > max_y && (box_rect.y + box_rect.h - max_y) <= max_vert_trailing_pad {
                        max_y = max_y.max(box_rect.y + box_rect.h);
                    } else if matched_bubble.is_some() && (box_rect.y + box_rect.h) > max_y && (box_rect.y + box_rect.h - max_y) <= 25 && min_x >= box_rect.x - 10 && max_x <= box_rect.x + box_rect.w + 10 {
                        // ENCOMPASS TRAILING SECOND ROW / PUNCTUATION WITHIN SPEECH BUBBLE TEXT CONTAINER
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
                    kind: final_kind,
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
            if cleaned.is_empty() {
                continue;
            }

            // 1. DROP GIANT ARTWORK HALLUCINATIONS
            if matched_bubble.is_none() && box_rect.w >= (page_w as f32 * 0.65) as i32 && box_rect.h >= 120 {
                continue;
            }

            // 2. DROP HIGH-TILT NON-DIALOGUE WITH LOW RECOGNITION CONFIDENCE
            if matched_bubble.is_none() && angle_deg.abs() >= 12.0 && isolated_score < 0.65 {
                continue;
            }

            if !cleaned.is_empty() {
                // 3. DROP STANDALONE REPEATED NOISE STROKES
                if crate::ml::detect::is_standalone_noise_stroke(&cleaned) {
                    continue;
                }
                if is_cjk && crate::ml::detect::is_standalone_alphanumeric_without_cjk(&cleaned) && (box_rect.h <= 15 || (matched_bubble.is_none() && box_rect.w <= 35 && box_rect.h <= 35) || (matched_bubble.is_none() && isolated_score < 0.70 && !(box_rect.w >= 45 && box_rect.h >= 25 && (cleaned.contains('Z') || cleaned.contains('z') || cleaned.contains('S') || cleaned.contains('A')))) || (matched_bubble.is_none() && cleaned.chars().count() == 1 && !(box_rect.w >= 45 && box_rect.h >= 25 && (cleaned == "Z" || cleaned == "z" || cleaned == "S" || cleaned == "s" || cleaned == "A" || cleaned == "B")))) {
                    continue;
                }
                if crate::ml::detect::is_pure_watermark_region(&cleaned) {
                    continue;
                }
                // SUPPRESS TINY LOW-CONFIDENCE NOISE BUBBLES IN FALLBACK (E.G. '一\n0', '4' IN COMPACT ARTIFACT BUBBLES W <= 35, H <= 55)
                if matched_bubble.is_some() && box_rect.w <= 35 && box_rect.h <= 55 {
                    let is_noise_or_digit = crate::ml::detect::is_standalone_digit_or_particle_noise(&cleaned)
                        || crate::ml::detect::is_standalone_noise_stroke(&cleaned)
                        || cleaned.lines().all(|l| crate::ml::detect::is_standalone_noise_stroke(l.trim()) || crate::ml::detect::is_standalone_digit_or_particle_noise(l.trim()));
                    if isolated_score < 0.68 || is_noise_or_digit {
                        continue;
                    }
                }
                // SUPPRESS STANDALONE DIGIT / DEGREE / PARTICLE NOISE OUTSIDE SPEECH BUBBLES ACROSS ALL LANGUAGES
                if matched_bubble.is_none() && crate::ml::detect::is_standalone_digit_or_particle_noise(&cleaned) {
                    let char_count = cleaned.chars().filter(|c| !c.is_whitespace()).count();
                    let is_sparse_giant_box = (box_rect.w >= 100 || box_rect.h >= 100) && char_count <= 5;
                    if char_count <= 4
                        || is_sparse_giant_box
                        || box_rect.h <= 20
                        || box_rect.w <= 40
                        || (isolated_score < 0.75 && char_count <= 6)
                    {
                        continue;
                    }
                }
                if cleaned.chars().count() == 1 && matched_bubble.is_none() && (!crate::ml::detect::is_onomatopoeia_or_shout(&cleaned) || isolated_score < 0.60) && (compute_chromatic_color_variance(img, &box_rect) >= 15.0 || (isolated_score < 0.80 && box_rect.w <= 40 && box_rect.h <= 40)) {
                    continue;
                }
                if matched_bubble.is_none() && box_rect.w <= 40 && box_rect.h <= 55 && compute_chromatic_color_variance(img, &box_rect) >= 15.0 {
                    continue;
                }
                if box_rect.w <= 15 && box_rect.h <= 15 {
                    continue;
                }
                if matched_bubble.is_none() && box_rect.w <= 40 && box_rect.h <= 55 {
                    continue;
                }
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
                if existing.bubble_box.is_some() && r.bubble_box.is_none() {
                    // KEEP EXISTING BUBBLE-BACKED REGION OVER NON-BUBBLE CANDIDATE
                } else if r.bubble_box.is_some() && existing.bubble_box.is_none() {
                    *existing = r.clone();
                } else if clean_r_chars > clean_e_chars || (clean_r_chars == clean_e_chars && r.confidence > existing.confidence) {
                    *existing = r.clone();
                }
                break;
            }

            // B. SLANTED STATUS CARD / PARAGRAPH SLICE UNIFICATION (COMPUTED IN ROTATED PROJECTION FRAME)
            let angle_diff = (r.angle - existing.angle).abs();
            let is_slanted_card_slice = r.bubble_box.is_none()
                && existing.bubble_box.is_none()
                && r.angle.abs() >= 6.0
                && existing.angle.abs() >= 6.0
                && angle_diff <= 5.0;

            if is_slanted_card_slice {
                let is_r_timestamp = crate::ml::detect::is_timestamp_or_date_line(clean_r);
                let is_e_timestamp = crate::ml::detect::is_timestamp_or_date_line(clean_e);

                if !is_r_timestamp && !is_e_timestamp {
                    let angle_rad = existing.angle * (std::f32::consts::PI / 180.0);
                    let cos_m = angle_rad.cos();
                    let sin_m = angle_rad.sin();

                    // Project existing polygon points into rotated frame (u = along line, v = perpendicular to line)
                    let mut e_min_u = f32::MAX;
                    let mut e_max_u = f32::MIN;
                    let mut e_min_v = f32::MAX;
                    let mut e_max_v = f32::MIN;
                    for p in &existing.polygon {
                        let px = p[0] as f32;
                        let py = p[1] as f32;
                        let u = px * cos_m + py * sin_m;
                        let v = -px * sin_m + py * cos_m;
                        e_min_u = e_min_u.min(u);
                        e_max_u = e_max_u.max(u);
                        e_min_v = e_min_v.min(v);
                        e_max_v = e_max_v.max(v);
                    }

                    // Project candidate region r's polygon points into rotated frame
                    let mut r_min_u = f32::MAX;
                    let mut r_max_u = f32::MIN;
                    let mut r_min_v = f32::MAX;
                    let mut r_max_v = f32::MIN;
                    for p in &r.polygon {
                        let px = p[0] as f32;
                        let py = p[1] as f32;
                        let u = px * cos_m + py * sin_m;
                        let v = -px * sin_m + py * cos_m;
                        r_min_u = r_min_u.min(u);
                        r_max_u = r_max_u.max(u);
                        r_min_v = r_min_v.min(v);
                        r_max_v = r_max_v.max(v);
                    }

                    let e_h_v = (e_max_v - e_min_v).max(1.0);
                    let r_h_v = (r_max_v - r_min_v).max(1.0);
                    let min_line_h = e_h_v.min(r_h_v);

                    let e_w_u = (e_max_u - e_min_u).max(1.0);
                    let r_w_u = (r_max_u - r_min_u).max(1.0);

                    // Distance in perpendicular/inter-row direction v
                    let v_gap = (e_min_v.max(r_min_v) - e_max_v.min(r_max_v)).max(0.0);
                    let v_overlap = (e_max_v.min(r_max_v) - e_min_v.max(r_min_v)).max(0.0);

                    // Horizontal overlap along reading line u
                    let u_overlap = (e_max_u.min(r_max_u) - e_min_u.max(r_min_u)).max(0.0);
                    let u_gap = (e_min_u.max(r_min_u) - e_max_u.min(r_max_u)).max(0.0);
                    let u_overlap_ratio = u_overlap / e_w_u.min(r_w_u);

                    // Check if rows are adjacent in rotated space
                    let existing_lines_count = existing.text.lines().count();
                    let r_lines_count = r.text.lines().count();
                    let is_short_label = (clean_e.chars().count() <= 5 && existing_lines_count == 1)
                        || (clean_r.chars().count() <= 5 && r_lines_count == 1);

                    // For standard intra-paragraph lines, allow blank line gaps up to 48px if left-aligned / high horizontal overlap
                    let is_left_aligned = (e_min_u - r_min_u).abs() <= 25.0;
                    let max_v_gap = if is_short_label {
                        25.0 // Sender header / metadata label separated from paragraph
                    } else if u_overlap_ratio >= 0.50 || (is_left_aligned && u_overlap > 0.0) {
                        48.0 // Intra-paragraph / p.s blank line gap
                    } else {
                        (min_line_h * 1.15).min(32.0)
                    };

                    let is_adjacent_v = v_overlap > 0.0 || (v_gap <= max_v_gap);
                    let is_aligned_u = u_overlap_ratio >= 0.20 || u_gap <= 25.0;

                    // If existing or r is already a multi-line paragraph (>= 3 lines), do not bridge across wide vertical gaps (v_gap >= 55px)
                    let is_multi_line_guard = (existing_lines_count >= 3 || r_lines_count >= 3) && v_gap >= 55.0;

                    if is_adjacent_v && is_aligned_u && !is_multi_line_guard {
                        is_duplicate = true;

                        let mut min_u = e_min_u.min(r_min_u);
                        let mut max_u = e_max_u.max(r_max_u);
                        let mut min_v = e_min_v.min(r_min_v);
                        let mut max_v = e_max_v.max(r_max_v);

                        if let Some((bu_min, bu_max, bv_min, bv_max)) =
                            super::geometry::extract_slanted_bubble_envelope(img, min_u, max_u, min_v, max_v, existing.angle)
                        {
                            min_u = bu_min;
                            max_u = bu_max;
                            min_v = bv_min;
                            max_v = bv_max;
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

                        let mut min_x = i32::MAX;
                        let mut min_y = i32::MAX;
                        let mut max_x = i32::MIN;
                        let mut max_y = i32::MIN;
                        for p in &existing.polygon {
                            min_x = min_x.min(p[0]);
                            min_y = min_y.min(p[1]);
                            max_x = max_x.max(p[0]);
                            max_y = max_y.max(p[1]);
                        }
                        existing.box_ = BoxRect {
                            x: min_x.max(0),
                            y: min_y.max(0),
                            w: (max_x - min_x).max(1).min(page_w as i32 - min_x.max(0)),
                            h: (max_y - min_y).max(1).min(page_h as i32 - min_y.max(0)),
                        };
                        existing.inpaint_box = Some(expand_box(&existing.box_, inpaint_pct, page_w, page_h));
                        existing.typeset_box = Some(expand_box(&existing.box_, typeset_pct, page_w, page_h));

                        let mut combined_lines: Vec<(f32, String)> = Vec::new();
                        for line in existing.text.lines() {
                            let l_trim = line.trim();
                            if !l_trim.is_empty() {
                                combined_lines.push((e_min_v, l_trim.to_string()));
                            }
                        }
                        for line in r.text.lines() {
                            let l_trim = line.trim();
                            if !l_trim.is_empty() && !combined_lines.iter().any(|(_, cl)| cl == l_trim || cl.contains(l_trim)) {
                                combined_lines.push((r_min_v, l_trim.to_string()));
                            }
                        }
                        combined_lines.sort_by(|a, b| a.0.total_cmp(&b.0));
                        existing.text = combined_lines.into_iter().map(|(_, t)| t).collect::<Vec<_>>().join("\n");
                        break;
                    }
                }
            }
        }
        if !is_duplicate {
            deduped_regions.push(r);
        }
    }

    // CLEAN UI HEADER NAVIGATION CHEVRONS & RE-INDEX REGION IDS
    for (i, r) in deduped_regions.iter_mut().enumerate() {
        r.text = crate::ml::detect::clean_ui_header_text(&r.text);
        r.id = format!("r{}", i);
    }

    // EXPAND DIALOGUE-BUBBLE TEXT BASE BOUNDARY TO UTILIZE UNUSED BUBBLE AREA (BUBBLE TEXT ONLY)
    expand_bubble_text_boxes(&mut deduped_regions, page_w, page_h, inpaint_pct, typeset_pct);

    deduped_regions
}

// -- BUBBLE-TEXT BASE BOUNDARY EXPANSION -- //

/// INSCRIBED SAFE CORE OF A BUBBLE (THE STROKED OUTLINE IS AVOIDED). RETURNS (LEFT, RIGHT, TOP, BOTTOM).
fn bubble_core(b: &BoxRect) -> Option<(i32, i32, i32, i32)> {
    let m = ((b.w.min(b.h) as f32 * BUBBLE_INSET_FRAC) as i32).clamp(BUBBLE_INSET_MIN, BUBBLE_INSET_MAX);
    let left = b.x + m;
    let right = b.x + b.w - m;
    let top = b.y + m;
    let bottom = b.y + b.h - m;
    if right - left <= 8 || bottom - top <= 8 {
        None
    } else {
        Some((left, right, top, bottom))
    }
}

/// CLAMP A BOX SO IT STAYS WITHIN THE BUBBLE'S SAFE CORE.
fn clamp_box_to_core(b: &mut BoxRect, left: i32, right: i32, top: i32, bottom: i32) {
    let mut x = b.x.max(left);
    let mut r = (b.x + b.w).min(right);
    if r < x + 1 {
        r = (x + 1).min(right);
    }
    if r < x + 1 {
        x = r - 1;
    }
    b.x = x.max(0);
    b.w = (r - x).max(1);

    let mut y = b.y.max(top);
    let mut bot = (b.y + b.h).min(bottom);
    if bot < y + 1 {
        bot = (y + 1).min(bottom);
    }
    if bot < y + 1 {
        y = bot - 1;
    }
    b.y = y.max(0);
    b.h = (bot - y).max(1);
}

/// EXPAND DIALOGUE-BUBBLE TEXT BASE BOUNDARY TO BETTER UTILIZE THE UNUSED AREA WITHIN ITS BUBBLE.
///
/// KEEPS THE TEXT ANCHOR (BOX CENTROID) EXACTLY FIXED AND SCALES EACH AXIS SYMMETRICALLY ABOUT IT.
/// EVERY SCALED BOX IS BOUNDED BY (A) THE BUBBLE'S INSCRIBED SAFE CORE AND (B) THE NEAREST SIBLING
/// TEXT REGION INSIDE THE SAME COMBINED BUBBLE. IT IS A NO-OP WHEN THE UNUSED ROOM FALLS BELOW
/// THRESHOLD, SO CRAMPED BUBBLES ARE NEVER ALTERED. THE INPAINT MASK POLYGON IS LEFT TIGHT.
fn expand_bubble_text_boxes(regions: &mut Vec<Region>, page_w: u32, page_h: u32, inpaint_pct: f32, typeset_pct: f32) {
    if regions.is_empty() {
        return;
    }

    let is_bubble = |r: &Region| r.kind == RegionKind::DialogueBubble && r.bubble_box.is_some();
    let indexes: Vec<usize> = (0..regions.len()).filter(|&i| is_bubble(&regions[i])).collect();
    if indexes.is_empty() {
        return;
    }

    // PHASE 1: COMPUTE TARGET BASE BOXES FROM ORIGINAL GEOMETRY ONLY.
    // SIBLING LIMITS READ ORIGINAL (UNSCALED) BOXES SO THEY NEVER DEPEND ON ALREADY-SCALED NEIGHBORS.
    let mut targets: Vec<Option<BoxRect>> = vec![None; regions.len()];

    for &i in &indexes {
        let r = &regions[i];
        let (bx, by, bw, bh) = (r.box_.x, r.box_.y, r.box_.w, r.box_.h);
        if bw <= 2 || bh <= 2 {
            continue;
        }
        let b = match r.bubble_box.as_ref() {
            Some(b) => b,
            None => continue,
        };
        let (left, right, top, bottom) = match bubble_core(b) {
            Some(c) => c,
            None => continue,
        };

        let cx = bx + bw / 2;
        let cy = by + bh / 2;

        // PER-EDGE LIMITS START AT THE BUBBLE SAFE CORE, THEN SHRINK TOWARD THE NEAREST SIBLING.
        let mut left_limit = left;
        let mut right_limit = right;
        let mut top_limit = top;
        let mut bottom_limit = bottom;

        for &j in &indexes {
            if i == j {
                continue;
            }
            let bi = regions[i].bubble_box.as_ref().unwrap();
            let bj = match regions[j].bubble_box.as_ref() {
                Some(bj) => bj,
                None => continue,
            };
            if box_iou(bi, bj) < 0.5 {
                continue;
            }
            let s = &regions[j].box_;
            // HORIZONTAL INFLUENCE (VERTICAL SPANS OVERLAP)
            let y_overlap = (by + bh) > s.y && (s.y + s.h) > by;
            if y_overlap {
                if (s.x + s.w) <= cx && (s.x + s.w) > left_limit - SIBLING_GAP {
                    left_limit = (s.x + s.w + SIBLING_GAP).min(right);
                }
                if s.x >= cx && s.x < right_limit + SIBLING_GAP {
                    right_limit = (s.x - SIBLING_GAP).max(left);
                }
            }
            // VERTICAL INFLUENCE (HORIZONTAL SPANS OVERLAP)
            let x_overlap = (bx + bw) > s.x && (s.x + s.w) > bx;
            if x_overlap {
                if (s.y + s.h) <= cy && (s.y + s.h) > top_limit - SIBLING_GAP {
                    top_limit = (s.y + s.h + SIBLING_GAP).min(bottom);
                }
                if s.y >= cy && s.y < bottom_limit + SIBLING_GAP {
                    bottom_limit = (s.y - SIBLING_GAP).max(top);
                }
            }
        }

        // TRUST VERTICAL ORIENTATION ONLY WHEN THE CONTAINER IS CLEARLY VERTICAL (STRONG ASPECT EVIDENCE).
        let vertical = r.vertical && (bh as f32) >= (bw as f32) * 1.25;

        let mut new_box = r.box_.clone();

        // WIDTH AXIS (PRIMARY FOR HORIZONTAL TEXT)
        {
            let center = cx as f32;
            let half = bw as f32 / 2.0;
            let lower_ext = (center - left_limit as f32).max(half);
            let upper_ext = (right_limit as f32 - center).max(half);
            let is_primary = !vertical;
            let cap = if is_primary { CAP_PRIMARY } else { CAP_SECONDARY };
            let mut scale = (lower_ext.min(upper_ext) / half).min(cap);
            if !is_primary {
                scale = 1.0 + (scale - 1.0) * CROSS_AXIS_FRACTION;
            }
            let usable = (right_limit as f32 - left_limit as f32) - bw as f32;
            if usable >= bw as f32 * MIN_UNUSED_RATIO && scale >= MIN_SCALE {
                let nh = (half * scale).round() as i32;
                let nx = cx - nh;
                let nr = cx + nh;
                if nr > nx {
                    new_box.x = nx.max(left);
                    new_box.w = (nr.min(right) - new_box.x).max(1);
                }
            }
        }

        // HEIGHT AXIS (PRIMARY FOR VERTICAL TEXT)
        {
            let center = cy as f32;
            let half = bh as f32 / 2.0;
            let lower_ext = (center - top_limit as f32).max(half);
            let upper_ext = (bottom_limit as f32 - center).max(half);
            let is_primary = vertical;
            let cap = if is_primary { CAP_PRIMARY } else { CAP_SECONDARY };
            let mut scale = (lower_ext.min(upper_ext) / half).min(cap);
            if !is_primary {
                scale = 1.0 + (scale - 1.0) * CROSS_AXIS_FRACTION;
            }
            let usable = (bottom_limit as f32 - top_limit as f32) - bh as f32;
            if usable >= bh as f32 * MIN_UNUSED_RATIO && scale >= MIN_SCALE {
                let nh = (half * scale).round() as i32;
                let ny = cy - nh;
                let nb = cy + nh;
                if nb > ny {
                    new_box.y = ny.max(top);
                    new_box.h = (nb.min(bottom) - new_box.y).max(1);
                }
            }
        }

        if new_box != r.box_ {
            targets[i] = Some(new_box);
        }
    }

    // PHASE 2: APPLY TARGETS AND RE-DERIVE INPAINT / TYPESET BOXES, THEN SANITY-ROLLBACK COLLISIONS.
    for &i in &indexes {
        let new_box = match &targets[i] {
            Some(nb) => nb.clone(),
            None => continue,
        };
        let b = regions[i].bubble_box.as_ref().unwrap();
        // CLAMP TO THE ACTUAL BUBBLE BOX (NOT THE INSCRIBED SAFE CORE) SO THE PADDING
        // FROM expand_box IS PRESERVED ON ALL SIDES WHILE NEVER BLEEDING PAST THE BUBBLE.
        let (left, right, top, bottom) = (b.x, b.x + b.w, b.y, b.y + b.h);

        // COLLISION ROLLBACK AGAINST NON-SIBLING REGIONS (FREE TEXT / SFX / OTHER BUBBLES)
        let collides = regions.iter().enumerate().any(|(j, o)| {
            j != i
                && o.box_.w > 0
                && o.box_.h > 0
                && {
                    let ax1 = (new_box.x + new_box.w).min(o.box_.x + o.box_.w);
                    let ay1 = (new_box.y + new_box.h).min(o.box_.y + o.box_.h);
                    let ix = (ax1 - new_box.x.max(o.box_.x)).max(0);
                    let iy = (ay1 - new_box.y.max(o.box_.y)).max(0);
                    let inter = (ix * iy) as f32;
                    let area = (new_box.w * new_box.h).max(1) as f32;
                    inter / area >= 0.35
                }
        });
        if collides {
            continue;
        }

        regions[i].box_ = new_box;

        let mut tb = expand_box(&regions[i].box_, typeset_pct, page_w, page_h);
        clamp_box_to_core(&mut tb, left, right, top, bottom);
        regions[i].typeset_box = Some(tb);

        let mut ib = expand_box(&regions[i].box_, inpaint_pct, page_w, page_h);
        clamp_box_to_core(&mut ib, left, right, top, bottom);
        regions[i].inpaint_box = Some(ib);
    }
}
