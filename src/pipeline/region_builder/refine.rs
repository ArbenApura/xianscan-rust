// -- CRATE / EXTERNAL IMPORTS -- //
use image::DynamicImage;

// -- INTERNAL IMPORTS -- //
use crate::ml::geometry::polygon_bounds;
use crate::ml::ocr::{OcrLine, RapidOcr};
use crate::ml::schemas::BoxRect;

// -- TYPES & STRUCTS -- //

/// RESULT OF TARGETED CROP REFINEMENT
pub struct RefinementOutcome {
    pub text: String,
    pub avg_score: f32,
    pub active_line_polys: Vec<Vec<[i32; 2]>>,
    pub is_container_vert: bool,
    pub angle_deg: f32,
}

/// RESULT OF FALLBACK TARGETED CROP RECOGNITION FOR MISSED DETECTOR BOX
pub struct FallbackCropOutcome {
    pub text: String,
    pub score: f32,
    pub polys: Vec<Vec<[i32; 2]>>,
}

// -- FUNCTIONS & ALGORITHMS -- //

/// ATTEMPT LOCALIZED CROP RECOGNITION REFINEMENT TO RECOVER MISSED CHARACTERS / ELLIPSES
pub fn try_refine_cluster_crop(
    ocr: &mut Option<RapidOcr>,
    img: &DynamicImage,
    box_rect: &BoxRect,
    cluster_rect: &BoxRect,
    cluster_lines: &[&OcrLine],
    combined_text: &str,
    avg_score: f32,
    angle_deg: f32,
    is_container_vert: bool,
    is_bubble: bool,
    is_cjk: bool,
    source_lang: Option<&str>,
    page_w: u32,
    page_h: u32,
) -> Option<RefinementOutcome> {
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
    let is_clean_dense_multiline = cluster_lines.len() >= 3 && avg_score >= 0.70 && (container_h as f32) <= (cluster_lines.len() as f32 * 32.0).max(cluster_rect.h as f32 * 1.35);
    let full_page_is_complete = (is_clean_dense_multiline || is_clean_single_line) && !is_container_wider;
    let is_standalone_alphanumeric_risk = is_cjk && crate::ml::detect::is_standalone_alphanumeric_without_cjk(combined_text);
    let is_corrupted_latin_in_bubble = is_bubble
        && is_cjk
        && !crate::ml::detect::has_cjk_characters(combined_text)
        && combined_text.chars().any(|c| c.is_ascii_alphabetic());
    let is_clean_expressive_punct = is_combined_pure_punct && avg_score >= 0.70;
    let can_refine_crop = (is_bubble || is_container_wider || is_container_taller || is_short_text_partial || is_standalone_alphanumeric_risk || is_corrupted_latin_in_bubble)
        && (cluster_rect.w >= 16 || box_rect.w >= 16)
        && (cluster_rect.h >= 16 || box_rect.h >= 16)
        && (!full_page_is_complete || is_corrupted_latin_in_bubble)
        && !is_clean_expressive_punct;

    if !can_refine_crop {
        return None;
    }

    let target_rect = if is_bubble || (is_container_taller && cluster_lines.len() <= 2) || (is_container_wider && cluster_lines.len() <= 2) || (is_standalone_alphanumeric_risk && cluster_lines.len() <= 2) {
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

    if crop_w < 16 || crop_h < 16 {
        return None;
    }

    let o = ocr.as_mut()?;
    let crop = img.crop_imm(crop_x, crop_y, crop_w, crop_h);
    let res = match o.recognize_crop_with_lang(&crop, source_lang) {
        Ok(Some(r)) => r,
        _ => return None,
    };

    let mut valid_crop_lines: Vec<_> = if is_cjk {
        res.lines
            .iter()
            .filter(|(_, text, score)| {
                let t = text.trim();
                if t.is_empty() || crate::ml::detect::is_watermark_line(t) {
                    return false;
                }
                let is_punct = t.chars().all(|c| c.is_ascii_punctuation() || matches!(c, '！' | '？' | '!' | '?' | '…'));
                if !is_punct && crate::ml::detect::is_standalone_alphanumeric_without_cjk(t) && t.chars().count() <= 5 && *score < 0.85 {
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

    // IF THE CROP RESULT MERGED LINES ACROSS MULTIPLE SEPARATE DIALOGUE SENTENCES OR EXPANDED A CLEAN SINGLE LINE IN A COMPACT CONTAINER, DO NOT REPLACE
    let is_excessive_expansion = !is_bubble && (
        (combined_cjk_count >= 3 && crop_cjk_count >= (combined_cjk_count * 5 / 2))
            || (cluster_lines.len() == 1 && avg_score >= 0.70 && !combined_text.contains('\n') && clean_crop_text.contains('\n') && !is_container_vert && target_rect.h <= 45)
    );

    // PREVENT CORRUPTING VALID PUNCTUATION CLUSTERS (?!, !?, ...) INTO SPLIT DIGIT/BULLET/LETTER ARTIFACTS (21, ●, 12, N)
    let is_crop_digits_bullets_or_noise = clean_crop_text.chars().all(|c| {
        c.is_ascii_digit() || c.is_whitespace() || matches!(c, '●' | '○' | '•' | '·' | 'N' | 'n' | 'v' | 'V' | 'u' | 'U' | 'l' | 'I' | '|')
    });
    let is_corrupted_punct_to_digits = is_combined_pure_punct && is_crop_digits_bullets_or_noise;

    let is_improved = if is_cjk {
        !is_excessive_expansion && !is_corrupted_punct_to_digits && (
            crop_cjk_count > combined_cjk_count
                || (is_corrupted_latin_in_bubble && crop_cjk_count >= 1)
                || has_more_ellipsis
                || (is_combined_pure_punct && clean_crop_text.chars().any(|c| matches!(c, '！' | '？' | '!' | '?')))
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

    if !is_improved || clean_crop_text.is_empty() {
        return None;
    }

    let is_slanted_multiline_block = cluster_lines.len() >= 3 && angle_deg.abs() >= 1.5 && valid_crop_lines.len() <= 2;
    let mut out_polys = Vec::new();
    let mut out_vert = is_container_vert;
    let mut out_angle = angle_deg;

    if !valid_crop_lines.is_empty() && !is_slanted_multiline_block {
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
            out_polys.push(page_poly);
        }
        if crop_v_count > 0 || crop_h_count > 0 {
            out_vert = crop_v_count > crop_h_count;
            if out_vert {
                out_angle = 0.0;
            }
        }
    }

    Some(RefinementOutcome {
        text: clean_crop_text,
        avg_score: res.score,
        active_line_polys: out_polys,
        is_container_vert: out_vert,
        angle_deg: out_angle,
    })
}

/// RUN FALLBACK TARGETED CROP RECOGNITION WHEN FULL-PAGE OCR MISSED A DETECTOR CONTAINER
pub fn run_fallback_crop_recognition(
    ocr: &mut Option<RapidOcr>,
    img: &DynamicImage,
    box_rect: &BoxRect,
    is_bubble: bool,
    is_container_vert: bool,
    source_lang: Option<&str>,
    page_w: u32,
    page_h: u32,
) -> Option<FallbackCropOutcome> {
    let pad_x = if is_bubble { 6 } else if is_container_vert { 8 } else { 15 };
    let pad_y = if is_bubble { 6 } else if is_container_vert { 18 } else { 8 };
    let crop_x = (box_rect.x - pad_x).max(0) as u32;
    let crop_y = (box_rect.y - pad_y).max(0) as u32;
    let crop_w = ((box_rect.w + pad_x * 2) as u32).min(page_w - crop_x);
    let crop_h = ((box_rect.h + pad_y * 2) as u32).min(page_h - crop_y);

    if crop_w < 16 || crop_h < 16 {
        return None;
    }

    let o = ocr.as_mut()?;
    let crop = img.crop_imm(crop_x, crop_y, crop_w, crop_h);

    let mut isolated_text = String::new();
    let mut isolated_score = 0.80f32;
    let mut fallback_polys = Vec::new();

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

    if isolated_text.is_empty() {
        return None;
    }

    Some(FallbackCropOutcome {
        text: isolated_text,
        score: isolated_score,
        polys: fallback_polys,
    })
}
