// -- CRATE / EXTERNAL IMPORTS -- //
use image::DynamicImage;

// -- INTERNAL IMPORTS -- //
use crate::ml::geometry::polygon_bounds;
use crate::ml::ocr::OcrLine;
use crate::ml::schemas::BoxRect;
use super::geometry::compute_chromatic_color_variance;

// -- FUNCTIONS & ALGORITHMS -- //

/// CHECK IF A CANDIDATE TEXT REGION SHOULD BE REJECTED AS ARTIFACT, NOISE, OR HALLUCINATION
pub fn should_reject_candidate_region(
    cleaned: &str,
    cluster_rect: &BoxRect,
    avg_score: f32,
    angle_deg: f32,
    is_bubble: bool,
    is_cjk: bool,
    source_lang: Option<&str>,
    img: &DynamicImage,
    page_w: u32,
    page_h: u32,
    split_lines: &[OcrLine],
    bubbles: &[BoxRect],
) -> bool {
    if cleaned.is_empty() {
        return true;
    }

    let ref_dim = (page_w as f32).min(page_h as f32).max(400.0);

    // 1. DROP GIANT ARTWORK HALLUCINATIONS OR SPRAWLING NOISE BOXES
    let max_art_w = ((page_w as f32 * 0.35).max(300.0)) as i32;
    let max_art_h = ((ref_dim * 0.50).max(450.0)) as i32;
    if !is_bubble && cluster_rect.w >= max_art_w && cluster_rect.h >= max_art_h && avg_score < 0.65 {
        return true;
    }
    let char_count = cleaned.chars().filter(|c| !c.is_whitespace()).count();
    let is_wide_artwork_hallucination = !is_bubble
        && cluster_rect.w >= (page_w as f32 * 0.75) as i32
        && cluster_rect.h >= (ref_dim * 0.14).max(120.0) as i32
        && (avg_score < 0.68 || char_count <= 4 || (compute_chromatic_color_variance(img, cluster_rect) >= 15.0 && char_count <= 8));
    if is_wide_artwork_hallucination {
        return true;
    }

    // 2. DROP HIGH-TILT NON-DIALOGUE WITH LOW RECOGNITION CONFIDENCE OR SHORT ARTWORK SFX ON CHROMATIC BACKGROUND
    let char_count = cleaned.chars().filter(|c| !c.is_whitespace()).count();
    if !is_bubble {
        if angle_deg.abs() >= 12.0 && (avg_score < 0.65 || (char_count <= 2 && avg_score < 0.75 && compute_chromatic_color_variance(img, cluster_rect) >= 12.0)) {
            return true;
        }
    }

    // 3. DROP STANDALONE REPEATED NOISE STROKES
    if crate::ml::detect::is_standalone_noise_stroke(cleaned) {
        return true;
    }

    // 3b. DROP STACKED DISPLAY CALLIGRAPHY COLUMNS (TECHNIQUE NAMES / TITLES LETTERED ONE GLYPH PER LINE)
    // STYLIZED BRUSH / OUTLINED LETTERING IS ALWAYS SEGMENTED AS ONE HUGE GLYPH PER OCR LINE,
    // WHILE REAL READING TEXT (NARRATION, CAPTIONS) CARRIES MULTIPLE GLYPHS PER LINE IN EVERY LANGUAGE.
    // BUBBLE-BACKED DIALOGUE IS NEVER AFFECTED.
    if !is_bubble && cluster_rect.h > cluster_rect.w {
        let glyph_rows: Vec<usize> = cleaned
            .lines()
            .map(|l| l.chars().filter(|c| !c.is_whitespace()).count())
            .filter(|&n| n > 0)
            .collect();
        let is_stacked_calligraphy = glyph_rows.len() >= 3
            && glyph_rows.iter().all(|&n| n <= 2)
            && glyph_rows.iter().sum::<usize>() <= 12;
        if is_stacked_calligraphy {
            return true;
        }
    }

    // 4. SUPPRESS TINY LOW-CONFIDENCE NOISE BUBBLES
    let is_expressive_bubble_punct = cleaned.chars().any(|c| matches!(c, '！' | '？' | '!' | '?' | '…' | '·' | '—' | '～' | '¿' | '¡'));
    let tiny_bubble_w = ((ref_dim * 0.045).clamp(20.0, 45.0)) as i32;
    let tiny_bubble_h = ((ref_dim * 0.060).clamp(30.0, 65.0)) as i32;
    if is_bubble {
        let is_noise_or_digit = crate::ml::detect::is_standalone_digit_or_particle_noise(cleaned)
            || crate::ml::detect::is_standalone_noise_stroke(cleaned)
            || cleaned.lines().all(|l| {
                let lt = l.trim();
                crate::ml::detect::is_standalone_noise_stroke(lt) || crate::ml::detect::is_standalone_digit_or_particle_noise(lt)
            });
        let is_cjk_garbage = is_cjk && avg_score < 0.70 && !crate::ml::detect::has_cjk_characters(cleaned) && !is_expressive_bubble_punct;
        if (cluster_rect.w <= tiny_bubble_w && cluster_rect.h <= tiny_bubble_h && (avg_score < 0.68 || is_noise_or_digit || is_cjk_garbage))
            || is_cjk_garbage
        {
            return true;
        }
    } else if is_bubble && cluster_rect.w <= (ref_dim * 0.035).clamp(18.0, 35.0) as i32 && cluster_rect.h <= (ref_dim * 0.10).clamp(50.0, 110.0) as i32 {
        let is_small_kana_gasp = cleaned.trim() == "っ" || cleaned.trim() == "ッ" || cleaned.trim() == "ー";
        if is_small_kana_gasp {
            return true;
        }
    }

    // 5. IN NON-LATIN SCRIPT SOURCES
    let is_non_latin = crate::ml::detect::is_non_latin_source(source_lang);
    let lacks_native_script = !crate::ml::detect::has_native_script_for_lang(cleaned, source_lang);
    let is_expressive_punct = cleaned.chars().any(|c| matches!(c, '！' | '？' | '!' | '?' | '…' | '·' | '—' | '～' | '¿' | '¡'));
    let is_pure_latin = lacks_native_script && !is_expressive_punct && cleaned.chars().all(|c| c.is_ascii_alphabetic() || c.is_whitespace() || c.is_ascii_punctuation());
    if is_non_latin && is_pure_latin && !crate::ml::detect::is_onomatopoeia_or_shout(cleaned) {
        return true;
    }
    if is_non_latin && lacks_native_script && crate::ml::detect::has_alphanumeric_characters(cleaned) {
        let char_count = cleaned.chars().filter(|c| !c.is_whitespace()).count();
        let is_sparse_giant_box = !is_bubble && (cluster_rect.w >= (page_w as f32 * 0.12).max(100.0) as i32 || cluster_rect.h >= (ref_dim * 0.12).max(100.0) as i32) && char_count <= 4;
        let is_valid_sfx = crate::ml::detect::is_onomatopoeia_or_shout(cleaned);
        let is_short_noise_code = !is_bubble && char_count <= 3 && !is_valid_sfx;
        let is_non_bubble_alphanumeric = !is_bubble && !is_valid_sfx;
        let is_pure_digits_in_bubble = is_bubble && cleaned.chars().all(|c| c.is_ascii_digit() || c.is_whitespace()) && char_count <= 3;
        let is_low_conf_bubble_garbage = is_bubble && avg_score < 0.70 && !is_expressive_punct && (cleaned.lines().count() >= 2 || char_count <= 2);
        let micro_h = (ref_dim * 0.015).clamp(10.0, 20.0) as i32;
        let micro_box = (ref_dim * 0.040).clamp(20.0, 45.0) as i32;
        if cluster_rect.h <= micro_h
            || is_sparse_giant_box
            || is_short_noise_code
            || is_non_bubble_alphanumeric
            || is_pure_digits_in_bubble
            || is_low_conf_bubble_garbage
            || (!is_bubble && cluster_rect.w <= micro_box && cluster_rect.h <= micro_box)
            || (!is_bubble && avg_score < 0.70 && !is_valid_sfx)
            || (!is_bubble && char_count == 1 && !is_valid_sfx)
        {
            return true;
        }
    }

    // 6. PURE WATERMARK OR PUNCTUATION-ONLY REGIONS
    if crate::ml::detect::is_pure_watermark_region(cleaned) {
        return true;
    }
    if crate::ml::detect::is_pure_punctuation_only(cleaned) {
        if !is_bubble {
            return true;
        }
        let is_expressive_bubble_punct = cleaned.chars().any(|c| matches!(c, '！' | '？' | '!' | '?' | '…' | '·' | '—' | '～' | '¿' | '¡'));
        let is_micro_noise = cluster_rect.w <= 12 && cluster_rect.h <= 12;
        if !is_expressive_bubble_punct || is_micro_noise || avg_score < 0.60 {
            return true;
        }
    }

    // 7. SUPPRESS STANDALONE DIGIT / DEGREE / PARTICLE NOISE OUTSIDE SPEECH BUBBLES ACROSS ALL LANGUAGES
    if !is_bubble && crate::ml::detect::is_standalone_digit_or_particle_noise(cleaned) {
        let char_count = cleaned.chars().filter(|c| !c.is_whitespace()).count();
        let is_sparse_giant_box = (cluster_rect.w >= (page_w as f32 * 0.12).max(100.0) as i32 || cluster_rect.h >= (ref_dim * 0.12).max(100.0) as i32) && char_count <= 5;
        if char_count <= 4
            || is_sparse_giant_box
            || cluster_rect.h <= 20
            || cluster_rect.w <= 40
            || (avg_score < 0.75 && char_count <= 6)
        {
            return true;
        }
    }

    // 8. CJK BOTTOM / GUTTER MAGAZINE WATERMARK NOISE
    let margin_footer_gap = (ref_dim * 0.05).clamp(35.0, 65.0) as i32;
    if is_cjk && (cluster_rect.y + cluster_rect.h >= page_h as i32 - margin_footer_gap) && cleaned.chars().count() == 1 && (cleaned == "动" || cleaned == "初" || cleaned == "腾" || cleaned == "漫" || cleaned == "漫客" || cleaned == "客") {
        return true;
    }

    // 9. SUPPRESS LOW-CONFIDENCE ISOLATED SINGLE-CHARACTER ARTWORK ARTIFACTS / SFX
    let char_count = cleaned.chars().filter(|c| !c.is_whitespace()).count();
    let oversized_char_limit = (ref_dim * 0.08).clamp(55.0, 95.0) as i32;
    let is_oversized_single_char = char_count == 1 && (cluster_rect.w >= oversized_char_limit || cluster_rect.h >= oversized_char_limit);
    let is_shout = crate::ml::detect::is_onomatopoeia_or_shout(cleaned) && char_count <= 6;
    let is_sign_or_narration_box = is_cjk && char_count >= 2 && ((cluster_rect.w >= 60 && cluster_rect.h >= 24) || (cluster_rect.w >= 15 && cluster_rect.h >= 30 && char_count >= 4) || (cluster_rect.w >= 20 && cluster_rect.h >= 30 && char_count >= 3)) && avg_score >= 0.70 && !is_shout;
    let is_margin_isolated_char = (cluster_rect.x <= 5 || cluster_rect.x + cluster_rect.w >= page_w as i32 - 5) && avg_score < 0.75;
    let is_valid_cjk_glyph = is_cjk && char_count >= 2 && cleaned.chars().any(|c| crate::ml::detect::has_cjk_characters(&c.to_string())) && avg_score >= 0.70 && !is_margin_isolated_char;
    let is_compact_single_glyph_box = char_count == 1 && cluster_rect.w <= (ref_dim * 0.06).clamp(35.0, 65.0) as i32 && cluster_rect.h <= (ref_dim * 0.06).clamp(35.0, 65.0) as i32;
    let is_low_conf_single_char = char_count == 1 && (avg_score < 0.75 || is_oversized_single_char || is_compact_single_glyph_box);
    let is_isolated_sfx = char_count <= 6 && is_shout;

    if char_count <= 6
        && !is_bubble
        && !is_sign_or_narration_box
        && (!is_valid_cjk_glyph || is_low_conf_single_char || is_margin_isolated_char || is_isolated_sfx || is_oversized_single_char)
        && (compute_chromatic_color_variance(img, cluster_rect) >= 15.0 || is_margin_isolated_char || is_low_conf_single_char || is_isolated_sfx || is_oversized_single_char || (avg_score < 0.75 && cluster_rect.w <= 40 && cluster_rect.h <= 40))
    {
        return true;
    }

    // 10. SUPPRESS TRANSLUCENT AGGREGATOR WATERMARKS
    if is_cjk && !is_bubble && (cleaned == "数据" || cleaned == "集云" || cleaned == "集云数据") {
        return true;
    }

    // 11. SUPPRESS LOW-CONFIDENCE REPEATED SFX GLYPHS GENERATED ON HIGH-VARIANCE BACKGROUND
    if is_cjk && !is_bubble && (avg_score < 0.75 || is_shout) && compute_chromatic_color_variance(img, cluster_rect) >= 15.0 && crate::ml::detect::is_onomatopoeia_or_shout(cleaned) {
        return true;
    }

    // 12. SUPPRESS OCR HALLUCINATIONS FROM DECORATIVE ENERGY-BURST / LIGHTNING ARTWORK GLYPHS
    if is_cjk && !is_bubble && avg_score < 0.70 && compute_chromatic_color_variance(img, cluster_rect) >= 15.0 {
        let lines: Vec<&str> = cleaned.lines().collect();
        if lines.len() >= 2 {
            let cjk_residues: Vec<String> = lines
                .iter()
                .map(|l| l.chars().filter(|c| crate::ml::detect::has_cjk_characters(&c.to_string())).collect::<String>())
                .collect();
            let all_non_empty = cjk_residues.iter().all(|r| !r.is_empty());
            let all_single_glyph = cjk_residues.iter().all(|r| r.chars().count() == 1);
            let all_identical = cjk_residues.windows(2).all(|w| w[0] == w[1]);
            let has_digit_latin_noise = lines.iter().any(|l| {
                l.chars().any(|c| c.is_ascii_alphanumeric() && !crate::ml::detect::has_cjk_characters(&c.to_string()))
            });
            if all_non_empty && all_single_glyph && all_identical && has_digit_latin_noise {
                return true;
            }
        }
    }

    // 13. SUPPRESS FOLIAGE NOISE / CHROMATIC BACKGROUND TEXTURE ON TINY STROKE FRAGMENTS
    if !is_bubble && cluster_rect.w <= (ref_dim * 0.045).clamp(25.0, 48.0) as i32 && cluster_rect.h <= (ref_dim * 0.065).clamp(35.0, 65.0) as i32 && compute_chromatic_color_variance(img, cluster_rect) >= 15.0 {
        return true;
    }

    // 14. SUPPRESS ISOLATED SINGLE-PUNCTUATION / REACTION SYMBOL SLICES
    let is_narrow_symbol_slice = cluster_rect.w <= 12 && (cleaned == "i" || cleaned == "l" || cleaned == "!" || cleaned == "1" || cleaned == "|" || cleaned == "I");
    if is_narrow_symbol_slice {
        return true;
    }

    // 15. SUPPRESS TINY SUB-PIXEL / NOISE FRAGMENTS
    let is_clean_bg = compute_chromatic_color_variance(img, cluster_rect) < 15.0;
    let is_valid_cjk_glyph = is_cjk && cleaned.chars().any(|c| crate::ml::detect::has_cjk_characters(&c.to_string())) && avg_score >= 0.70 && is_clean_bg;
    if cluster_rect.w <= 15 && cluster_rect.h <= 15 && !is_valid_cjk_glyph {
        return true;
    }
    if !is_bubble && cluster_rect.w <= 40 && cluster_rect.h <= 55 && !is_valid_cjk_glyph {
        return true;
    }

    // 16. SUPPRESS OPTICAL BORDER SLIVERS & FLATTENED ARTIFACT SLICES
    if !is_bubble && cluster_rect.h <= 18 && cluster_rect.w >= 25 && cleaned.chars().count() <= 3 && !cleaned.contains('\n') {
        return true;
    }
    if !is_bubble && cluster_rect.w <= 35 && cluster_rect.h >= 60 && avg_score < 0.60 {
        return true;
    }

    // 17. SUPPRESS LOW-CONFIDENCE ISOLATED PSEUDO-WORD HALLUCINATIONS ON COMPLEX BACKGROUND ARTWORK
    if !is_bubble && !is_sign_or_narration_box && ((avg_score < 0.65 && cleaned.chars().count() <= 6 && compute_chromatic_color_variance(img, cluster_rect) >= 15.0) || (avg_score < 0.68 && cleaned.chars().count() <= 4 && !cleaned.contains('\n'))) {
        return true;
    }

    // 18. SUPPRESS TRUNCATED MARGIN NOISE FRAGMENTS SLICED AT THE VERY EDGE OF THE IMAGE CANVAS
    let is_margin_flush = cluster_rect.x <= 5 || cluster_rect.x + cluster_rect.w >= page_w as i32 - 5;
    if !is_bubble && is_margin_flush && (cluster_rect.w <= 75 || cluster_rect.h <= 65) && avg_score < 0.75 {
        return true;
    }

    // 19. SUPPRESS MASSIVE NON-BUBBLE BACKGROUND TEXT OCCLUDED ACROSS SCENE ARTWORK
    let is_massive_background_occlusion = !is_bubble
        && (cluster_rect.w as f32 >= page_w as f32 * 0.75)
        && cluster_rect.h >= (ref_dim * 0.10).max(90.0) as i32
        && (avg_score < 0.68 || char_count <= 4 || (compute_chromatic_color_variance(img, cluster_rect) >= 15.0 && char_count <= 8));
    if is_massive_background_occlusion {
        return true;
    }

    // 20. SUPPRESS NON-BUBBLE DETECTOR HALLUCINATIONS WHOSE TEXT IS A DUPLICATE / ECHO OF AN ADJACENT SPEECH BUBBLE
    let is_speech_bubble_echo = !is_bubble && split_lines.iter().any(|rl| {
        let t_rl = rl.text.trim();
        let (rx, ry, rw, rh) = polygon_bounds(&rl.polygon);
        let rl_in_bubble = bubbles.iter().any(|b| {
            let (rcx, rcy) = (rx + rw / 2, ry + rh / 2);
            rcx >= b.x && rcx <= b.x + b.w && rcy >= b.y && rcy <= b.y + b.h
        });
        if rl_in_bubble && t_rl.chars().count() >= 6 {
            let common_chars = cleaned.chars().filter(|c| !c.is_whitespace() && t_rl.contains(*c)).count();
            let clean_chars = cleaned.chars().filter(|c| !c.is_whitespace()).count();
            let overlap_x = (cluster_rect.x + cluster_rect.w).min(rx + rw) - cluster_rect.x.max(rx);
            let overlap_y = (cluster_rect.y + cluster_rect.h).min(ry + rh) - cluster_rect.y.max(ry);
            let is_spatially_close = (overlap_x > -15 && overlap_y > -15) || ((cluster_rect.x - rx).abs() <= 60 && (cluster_rect.y - ry).abs() <= 60);
            common_chars >= 4 && (common_chars as f32 / clean_chars.max(1) as f32 >= 0.75) && is_spatially_close
        } else {
            false
        }
    }) && bubbles.iter().any(|b| {
        let (cx, cy) = (cluster_rect.x + cluster_rect.w / 2, cluster_rect.y + cluster_rect.h / 2);
        let (bx, by) = (b.x + b.w / 2, b.y + b.h / 2);
        let is_center_inside_this_bubble = cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
        let echo_radius_x = (b.w as f32 * 1.25).clamp(160.0, 300.0) as i32;
        let echo_radius_y = (b.h as f32 * 1.25).clamp(250.0, 450.0) as i32;
        !is_center_inside_this_bubble && (cx - bx).abs() <= echo_radius_x && (cy - by).abs() <= echo_radius_y
    });
    if is_speech_bubble_echo {
        return true;
    }

    // 21. SUPPRESS SPARSE GIANT NON-BUBBLE DETECTIONS
    let is_sparse_giant_non_bubble = !is_bubble
        && (((cluster_rect.w >= (page_w as f32 * 0.30).max(220.0) as i32 && cluster_rect.h >= (ref_dim * 0.15).max(130.0) as i32) && cleaned.chars().filter(|c| !c.is_whitespace()).count() <= 3)
            || (cluster_rect.h >= (ref_dim * 0.25).max(250.0) as i32 && cluster_rect.w >= 100 && cleaned.chars().filter(|c| !c.is_whitespace()).count() <= 2)
            || (cluster_rect.h >= (ref_dim * 0.30).max(300.0) as i32 && cleaned.chars().filter(|c| !c.is_whitespace()).count() <= 3 && angle_deg.abs() >= 10.0));
    if is_sparse_giant_non_bubble {
        return true;
    }

    false
}


