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

    // CLEAN TRAILING WATERMARK DEBRIS AND ADJUST LINE POLYGONS PROPORTIONALLY
    let cleaned_split_lines: Vec<OcrLine> = split_lines
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
    let split_lines = &cleaned_split_lines;

    // ORPHAN OCR LINES: LINES WHOSE CENTER LIES INSIDE NO CANDIDATE BOX. IF SUCH A LINE
    // SITS INSIDE A DETECTED SPEECH BUBBLE IT IS STILL THAT BUBBLE'S DIALOGUE (THE DETECTOR
    // BOX MAY HUG ONLY ONE LOBE OF A STAGGERED BALLOON), SO THE FIRST BUBBLE-BACKED
    // CONTAINER THAT COVERS IT CLAIMS IT — EXACTLY ONCE, VIA THIS CLAIM REGISTRY.
    let mut orphan_claims: Vec<bool> = split_lines
        .iter()
        .map(|l| {
            !dedup_boxes.iter().any(|cb| {
                let (rx, ry, rw, rh) = crate::ml::geometry::box_to_xywh_f32(cb);
                let r = BoxRect { x: rx.max(0.0) as i32, y: ry.max(0.0) as i32, w: rw.max(1.0) as i32, h: rh.max(1.0) as i32 };
                line_center_inside_box(&l.polygon, &r)
            })
        })
        .collect();

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

        // BUBBLE-ENVELOPE LINE COMPLETION: A BUBBLE-BACKED CANDIDATE BOX CAN BE A PARTIAL
        // SLICE OF THE BALLOON (E.G. A STAGGERED DOUBLE-LOBE BALLOON WHERE THE DETECTOR BOX
        // HUGS ONE LOBE), ORPHANING THE OUTERMOST TEXT COLUMN WHOSE CENTER SITS INSIDE THE
        // BUBBLE BUT OUTSIDE THE TIGHT CANDIDATE BOX. LINES INSIDE THE MATCHED BUBBLE ARE
        // SEMANTICALLY THIS BUBBLE'S DIALOGUE — PULL THEM IN SO THE UTTERANCE CLUSTERING
        // SEES THE COMPLETE SET. THE VERTICAL UTTERANCE CLUSTERER, NOT THE CANDIDATE BOX,
        // IS THE CORRECT SPLIT AUTHORITY INSIDE A BALLOON.
        if std::env::var("XIANSCAN_DISABLE_ORPHAN").is_err() {
            if let Some(mb) = matched_bubble {
                for (li, l) in split_lines.iter().enumerate() {
                    if !orphan_claims[li] {
                        continue;
                    }
                    if crate::ml::detect::is_repetitive_tabular_text(&l.text) || crate::ml::detect::is_standalone_table_cell(&l.text) {
                        continue;
                    }
                    if line_center_inside_box(&l.polygon, mb) {
                        matched.push(l);
                        orphan_claims[li] = false;
                    }
                }
            }
        }

        // ATTACH ORPHAN PUNCTUATION LINES IMMEDIATELY ADJACENT TO MATCHED TEXT LINES
        // In vertical manga typography, exclamation marks / punctuation at the bottom of a vertical column
        // (e.g. '!!', '!?') often sit slightly offset to the left/bottom of the main text stroke.
        if !matched.is_empty() {
            for (li, l) in split_lines.iter().enumerate() {
                if !orphan_claims[li] {
                    continue;
                }
                let t = l.text.trim();
                let is_pure_punct = !t.is_empty() && t.chars().all(|c| matches!(c, '！' | '？' | '!' | '?' | '…' | 'ー' | '─' | '～' | '~' | '―'));
                if is_pure_punct {
                    let (lx, ly, lw, lh) = polygon_bounds(&l.polygon);
                    let is_adjacent_to_matched = matched.iter().any(|m| {
                        let (mx, my, mw, mh) = polygon_bounds(&m.polygon);
                        let overlap_y = (ly + lh).min(my + mh) - ly.max(my);
                        let vert_gap = if ly >= my + mh { ly - (my + mh) } else if my >= ly + lh { my - (ly + lh) } else { 0 };
                        let horiz_gap = if lx >= mx + mw { lx - (mx + mw) } else if mx >= lx + lw { mx - (lx + lw) } else { 0 };
                        (overlap_y > 0 && horiz_gap <= 45) || (vert_gap <= 35 && horiz_gap <= 45)
                    });
                    if is_adjacent_to_matched {
                        matched.push(l);
                        orphan_claims[li] = false;
                    }
                }
            }
        }

        // IN NON-LATIN SCRIPT SOURCES (E.G. KOREAN, CJK), DROP OVERLAPPING PURE LATIN NOISE LINES AND DIGIT NOISE
        if crate::ml::detect::is_non_latin_source(source_lang) && matched.iter().any(|l| {
            let t = l.text.trim();
            crate::ml::detect::has_native_script_for_lang(t, source_lang)
        }) {
            matched.retain(|l| {
                let t = l.text.trim();
                let has_nat = crate::ml::detect::has_native_script_for_lang(t, source_lang);
                if has_nat {
                    return true;
                }
                let is_punct = t.chars().any(|c| matches!(c, '！' | '？' | '!' | '?' | '…'));
                let is_pure_latin_word = !is_punct && t.chars().all(|c| c.is_ascii_alphabetic() || c.is_whitespace() || c.is_ascii_punctuation());
                let is_noise_or_digit = !is_punct && (crate::ml::detect::is_standalone_digit_or_particle_noise(t) || crate::ml::detect::is_standalone_noise_stroke(t));
                (!is_pure_latin_word && !is_noise_or_digit) || crate::ml::detect::is_onomatopoeia_or_shout(t)
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

            // PRUNE WIDE MULTI-LINE COMPOSITE OCR BLOCKS (CONTAINING NEWLINES) ONLY WHEN CONTAINER IS DETERMINED VERTICAL AND INDIVIDUAL VERTICAL COLUMN LINES ARE ALSO PRESENT IN THE SAME CONTAINER
            if is_container_vert {
                let has_individual_vert_lines = matched.iter().any(|l| {
                    let (_, _, lw, lh) = polygon_bounds(&l.polygon);
                    let is_vert = if is_cjk { lh >= lw || lh > (lw as f32 * 1.10) as i32 } else { lh > (lw as f32 * 1.25) as i32 };
                    is_vert && !l.text.contains('\n')
                });
                if has_individual_vert_lines {
                    matched.retain(|l| {
                        let (_, _, lw, lh) = polygon_bounds(&l.polygon);
                        let is_wide_composite = (lw as f32) >= lh as f32 * 0.85 && l.text.contains('\n');
                        !is_wide_composite
                    });
                }
            }

            for &m in &matched {
                let (_, _, lw, lh) = polygon_bounds(&m.polygon);
                let area = (lw * lh) as i64;
                let is_vert_line = if is_cjk {
                    lh >= lw || lh > (lw as f32 * 1.10) as i32
                } else {
                    lh > (lw as f32 * 1.25) as i32
                };
                if is_vert_line {
                    v_count += 1;
                    v_area += area;
                } else {
                    h_count += 1;
                    h_area += area;
                }
            }

            is_container_vert = if v_count > 0 && h_count > 0 {
                // If there are multiple distinct vertical lines or high vertical count, or container is tall/square-bubble with vertical lines
                v_area > (h_area as f32 * 1.20) as i64 || (box_rect.h > (box_rect.w as f32 * 1.2) as i32 && v_count >= h_count) || (v_count >= 2 && v_count >= h_count) || (matched_bubble.is_some() && is_cjk && v_count >= 2)
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
                    let is_line_vert = if is_cjk {
                        lh >= lw || lh > (lw as f32 * 1.10) as i32
                    } else {
                        lh > (lw as f32 * 1.25) as i32
                    };
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

            // SUPPRESS ISOLATED WATERMARK, RESIDUE LINES, AND TABULAR NOISE LINES
            orientation_filtered.retain(|l| {
                let t = l.text.trim();
                !crate::ml::detect::is_pure_watermark_region(t)
                    && !crate::ml::detect::is_repetitive_tabular_text(t)
                    && !crate::ml::detect::is_standalone_table_cell(t)
            });

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
                    let is_garbled_latin_debris = {
                        let non_nat = t.chars().filter(|c| c.is_ascii_alphabetic()).count();
                        let nat = t.chars().filter(|c| crate::ml::detect::has_native_script_for_lang(&c.to_string(), source_lang)).count();
                        non_nat >= 3 && non_nat >= nat * 2
                    };
                    let is_single_letter_latin_debris = lacks_native && !is_punct && t.len() == 1 && t.chars().all(|c| c.is_ascii_alphabetic());
                    (!is_pure_latin_word && !is_noise_or_digit && !is_garbled_latin_debris && !is_single_letter_latin_debris) || crate::ml::detect::is_onomatopoeia_or_shout(t)
                });
            }

            // IN VERTICAL CONTAINERS, IF INDIVIDUAL COLUMN LINES EXIST THAT COVER THE SAME BOUNDS AS A WIDE MULTI-LINE COMPOSITE OCR BLOCK, PRUNE THE COMPOSITE BLOCK
            if is_container_vert {
                let has_individual_columns = orientation_filtered.iter().any(|l| {
                    let (_, _, lw, lh) = polygon_bounds(&l.polygon);
                    lh > (lw as f32 * 1.50) as i32
                });
                if has_individual_columns {
                    orientation_filtered.retain(|l| {
                        let (_, _, lw, lh) = polygon_bounds(&l.polygon);
                        let is_wide_composite = (lw as f32) >= lh as f32 * 0.90 && l.text.contains('\n');
                        !is_wide_composite
                    });
                }
            }

            let mut sanitized_lines: Vec<OcrLine> = Vec::new();
            for &m in &orientation_filtered {
                let clean_m = crate::ml::detect::clean_stray_ocr_artifacts(&m.text);
                let clean_m = clean_m.trim();
                if clean_m.is_empty() {
                    continue;
                }
                let (stripped_text, _) = crate::ml::detect::strip_trailing_watermark_debris(clean_m, source_lang);
                let mut clone_line = m.clone();
                clone_line.text = if stripped_text.trim().is_empty() { clean_m.to_string() } else { stripped_text };
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
                    let min_col_w = mw.min(ow);
                    let col_center_dist = ((mx + mw / 2) - (ox + ow / 2)).abs();
                    let is_same_column = col_center_dist <= (min_col_w as f32 * 0.50).max(25.0) as i32;
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

                    // FURIGANA / RUBY PARALLEL SATELLITE COLUMN DEDUPLICATION (M IS MINOR FURIGANA ALONGSIDE O)
                    // In Japanese typography, furigana (ruby) is distinctly narrower (font width <= 55% of base kanji)
                    // and spans vertically along the base kanji with short character counts (<= 4 chars).
                    let is_m_furigana_of_o = is_container_vert
                        && !is_punct_m
                        && !is_punct_o
                        && (mw as f32) <= (ow as f32 * 0.55)
                        && clean_m.chars().count() <= 4
                        && (overlap_y.max(0) as f32 / mh.max(1) as f32 >= 0.70)
                        && (clean_m.chars().count() <= clean_o.chars().count());

                    let vert_col_sub_overlap = vert_col_overlap && is_same_column;
                    if ((iou >= 0.40 || overlap_ratio_m >= 0.60 || (vert_col_sub_overlap && is_sub) || (vert_col_overlap && is_exact) || is_horizontal_suffix_noise || (overlap_ratio_m >= 0.30 && is_sub) || is_m_furigana_of_o) && (is_exact || is_sub || is_horizontal_suffix_noise || is_m_furigana_of_o))
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
                        let min_col_w = mw.min(ow);
                        let col_center_dist = ((mx + mw / 2) - (ox + ow / 2)).abs();
                        let is_same_column = col_center_dist <= (min_col_w as f32 * 0.50).max(25.0) as i32;
                        let max_neg_col_x = -(min_h_mo as f32 * 0.60).max(15.0) as i32;
                        let vert_col_overlap = if is_container_vert && mh > 0 && oh > 0 {
                            overlap_y.max(0) as f32 / min_h_mo as f32 >= 0.50 && overlap_x >= max_neg_col_x
                        } else {
                            false
                        };
                        let vert_col_sub_overlap = vert_col_overlap && is_same_column;
                        let is_existing_exact = clean_m == clean_o;

                        let is_existing_suffix_noise = !is_container_vert
                            && clean_o.chars().count() == 1
                            && clean_o.chars().all(|c| c.is_ascii_digit())
                            && clean_m.chars().count() >= 6
                            && ox >= mx + (mw * 3 / 4)
                            && overlap_y.max(0) as f32 / mh.min(oh).max(1) as f32 >= 0.50;

                        let is_punct_o = clean_o.chars().all(|c| c.is_ascii_punctuation() || matches!(c, '！' | '？' | '!' | '?' | '…'));
                        let is_punct_m = clean_m.chars().all(|c| c.is_ascii_punctuation() || matches!(c, '！' | '？' | '!' | '?' | '…'));
                        let is_vert_col_text_and_punct = is_container_vert && (is_punct_m != is_punct_o);

                        let is_o_furigana_of_m = is_container_vert
                            && !is_punct_o
                            && !is_punct_m
                            && (ow as f32) <= (mw as f32 * 0.55)
                            && clean_o.chars().count() <= 4
                            && (overlap_y.max(0) as f32 / oh.max(1) as f32 >= 0.70)
                            && (clean_o.chars().count() <= clean_m.chars().count());

                        let is_existing_dup = ((iou >= 0.40 || overlap_ratio_o >= 0.60 || (vert_col_sub_overlap && is_existing_sub) || (vert_col_overlap && is_existing_exact) || is_existing_suffix_noise || (overlap_ratio_o >= 0.30 && is_existing_sub) || is_o_furigana_of_m) && (is_existing_exact || is_existing_sub || is_existing_suffix_noise || is_o_furigana_of_m))
                            && !is_vert_col_text_and_punct;
                        !is_existing_dup
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

            // CONTAINER-BOUNDARY EXPANSION IS ONLY VALID FOR A SINGLE-UTTERANCE CONTAINER:
            let container_is_single_utterance = clusters.len() <= 1;

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
                    if (median_line_angle.abs() < 4.0 && (box_angle == 0.0 || box_angle.abs() < 1.5)) || (matched_bubble.is_some() && median_line_angle.abs() < 4.5 && box_angle.abs() < 2.0) {
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
                combined_text = crate::ml::detect::clean_stray_ocr_artifacts(&combined_text);
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
                let mut cluster_rect = BoxRect {
                    x: c_min_x.max(0),
                    y: c_min_y.max(0),
                    w: (c_max_x - c_min_x).max(1),
                    h: (c_max_y - c_min_y).max(1),
                };

                // REFINEMENT VIA TARGETED CROP RECOGNITION. A BUBBLE-BACKED CONTAINER THAT THE
                // UTTERANCE CLUSTERER SPLIT INTO MULTIPLE UTTERANCES (E.G. A TWO-LOBE CONNECTED
                // BALLOON) MUST NOT RE-SCAN THE WHOLE-BALLOON CROP: THE CROP SPANS BOTH
                // UTTERANCES, SO THE CROP RESULT CROSS-CONTAMINATES THE SIBLINGS (INTERLEAVED
                // COLUMNS, FLIPPED ORIENTATION, MERGED UTTERANCES). FREE-TEXT NARRATION
                // CONTAINERS HAVE NO SIBLING LOBES — EACH CLUSTER IS AN INDEPENDENT PARAGRAPH
                // WHOSE CROP IS TIGHT TO ITS OWN LINES, SO REFINEMENT IS SAFE FOR ALL
                // FREE-TEXT CONTAINERS REGARDLESS OF CLUSTER COUNT.
                let refine_outcome = if container_is_single_utterance || matched_bubble.is_none() {
                    try_refine_cluster_crop(
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
                    )
                } else {
                    None
                };
                if let Some(refined) = refine_outcome {
                    combined_text = refined.text;
                    avg_score = refined.avg_score;
                    if !refined.active_line_polys.is_empty() {
                        active_line_polys = refined.active_line_polys;
                        is_container_vert = refined.is_container_vert;
                        angle_deg = refined.angle_deg;

                        let mut r_min_x = i32::MAX;
                        let mut r_min_y = i32::MAX;
                        let mut r_max_x = i32::MIN;
                        let mut r_max_y = i32::MIN;
                        for poly in &active_line_polys {
                            for p in poly {
                                r_min_x = r_min_x.min(p[0]);
                                r_min_y = r_min_y.min(p[1]);
                                r_max_x = r_max_x.max(p[0]);
                                r_max_y = r_max_y.max(p[1]);
                            }
                        }
                        if r_min_x < r_max_x && r_min_y < r_max_y {
                            cluster_rect = BoxRect {
                                x: r_min_x.max(0),
                                y: r_min_y.max(0),
                                w: (r_max_x - r_min_x).max(1),
                                h: (r_max_y - r_min_y).max(1),
                            };
                        }
                    }
                }

                let is_cluster_in_bubble = is_bubble_region || matched_bubble.is_some() || bubbles.iter().any(|b| {
                    let cx = cluster_rect.x + cluster_rect.w / 2;
                    let cy = cluster_rect.y + cluster_rect.h / 2;
                    cx > b.x + 8 && cx < b.x + b.w - 8 && cy > b.y + 8 && cy < b.y + b.h - 8
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

                    // CONTAINER-BOUNDARY EXPANSION ONLY FOR SINGLE-UTTERANCE CONTAINERS:
                    // A SPLIT MULTI-UTTERANCE CONTAINER MUST KEEP PER-CLUSTER TIGHT BOUNDS
                    // SO SIBLING REGIONS DO NOT OVERLAP INTO CONTAINMENT-DROP AT DEDUP.
                    let max_horiz_pad = if is_container_vert || is_detector_vert { (box_rect.w as f32 * 0.85).clamp(60.0, 160.0) as i32 } else { 45 };
                    if container_is_single_utterance && (box_rect.x + box_rect.w) > max_x && (box_rect.x + box_rect.w - max_x) <= max_horiz_pad && min_x >= box_rect.x - 25 {
                        max_x = max_x.max(box_rect.x + box_rect.w);
                    }

                    if container_is_single_utterance && (box_rect.x < min_x) && (min_x - box_rect.x) <= 160 && (box_rect.y <= min_y + 15 && box_rect.y + box_rect.h >= max_y - 15) {
                        min_x = min_x.min(box_rect.x);
                    }

                    let is_horizontal_single_line_free_text = !is_container_vert && !is_detector_vert && matched_bubble.is_none() && cluster_lines.len() == 1;
                    if container_is_single_utterance && !is_horizontal_single_line_free_text && (box_rect.y < min_y) && (min_y - box_rect.y) <= 45 && (box_rect.x <= min_x + 15 && box_rect.x + box_rect.w >= max_x - 15) {
                        min_y = min_y.min(box_rect.y);
                    } else if container_is_single_utterance && !is_horizontal_single_line_free_text && (is_container_vert || is_detector_vert || matched_bubble.is_some()) && box_rect.y < min_y && (min_y - box_rect.y) <= 400 {
                        min_y = min_y.min(box_rect.y);
                    }

                    let max_vert_trailing_pad = ((box_rect.h as f32 * 0.50).round() as i32).max(180);
                    if container_is_single_utterance && (is_container_vert || is_detector_vert) && (box_rect.y + box_rect.h) > max_y && (box_rect.y + box_rect.h - max_y) <= max_vert_trailing_pad {
                        max_y = max_y.max(box_rect.y + box_rect.h);
                    } else if container_is_single_utterance && matched_bubble.is_some() && (box_rect.y + box_rect.h) > max_y && (box_rect.y + box_rect.h - max_y) <= 25 && min_x >= box_rect.x - 10 && max_x <= box_rect.x + box_rect.w + 10 {
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
                    let font_scale = super::clustering::polygon_thickness(&active_line_polys[0]);
                    let u_pad = (font_scale * 0.90).clamp(18.0, 35.0);
                    let v_pad = (font_scale * 0.60).clamp(10.0, 25.0);
                    min_u -= u_pad;
                    max_u += u_pad;
                    max_v += v_pad;
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

                let matched_bubble_final = if let Some(mb) = matched_bubble {
                    let f_area = (final_box_rect.w * final_box_rect.h).max(1);
                    let ix = (final_box_rect.x + final_box_rect.w).min(mb.x + mb.w) - final_box_rect.x.max(mb.x);
                    let iy = (final_box_rect.y + final_box_rect.h).min(mb.y + mb.h) - final_box_rect.y.max(mb.y);
                    if ix > 0 && iy > 0 && ((ix * iy) as f32 / f_area as f32 >= 0.55) {
                        Some(mb.clone())
                    } else {
                        None
                    }
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
                    RegionKind::FreeText
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
                    carrier_box: None,
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
                    carrier_box: None,
                });
            }
        }
    }

    // DEDUPLICATE & UNIFY SLANTED STATUS CARD REGIONS
    if std::env::var("XIANSCAN_PROBE").is_ok() {
        eprintln!("[PROBE-PREDEDUP] {} regions: {:?}", regions.len(), regions.iter().map(|r| format!("{}@{:?}v{}", r.text.replace('\n', "|"), r.box_, r.vertical as i32)).collect::<Vec<_>>());
    }
    let mut deduped_regions = deduplicate_and_unify_regions(regions, img, page_w, page_h, inpaint_pct, typeset_pct);
    if std::env::var("XIANSCAN_PROBE").is_ok() {
        eprintln!("[PROBE-POSTDEDUP] {} regions: {:?}", deduped_regions.len(), deduped_regions.iter().map(|r| format!("{}@{:?}", r.text.replace('\n', "|"), r.box_)).collect::<Vec<_>>());
    }

    // EXPAND DIALOGUE-BUBBLE TEXT BASE BOUNDARY TO UTILIZE UNUSED BUBBLE AREA (BUBBLE TEXT ONLY)
    expand_bubble_text_boxes(&mut deduped_regions, Some(img), page_w, page_h, inpaint_pct, typeset_pct);

    deduped_regions
}
