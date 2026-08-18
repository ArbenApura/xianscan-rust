// -- CRATE / EXTERNAL IMPORTS -- //
use regex::Regex;

// -- INTERNAL IMPORTS -- //
use crate::ml::detect::{clean_stray_ocr_artifacts, CHINESE_RE};
use crate::ml::geometry::polygon_bounds;
use crate::ml::ocr::OcrLine;

// -- FUNCTIONS & ALGORITHMS -- //

/// NORMALIZE STRAY LATIN CHARACTERS AND VERTICAL EXCLAMATION STROKES
pub fn normalize_stray_latin(lines: Vec<OcrLine>, is_cjk: bool) -> Vec<OcrLine> {
    let mut normalized_rapid_lines = Vec::new();
    let re_latin_punct = Regex::new(r"^[A-Za-z]{1,4}[.．…!！?？]{1,}$").unwrap();

    for mut rl in lines {
        let (_lx, _ly, lw, lh) = polygon_bounds(&rl.polygon);
        let clean_t = rl.text.trim();
        if is_cjk && ["一", "1", "丨", "I", "l", "|"].contains(&clean_t) && lh >= (lw as f32 * 1.4) as i32 {
            rl.text = "！".to_string();
        } else if is_cjk && re_latin_punct.is_match(clean_t) {
            let has_bang = clean_t.contains('!') || clean_t.contains('！');
            let has_q = clean_t.contains('?') || clean_t.contains('？');
            rl.text = if has_bang && has_q {
                "……！？".to_string()
            } else if has_bang {
                "……！".to_string()
            } else if has_q {
                "……？".to_string()
            } else {
                "……".to_string()
            };
        }
        normalized_rapid_lines.push(rl);
    }
    normalized_rapid_lines
}

/// FILTER OUT NON-TEXT ARTWORK CONTOURS, ISOLATED MARGIN GLITCHES, AND LOW-CONFIDENCE NOISE
pub fn filter_artwork_and_artifacts(lines: Vec<OcrLine>, page_w: u32, source_lang: Option<&str>) -> Vec<OcrLine> {
    let mut clean_rapid_lines = Vec::new();
    let circle_noise_re = Regex::new(r"^[0oO·•\s]{1,6}$").unwrap();
    let sfx_tail_re = Regex::new(r"[-—―_~～·.．…!！?？]").unwrap();
    let single_latin_re = Regex::new(r"^[a-zA-Z]$").unwrap();
    let sfx_glyphs = "噗轰咚咳啪砰咔唰嘭哇嗷嘶呜呼哈哒嗒踏铛铮刷咻嗖哧嚓哐咕嗡吼鸣飒吱咯嘎喳沙！!";

    for mut rl in lines {
        let (lx, _ly, lw, lh) = polygon_bounds(&rl.polygon);
        rl.text = clean_stray_ocr_artifacts(&rl.text);
        let char_count = rl.text.chars().filter(|c| !c.is_whitespace()).count().max(1);
        let has_valid_text = CHINESE_RE.is_match(&rl.text)
            || crate::ml::detect::CYRILLIC_CHAR_RE.is_match(&rl.text)
            || crate::ml::detect::THAI_CHAR_RE.is_match(&rl.text)
            || crate::ml::detect::has_cjk_characters(&rl.text)
            || (!crate::ml::detect::is_cjk_source(source_lang) && crate::ml::detect::has_alphanumeric_characters(&rl.text));

        let has_chinese = CHINESE_RE.is_match(&rl.text);
        let is_circle_noise = circle_noise_re.is_match(&rl.text) && !has_valid_text;
        let is_sfx_tail = sfx_tail_re.is_match(&rl.text);
        let is_sfx_glyph = rl.text.chars().any(|c| sfx_glyphs.contains(c));
        let clean_t = rl.text.trim();

        let is_single_latin = crate::ml::detect::is_cjk_source(source_lang) && !has_chinese && char_count <= 1 && single_latin_re.is_match(clean_t);
        let is_border_margin_char = (lx <= 30 || (lx + lw) >= (page_w as i32 - 30)) && char_count <= 1 && !is_sfx_glyph;
        let is_giant_single_char_artwork = char_count <= 1 && !is_sfx_glyph && (
            (lh >= 90 && lw >= 90 && rl.score < 0.75)
            || (lh >= 60 && lw >= 60 && rl.score < 0.60)
            || (lh * lw >= 10000 && rl.score < 0.80)
        );
        let is_isolated_dash_noise = char_count <= 1 && ["一", "1", "丨", "I", "l", "|", "-"].contains(&clean_t) && rl.score < 0.75 && (lw <= 60 || lh <= 25 || (lh as f32 / lw.max(1) as f32) < 0.40);
        let is_low_conf_isolated_char = char_count <= 1 && !is_sfx_glyph && rl.score < 0.73 && !is_sfx_tail;

        let is_giant_chinese_hallucination = has_chinese && !is_sfx_glyph && (
            (lw >= (page_w as f32 * 0.60) as i32 && lh >= 120 && char_count <= 4 && rl.score < 0.75)
            || (lh >= 200 && lw >= 300 && char_count <= 3 && rl.score < 0.70)
            || (lh >= 100 && (lw as f32 / char_count as f32) >= 150.0 && rl.score < 0.65)
            || (lh >= 300 && lw >= (page_w as f32 * 0.40) as i32 && char_count <= 5 && rl.score < 0.75)
        );

        let is_thin_sliver_noise = rl.score < 0.85 && (
            (lh <= 24 && lw >= 60 && (lw as f32 / lh as f32) >= 4.5 && rl.score < 0.80)
            || (has_chinese && char_count >= 2 && lh <= 24 && (lw as f32 / (char_count as f32 * lh as f32)) >= 1.8 && rl.score < 0.75)
            || (has_chinese && char_count >= 2 && lh <= 20 && rl.score < 0.65)
        );

        let is_tilted_alnum_scribble = crate::ml::detect::is_cjk_source(source_lang)
            && rl.score < 0.72
            && !has_chinese
            && !is_sfx_glyph
            && {
                let ang = crate::ml::geometry::calculate_box_angle_i32(&rl.polygon);
                let has_digit_or_punct = clean_t.chars().any(|c| c.is_ascii_digit() || c.is_ascii_punctuation());
                ang.abs() >= 8.0 && has_digit_or_punct && clean_t.chars().count() <= 6
            };

        let is_giant_artwork = is_single_latin
            || is_border_margin_char
            || is_giant_single_char_artwork
            || is_isolated_dash_noise
            || is_low_conf_isolated_char
            || is_circle_noise
            || is_giant_chinese_hallucination
            || is_tilted_alnum_scribble
            || is_thin_sliver_noise
            || (!has_valid_text && !is_sfx_tail && !is_sfx_glyph && char_count >= 2 && lh >= 100 && (lw / char_count as i32) >= 90 && rl.score < 0.85)
            || (!has_valid_text && !is_sfx_tail && !is_sfx_glyph && char_count <= 2 && lh >= 100 && lw >= 140)
            || (lh >= 180 && lw >= 350 && !has_valid_text)
            || (lh >= 350 && lw >= 350 && char_count <= 6 && !has_valid_text)
            || (!has_valid_text && lh >= 80 && rl.score < 0.90 && char_count <= 4)
            || (!has_valid_text && char_count <= 2 && (lh >= 120 || lw >= 120 || (lh >= 80 && (lh / lw.max(1) >= 2 || lw / lh.max(1) >= 2))))
            || (char_count >= 3 && lw <= 35 && lh <= (lw as f32 * 1.2) as i32 && (lw as f32 / char_count as f32) <= 12.0 && rl.score < 0.75);

        if !is_giant_artwork && !rl.text.trim().is_empty() {
            clean_rapid_lines.push(rl);
        }
    }
    clean_rapid_lines
}

/// SPLIT ACCIDENTALLY FUSED ADJACENT SENTENCES OR TAIL BUBBLE ARTIFACTS
pub fn split_fused_lines(lines: Vec<OcrLine>) -> Vec<OcrLine> {
    let mut split_lines: Vec<OcrLine> = Vec::new();
    let tail_circles_re = Regex::new(r"([!！?？…~～])(?:200|300|000|[0oO·•]{2,})$").unwrap();

    for line in lines {
        let (x, y, w, h) = polygon_bounds(&line.polygon);
        let text_str = line.text.trim();

        if let Some(caps) = tail_circles_re.captures(text_str) {
            let m1 = caps.get(1).unwrap();
            let clean_sub = text_str[..m1.end()].trim();
            let ratio = clean_sub.len() as f32 / text_str.len().max(1) as f32;
            let split_w = ((w as f32 * ratio).round() as i32).max(1);

            split_lines.push(OcrLine {
                polygon: vec![[x, y], [x + split_w, y], [x + split_w, y + h], [x, y + h]],
                text: clean_sub.to_string(),
                score: line.score,
            });
            continue;
        }

        let mut split_idx = None;
        let chars: Vec<(usize, char)> = text_str.char_indices().collect();
        for i in 0..chars.len() {
            let (_byte_idx, c) = chars[i];
            if "。!！?？".contains(c) && i + 1 < chars.len() {
                let next_c = chars[i + 1].1;
                if !next_c.is_whitespace() && !"。!！?？".contains(next_c) {
                    let next_byte = chars[i + 1].0;
                    split_idx = Some(next_byte);
                    break;
                }
            }
        }

        if let Some(s_idx) = split_idx {
            let part1 = text_str[..s_idx].trim();
            let part2 = text_str[s_idx..].trim();

            let len1 = part1.chars().count();
            let len2 = part2.chars().count();
            let total_len = len1 + len2;

            if total_len > 0 && len1 >= 2 && len2 >= 1 && w >= 180 && w > 3 * h.max(1) {
                let prop_x = ((w as f32 * (len1 as f32 / total_len as f32)).round() as i32).max(1);
                split_lines.push(OcrLine {
                    polygon: vec![[x, y], [x + prop_x, y], [x + prop_x, y + h], [x, y + h]],
                    text: part1.to_string(),
                    score: line.score,
                });
                split_lines.push(OcrLine {
                    polygon: vec![[x + prop_x, y], [x + w, y], [x + w, y + h], [x + prop_x, y + h]],
                    text: part2.to_string(),
                    score: line.score,
                });
                continue;
            }
        }

        split_lines.push(line);
    }
    split_lines
}
