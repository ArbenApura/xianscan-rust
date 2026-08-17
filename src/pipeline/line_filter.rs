use image::{DynamicImage, GenericImageView};
use regex::Regex;
use crate::ml::detect::{clean_stray_ocr_artifacts, CHINESE_RE};
use crate::ml::geometry::polygon_bounds;
use crate::ml::ocr::OcrLine;

pub fn normalize_stray_latin(lines: Vec<OcrLine>) -> Vec<OcrLine> {
    let mut normalized_rapid_lines = Vec::new();
    let re_latin_punct = Regex::new(r"^[A-Za-z]{1,4}[.．…!！?？]{1,}$").unwrap();

    for mut rl in lines {
        let (_lx, _ly, lw, lh) = polygon_bounds(&rl.polygon);
        let clean_t = rl.text.trim();
        if ["一", "1", "丨", "I", "l", "|"].contains(&clean_t) && lh >= (lw as f32 * 1.4) as i32 {
            rl.text = "！".to_string();
        } else if re_latin_punct.is_match(clean_t) {
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

pub fn filter_artwork_and_artifacts(lines: Vec<OcrLine>, page_w: u32) -> Vec<OcrLine> {
    let mut clean_rapid_lines = Vec::new();
    let circle_noise_re = Regex::new(r"^[0oO·•\s]{1,6}$").unwrap();
    let sfx_tail_re = Regex::new(r"[-—―_~～·.．…!！?？]").unwrap();
    let single_latin_re = Regex::new(r"^[a-zA-Z]$").unwrap();
    let sfx_glyphs = "噗轰咚咳啪砰咔唰嘭哇嗷嘶呜呼哈哒嗒踏铛铮刷咻嗖哧嚓哐咕嗡吼鸣飒吱咯嘎喳沙！!";

    for mut rl in lines {
        let (lx, _ly, lw, lh) = polygon_bounds(&rl.polygon);
        rl.text = clean_stray_ocr_artifacts(&rl.text);
        let char_count = rl.text.chars().filter(|c| !c.is_whitespace()).count().max(1);
        let has_chinese = CHINESE_RE.is_match(&rl.text);
        let is_circle_noise = circle_noise_re.is_match(&rl.text) && !has_chinese;
        let is_sfx_tail = sfx_tail_re.is_match(&rl.text);
        let is_sfx_glyph = rl.text.chars().any(|c| sfx_glyphs.contains(c));
        let clean_t = rl.text.trim();

        let is_single_latin = !has_chinese && char_count <= 1 && single_latin_re.is_match(clean_t);
        let is_border_margin_char = (lx <= 30 || (lx + lw) >= (page_w as i32 - 30)) && char_count <= 1 && !is_sfx_glyph;
        let is_giant_single_char_artwork = char_count <= 1 && !is_sfx_glyph && (
            (lh >= 90 && lw >= 90 && rl.score < 0.75)
            || (lh >= 60 && lw >= 60 && rl.score < 0.60)
            || (lh * lw >= 10000 && rl.score < 0.80)
        );
        let is_isolated_dash_noise = char_count <= 1 && ["一", "1", "丨", "I", "l", "|", "-"].contains(&clean_t) && rl.score < 0.75 && (lw <= 60 || lh <= 25 || (lh as f32 / lw.max(1) as f32) < 0.40);
        let is_low_conf_isolated_char = char_count <= 1 && !is_sfx_glyph && rl.score < 0.70 && !is_sfx_tail;

        let is_giant_chinese_hallucination = has_chinese && !is_sfx_glyph && (
            (lw >= (page_w as f32 * 0.60) as i32 && lh >= 120 && char_count <= 4 && rl.score < 0.75)
            || (lh >= 200 && lw >= 300 && char_count <= 3 && rl.score < 0.70)
            || (lh >= 100 && (lw as f32 / char_count as f32) >= 150.0 && rl.score < 0.65)
            || (lh >= 300 && lw >= (page_w as f32 * 0.40) as i32 && char_count <= 5 && rl.score < 0.75)
        );

        let is_thin_sliver_noise = (lh <= 24 && lw >= 60 && (lw as f32 / lh as f32) >= 4.5 && rl.score < 0.80)
            || (has_chinese && char_count >= 2 && lh <= 24 && (lw as f32 / (char_count as f32 * lh as f32)) >= 1.8 && rl.score < 0.75)
            || (has_chinese && char_count >= 2 && lh <= 20 && rl.score < 0.65);

        let is_giant_artwork = is_single_latin
            || is_border_margin_char
            || is_giant_single_char_artwork
            || is_isolated_dash_noise
            || is_low_conf_isolated_char
            || is_circle_noise
            || is_giant_chinese_hallucination
            || is_thin_sliver_noise
            || (!has_chinese && !is_sfx_tail && !is_sfx_glyph && char_count >= 2 && lh >= 100 && (lw / char_count as i32) >= 90 && rl.score < 0.85)
            || (!has_chinese && !is_sfx_tail && !is_sfx_glyph && char_count <= 2 && lh >= 100 && lw >= 140)
            || (lh >= 180 && lw >= 350 && !has_chinese)
            || (lh >= 350 && lw >= 350 && char_count <= 6 && !has_chinese)
            || (!has_chinese && lh >= 80 && rl.score < 0.90 && char_count <= 4)
            || (!has_chinese && char_count <= 2 && (lh >= 120 || lw >= 120 || (lh >= 80 && (lh / lw.max(1) >= 2 || lw / lh.max(1) >= 2))))
            || (char_count >= 3 && lw <= 35 && (lw as f32 / char_count as f32) <= 12.0 && rl.score < 0.75);

        if !is_giant_artwork && !rl.text.trim().is_empty() {
            clean_rapid_lines.push(rl);
        }
    }
    clean_rapid_lines
}

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

pub fn recover_missing_interjections(img: &DynamicImage, lines: &mut [OcrLine]) {
    for line in lines.iter_mut() {
        line.text = recover_missing_interjection(img, &line.polygon, &line.text);
    }
}

pub fn recover_missing_interjection(img: &DynamicImage, pts: &[[i32; 2]], text: &str) -> String {
    let t_strip = text.trim();
    if !["！", "!", "？", "?", "！？", "!?", "？！", "?!", "呀", "呀！", "呀~"].contains(&t_strip) {
        return text.to_string();
    }

    let (x, y, w, h) = polygon_bounds(pts);
    let min_w = if ["……", "…", "..."].contains(&t_strip) {
        55.max((h as f32 * 1.8) as i32)
    } else {
        36.max((h as f32 * 1.05) as i32)
    };

    if w < min_w || h < 18 {
        return text.to_string();
    }

    let (pw, ph) = img.dimensions();
    let crop_x = x.clamp(0, pw as i32 - 1) as u32;
    let crop_y = y.clamp(0, ph as i32 - 1) as u32;
    let crop_w = (w as u32).min(pw - crop_x);
    let crop_h = (h as u32).min(ph - crop_y);

    if crop_w < 4 || crop_h < 4 {
        return text.to_string();
    }

    let crop = img.crop_imm(crop_x, crop_y, crop_w, crop_h);
    let rgb = crop.to_rgb8();

    let left_w = ((crop_w as f32 * 0.65).round() as u32).max(1);
    let mut dark_count = 0;
    let total = left_w * crop_h;

    for cy in 0..crop_h {
        for cx in 0..left_w {
            let p = rgb.get_pixel(cx, cy);
            let gray = (p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000;
            if gray < 140 {
                dark_count += 1;
            }
        }
    }

    if (dark_count as f32 / total as f32) >= 0.05 {
        if ["！", "!"].contains(&t_strip) {
            return "诶！".to_string();
        } else if ["？", "?"].contains(&t_strip) {
            return "诶？".to_string();
        } else if ["……", "…", "..."].contains(&t_strip) {
            return "诶……".to_string();
        } else if ["！？", "!?", "？！", "?!"].contains(&t_strip) {
            return "诶！？".to_string();
        } else if ["呀", "呀！", "呀~"].contains(&t_strip) {
            return "诶呀！".to_string();
        }
    }

    text.to_string()
}
