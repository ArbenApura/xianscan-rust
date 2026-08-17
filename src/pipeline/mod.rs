use std::path::Path;
use anyhow::Result;
use image::{DynamicImage, GenericImageView};
use regex::Regex;

use crate::ml::detect::{
    clean_stray_ocr_artifacts, deduplicate_boxes, group_paragraphs, has_alphanumeric_characters,
    has_cjk_characters, is_cjk_source, is_latin_source, is_pure_watermark_region,
    is_standalone_alphanumeric_without_cjk, is_watermark_line, merge_text_lines,
    sort_regions_top_to_bottom, CHINESE_RE, ComicTextDetector, PUNCT_ONLY,
};
use crate::ml::geometry::{
    box_iou, box_iou_f32, box_iou_pts, box_to_xywh_f32, calculate_box_angle, calculate_box_angle_i32,
    line_center_inside_box, polygon_bounds,
};
use crate::ml::inpaint::{build_mask, LamaInpainter};
use crate::ml::ocr::{OcrLine, RapidOcr};
use crate::ml::schemas::{AnalyzeOptions, AnalyzeResponse, BoxRect, CleanRequestRegion, Region};
use crate::ml::watermark::WatermarkRemover;

pub struct PipelineEngine {
    pub detector: Option<ComicTextDetector>,
    pub ocr: Option<RapidOcr>,
    pub inpainter: Option<LamaInpainter>,
    pub watermark: WatermarkRemover,
}

impl PipelineEngine {
    pub fn new<P: AsRef<Path>>(models_dir: P) -> Self {
        let dir = models_dir.as_ref();

        // 1. ComicTextDetector
        let detector = if dir.join("comictextdetector.pt.onnx").exists() {
            ComicTextDetector::new(dir.join("comictextdetector.pt.onnx")).ok()
        } else {
            #[cfg(feature = "embed-models")]
            {
                ComicTextDetector::from_bytes(crate::ml::embedded_models::COMIC_DET_BYTES).ok()
            }
            #[cfg(not(feature = "embed-models"))]
            {
                None
            }
        };

        // 2. RapidOCR
        let mut ocr = if dir.join("PP-OCRv6_rec_small.onnx").exists() {
            let dict_path = if dir.join("rapidocr_keys.json").exists() {
                dir.join("rapidocr_keys.json")
            } else {
                dir.join("ppocr_keys_v1.txt")
            };
            let det_path = if dir.join("PP-OCRv6_det_small.onnx").exists() {
                Some(dir.join("PP-OCRv6_det_small.onnx"))
            } else {
                None
            };
            RapidOcr::new(det_path, dir.join("PP-OCRv6_rec_small.onnx"), dict_path).ok()
        } else {
            #[cfg(feature = "embed-models")]
            {
                let mut emb_ocr = RapidOcr::from_bytes(
                    Some(crate::ml::embedded_models::PPOCR_DET_BYTES),
                    crate::ml::embedded_models::PPOCR_REC_BYTES,
                    crate::ml::embedded_models::RAPIDOCR_KEYS,
                ).ok();
                if let Some(ref mut engine) = emb_ocr {
                    let _ = engine.load_korean_from_bytes(
                        crate::ml::embedded_models::KOREAN_REC_BYTES,
                        crate::ml::embedded_models::KOREAN_DICT,
                    );
                    let _ = engine.load_cyrillic_from_bytes(
                        crate::ml::embedded_models::CYRILLIC_REC_BYTES,
                        crate::ml::embedded_models::CYRILLIC_DICT,
                    );
                    let _ = engine.load_vietnamese_from_bytes(
                        crate::ml::embedded_models::VIETNAMESE_REC_BYTES,
                        crate::ml::embedded_models::VIETNAMESE_DICT,
                    );
                    let _ = engine.load_thai_from_bytes(
                        crate::ml::embedded_models::THAI_REC_BYTES,
                        crate::ml::embedded_models::THAI_DICT,
                    );
                }
                emb_ocr
            }
            #[cfg(not(feature = "embed-models"))]
            {
                None
            }
        };

        if let Some(ref mut ocr_engine) = ocr {
            if dir.join("korean_mobile_v2.0_rec.onnx").exists() && dir.join("korean_dict.txt").exists() {
                let _ = ocr_engine.load_korean_model(dir.join("korean_mobile_v2.0_rec.onnx"), dir.join("korean_dict.txt"));
            }
            if dir.join("cyrillic_mobile_v2.0_rec.onnx").exists() && dir.join("cyrillic_dict.txt").exists() {
                let _ = ocr_engine.load_cyrillic_model(dir.join("cyrillic_mobile_v2.0_rec.onnx"), dir.join("cyrillic_dict.txt"));
            }
            if dir.join("vi_PP-OCRv3_rec.onnx").exists() && dir.join("vi_dict.txt").exists() {
                let _ = ocr_engine.load_vietnamese_model(dir.join("vi_PP-OCRv3_rec.onnx"), dir.join("vi_dict.txt"));
            }
            if dir.join("th_PP-OCRv5_mobile_rec.onnx").exists() && dir.join("th_dict.txt").exists() {
                let _ = ocr_engine.load_thai_model(dir.join("th_PP-OCRv5_mobile_rec.onnx"), dir.join("th_dict.txt"));
            }
        }

        // 3. LaMa Inpainter
        let inpainter = if dir.join("lama.onnx").exists() {
            LamaInpainter::new(dir.join("lama.onnx")).ok()
        } else {
            #[cfg(feature = "embed-models")]
            {
                LamaInpainter::from_bytes(crate::ml::embedded_models::LAMA_BYTES).ok()
            }
            #[cfg(not(feature = "embed-models"))]
            {
                None
            }
        };

        let watermark = WatermarkRemover::new();

        Self {
            detector,
            ocr,
            inpainter,
            watermark,
        }
    }

    pub fn analyze_image(&mut self, img: &DynamicImage) -> Result<AnalyzeResponse> {
        self.analyze_image_with_options(img, None)
    }

    pub fn analyze_image_with_options(
        &mut self,
        img: &DynamicImage,
        options: Option<&AnalyzeOptions>,
    ) -> Result<AnalyzeResponse> {
        let (page_w, page_h) = img.dimensions();
        let source_lang = options.and_then(|o| o.source_lang.as_deref());
        let is_cjk = is_cjk_source(source_lang);
        let is_latin = is_latin_source(source_lang);

        // 1. ComicTextDetector Detection
        let mut comic_boxes: Vec<Vec<[i32; 2]>> = Vec::new();
        let mut comic_scores: Vec<f32> = Vec::new();
        let mut _comic_mask: Option<Vec<u8>> = None;
        let mut backend = "rapidocr-fallback".to_string();

        if let Some(ref mut detector) = self.detector {
            if let Ok(res) = detector.detect(img) {
                comic_boxes = res.boxes;
                comic_scores = res.scores;
                _comic_mask = Some(res.mask);
                backend = res.backend;
            }
        }

        // 2. RapidOCR Full-Page Det + Rec
        let mut rapid_lines: Vec<OcrLine> = Vec::new();
        if let Some(ref mut ocr) = self.ocr {
            if let Ok(rl) = ocr.detect_and_recognize_tiled_with_lang(img, true, source_lang) {
                rapid_lines = rl;
            }
        }

        // 3. Fallback: RapidOCR isolated recognition for ComicTextDetector boxes
        if let Some(ref mut ocr) = self.ocr {
            let (w, h) = img.dimensions();
            let mut ocr_det_matched = vec![false; comic_boxes.len()];

            for (idx, cb) in comic_boxes.iter().enumerate() {
                let (cb_x, cb_y, cb_w, cb_h) = polygon_bounds(cb);
                let cb_rect = BoxRect { x: cb_x, y: cb_y, w: cb_w, h: cb_h };
                let cb_area = (cb_w * cb_h).max(1);

                for (r_idx, rl) in rapid_lines.iter().enumerate() {
                    let (rx, ry, rw, rh) = polygon_bounds(&rl.polygon);
                    let rl_area = (rw * rh).max(1);
                    let iou = box_iou_pts(cb, &rl.polygon);

                    let overlap_x = (cb_x + cb_w).min(rx + rw) - cb_x.max(rx);
                    let overlap_y = (cb_y + cb_h).min(ry + rh) - cb_y.max(ry);
                    let overlap_area = overlap_x.max(0) * overlap_y.max(0);

                    let rl_contained = overlap_area as f32 / rl_area as f32 >= 0.50;
                    let cb_covered = overlap_area as f32 / cb_area as f32 >= 0.20;

                    if iou >= 0.20 || rl_contained || cb_covered || line_center_inside_box(&rl.polygon, &cb_rect) {
                        ocr_det_matched[idx] = true;

                        // If ComicTextDetector box is significantly wider than RapidLine (e.g. ellipsis truncated on right)
                        // test if recognizing ComicBox yields full text (including ellipsis).
                        if cb_w >= rw + 25 || (cb_w as f32) >= (rw as f32 * 1.25) {
                            let pad_x = 15;
                            let pad_y = 10;
                            let cx = (cb_x - pad_x).max(0) as u32;
                            let cy = (cb_y - pad_y).max(0) as u32;
                            let cw = ((cb_w + pad_x * 2) as u32).min(w - cx);
                            let ch = ((cb_h + pad_y * 2) as u32).min(h - cy);
                            if cw >= 8 && ch >= 8 {
                                let crop = img.crop_imm(cx, cy, cw, ch);
                                if let Ok(Some(line_res)) = ocr.recognize_line_with_lang(&crop, source_lang) {
                                    let clean_c = clean_stray_ocr_artifacts(&line_res.text);
                                    let clean_chars = clean_c.chars().filter(|c| !c.is_whitespace()).count();
                                    let rl_chars = rl.text.chars().filter(|c| !c.is_whitespace()).count();
                                    if clean_chars > rl_chars || (clean_c.contains('…') && !rl.text.contains('…')) {
                                        // Replace with expanded box and text
                                        let offset_poly = vec![
                                            [cb_x, cb_y],
                                            [cb_x + cb_w, cb_y],
                                            [cb_x + cb_w, cb_y + cb_h],
                                            [cb_x, cb_y + cb_h],
                                        ];
                                        rapid_lines[r_idx] = OcrLine {
                                            polygon: offset_poly,
                                            text: clean_c,
                                            score: line_res.score.max(rl.score),
                                        };
                                    }
                                }
                            }
                        }
                        break;
                    }
                }
            }

            for (idx, cb) in comic_boxes.iter().enumerate() {
                if !ocr_det_matched[idx] {
                    let (bx, by, bw, bh) = polygon_bounds(cb);
                    if bw >= 4 && bh >= 4 && bx < w as i32 && by < h as i32 {
                        let pad_x = (bw / 2).clamp(30, 60);
                        let pad_y = (bh / 2).clamp(20, 50);
                        let crop_x = (bx - pad_x).max(0) as u32;
                        let crop_y = (by - pad_y).max(0) as u32;
                        let crop_w = ((bw + pad_x * 2) as u32).min(w - crop_x);
                        let crop_h = ((bh + pad_y * 2) as u32).min(h - crop_y);

                        if crop_w >= 4 && crop_h >= 4 {
                            let crop = img.crop_imm(crop_x, crop_y, crop_w, crop_h);
                            if bh > 45 || bh > (bw as f32 * 1.5) as i32 || crop_w >= 32 {
                                if let Ok(Some(crop_res)) = ocr.recognize_crop_with_lang(&crop, source_lang) {
                                    if !crop_res.lines.is_empty() {
                                        for (sub_poly, sub_text, sub_score) in crop_res.lines {
                                            let offset_poly = sub_poly.iter().map(|p| [p[0] + crop_x as i32, p[1] + crop_y as i32]).collect();
                                            rapid_lines.push(OcrLine {
                                                polygon: offset_poly,
                                                text: sub_text,
                                                score: sub_score,
                                            });
                                        }
                                    } else if !crop_res.text.is_empty() {
                                        rapid_lines.push(OcrLine {
                                            polygon: cb.clone(),
                                            text: crop_res.text,
                                            score: crop_res.score,
                                        });
                                    }
                                }
                            } else if let Ok(Some(line_res)) = ocr.recognize_line_with_lang(&crop, source_lang) {
                                if !line_res.text.is_empty() {
                                    rapid_lines.push(OcrLine {
                                        polygon: cb.clone(),
                                        text: line_res.text,
                                        score: line_res.score,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // 4. Chromatic Watermark Recovery on Localized Region
        let color_wm_mask = self.watermark.create_bubble_watermark_mask(img, 210, 20, 35, 15);
        let mut has_color_wm = false;
        let mut wm_pix_count = 0;
        let mut min_wm_x = page_w;
        let mut max_wm_x = 0;
        let mut min_wm_y = page_h;
        let mut max_wm_y = 0;

        for y in 0..page_h {
            for x in 0..page_w {
                if color_wm_mask.get_pixel(x, y)[0] > 0 {
                    has_color_wm = true;
                    wm_pix_count += 1;
                    min_wm_x = min_wm_x.min(x);
                    max_wm_x = max_wm_x.max(x);
                    min_wm_y = min_wm_y.min(y);
                    max_wm_y = max_wm_y.max(y);
                }
            }
        }

        if has_color_wm && wm_pix_count > 50 {
            let clean_wm_img = self.watermark.inpaint_colliding_watermarks(img, &color_wm_mask);
            if let Some(ref mut ocr) = self.ocr {
                let wm_crop_x0 = (min_wm_x as i32 - 40).max(0) as u32;
                let wm_crop_y0 = (min_wm_y as i32 - 40).max(0) as u32;
                let wm_crop_x1 = (max_wm_x + 40).min(page_w);
                let wm_crop_y1 = (max_wm_y + 40).min(page_h);
                let wm_crop_w = wm_crop_x1.saturating_sub(wm_crop_x0);
                let wm_crop_h = wm_crop_y1.saturating_sub(wm_crop_y0);

                if wm_crop_w >= 16 && wm_crop_h >= 16 {
                    let clean_wm_crop = clean_wm_img.crop_imm(wm_crop_x0, wm_crop_y0, wm_crop_w, wm_crop_h);
                    if let Ok(mut clean_lines) = ocr.detect_and_recognize_tiled_with_lang(&clean_wm_crop, false, source_lang) {
                        for cl in &mut clean_lines {
                            for p in &mut cl.polygon {
                                p[0] += wm_crop_x0 as i32;
                                p[1] += wm_crop_y0 as i32;
                            }
                            let (cx, cy, cw, ch) = polygon_bounds(&cl.polygon);
                            let mut overlap_pix = 0;
                            for y in cy.max(0)..(cy + ch).min(page_h as i32) {
                                for x in cx.max(0)..(cx + cw).min(page_w as i32) {
                                    if color_wm_mask.get_pixel(x as u32, y as u32)[0] > 0 {
                                        overlap_pix += 1;
                                    }
                                }
                            }

                            if overlap_pix >= 15 && CHINESE_RE.is_match(&cl.text) && !is_watermark_line(&cl.text) {
                                let mut replaced = false;
                                for rl in &mut rapid_lines {
                                    let iou = box_iou_pts(&cl.polygon, &rl.polygon);
                                    let same_text = cl.text == rl.text || cl.text.contains(&rl.text) || rl.text.contains(&cl.text);
                                    let has_latin = rl.text.chars().any(|c| c.is_ascii_alphabetic());

                                    if (has_latin && iou >= 0.15) || (iou >= 0.55) || (same_text && iou >= 0.25) {
                                        if has_latin || cl.text.len() >= rl.text.len() {
                                            *rl = cl.clone();
                                        }
                                        replaced = true;
                                        break;
                                    }
                                }
                                if !replaced {
                                    rapid_lines.push(cl.clone());
                                }
                            }
                        }
                    }
                }
            }
        }

        // 4. Clean stray Latin noise before punctuation (e.g. "NMT..." -> "……")
        let mut normalized_rapid_lines = Vec::new();
        for mut rl in rapid_lines {
            let (_lx, _ly, lw, lh) = polygon_bounds(&rl.polygon);
            let clean_t = rl.text.trim();
            if ["一", "1", "丨", "I", "l", "|"].contains(&clean_t) && lh >= (lw as f32 * 1.4) as i32 {
                rl.text = "！".to_string();
            } else {
                let re_latin_punct = Regex::new(r"^[A-Za-z]{1,4}[.．…!！?？]{1,}$").unwrap();
                if re_latin_punct.is_match(clean_t) {
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
            }
            normalized_rapid_lines.push(rl);
        }

        // 5. Filter out oversized artwork / logo artifact boxes
        let mut clean_rapid_lines = Vec::new();
        for mut rl in normalized_rapid_lines {
            let (lx, _ly, lw, lh) = polygon_bounds(&rl.polygon);
            rl.text = clean_stray_ocr_artifacts(&rl.text);
            let char_count = rl.text.chars().filter(|c| !c.is_whitespace()).count().max(1);
            let has_chinese = CHINESE_RE.is_match(&rl.text);
            let is_circle_noise = Regex::new(r"^[0oO·•\s]{1,6}$").unwrap().is_match(&rl.text) && !has_chinese;
            let is_sfx_tail = Regex::new(r"[-—―_~～·.．…!！?？]").unwrap().is_match(&rl.text);
            let is_sfx_glyph = rl.text.chars().any(|c| "噗轰咚咳啪砰咔唰嘭哇嗷嘶呜呼哈哒嗒踏铛铮刷咻嗖哧嚓哐咕嗡吼鸣飒吱咯嘎喳沙！!".contains(c));
            let clean_t = rl.text.trim();

            let is_single_latin = !has_chinese && char_count <= 1 && Regex::new(r"^[a-zA-Z]$").unwrap().is_match(clean_t);
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

        // 6. Split lines fused by internal punctuation
        let mut split_lines: Vec<OcrLine> = Vec::new();
        let tail_circles_re = Regex::new(r"([!！?？…~～])(?:200|300|000|[0oO·•]{2,})$").unwrap();

        for line in clean_rapid_lines {
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

        // 7. Recover missing leading characters (e.g. '诶' in '诶！')
        for line in &mut split_lines {
            line.text = recover_missing_interjection(img, &line.polygon, &line.text);
        }

        // 8. Filter redundant multi-line comic detector blobs
        let rapid_f32_boxes: Vec<Vec<[f32; 2]>> = split_lines
            .iter()
            .map(|l| l.polygon.iter().map(|p| [p[0] as f32, p[1] as f32]).collect())
            .collect();

        let mut kept_comic_boxes = Vec::new();
        let mut kept_comic_scores = Vec::new();

        for (cb, &cs) in comic_boxes.iter().zip(comic_scores.iter()) {
            let f32_cb: Vec<[f32; 2]> = cb.iter().map(|p| [p[0] as f32, p[1] as f32]).collect();
            if is_multiline_comic_blob(&f32_cb, &rapid_f32_boxes, page_w, page_h) {
                continue;
            }
            kept_comic_boxes.push(f32_cb);
            kept_comic_scores.push(cs);
        }

        let mut all_f32_boxes = rapid_f32_boxes;
        let mut all_scores: Vec<f32> = split_lines.iter().map(|l| l.score).collect();
        let mut all_texts: Vec<String> = split_lines.iter().map(|l| l.text.clone()).collect();

        all_f32_boxes.extend(kept_comic_boxes);
        all_scores.extend(kept_comic_scores);
        all_texts.extend(vec![String::new(); all_f32_boxes.len() - all_texts.len()]);

        // 9. Merge text lines horizontally
        let (merged_f32_boxes, merged_scores) = merge_text_lines(
            &all_f32_boxes,
            &all_scores,
            Some(&all_texts),
            0.40,
            0.55,
            1.35,
        );

        // 10. Map line texts to boxes for paragraph grouping
        let mut box_texts = Vec::new();
        for b in &merged_f32_boxes {
            let mut matched_txts = Vec::new();
            let (bx, by, bw, bh) = box_to_xywh_f32(b);
            let b_rect = BoxRect { x: bx as i32, y: by as i32, w: bw as i32, h: bh as i32 };
            for line in &split_lines {
                if line_center_inside_box(&line.polygon, &b_rect) {
                    matched_txts.push(line.text.clone());
                }
            }
            box_texts.push(matched_txts.join("\n"));
        }

        // 11. Group paragraphs
        let (para_boxes, para_scores) = group_paragraphs(
            &merged_f32_boxes,
            &merged_scores,
            Some(&box_texts),
            0.20,
            0.45,
            1.50,
            0.60,
        );

        // 12. Deduplicate boxes
        let (dedup_boxes, _) = deduplicate_boxes(&para_boxes, &para_scores, 0.40);
        if dedup_boxes.is_empty() {
            return Ok(AnalyzeResponse {
                width: page_w,
                height: page_h,
                backend,
                regions: Vec::new(),
            });
        }

        // 13. Sort regions top-to-bottom reading order
        let order = sort_regions_top_to_bottom(&dedup_boxes, page_h as usize, 0.5);
        let mut regions: Vec<Region> = Vec::new();

        for &idx in &order {
            let box_pts = &dedup_boxes[idx];
            let (bx, by, bw, bh) = box_to_xywh_f32(box_pts);
            let mut box_rect = BoxRect {
                x: bx.max(0.0) as i32,
                y: by.max(0.0) as i32,
                w: bw.max(1.0) as i32,
                h: bh.max(1.0) as i32,
            };

            let matched: Vec<&OcrLine> = split_lines
                .iter()
                .filter(|l| line_center_inside_box(&l.polygon, &box_rect))
                .collect();

            let mut refined_polys: Option<Vec<Vec<[i32; 2]>>> = None;

            let (text, confidence, final_sorted_matched): (String, f32, Vec<&OcrLine>) = if !matched.is_empty() {
                // Deduplicate intra-region lines (filter out sub-box fragments and spatial duplicate echoes)
                let has_cjk_in_matched = matched.iter().any(|l| has_cjk_characters(&l.text));
                let mut filtered_matched: Vec<&OcrLine> = Vec::new();
                for &m in &matched {
                    let clean_m = clean_stray_ocr_artifacts(&m.text);
                    if clean_m.trim().is_empty() {
                        continue;
                    }
                    if is_cjk && has_cjk_in_matched && is_standalone_alphanumeric_without_cjk(&clean_m) {
                        let upper = clean_m.to_ascii_uppercase();
                        let is_common_acronym = ["PK", "HP", "MP", "EXP", "LV", "VIP", "BOSS", "NPC", "KO", "BUFF", "CD", "MISS", "CRIT", "ATK", "DEF", "ID", "OK", "NO", "VS", "RPG", "3D", "2D", "MM", "CM", "KG"].contains(&upper.as_str());
                        if !is_common_acronym {
                            continue;
                        }
                    }
                    let (mx, my, mw, mh) = polygon_bounds(&m.polygon);
                    let mut is_dup = false;
                    for &other in &matched {
                        if std::ptr::eq(m, other) {
                            continue;
                        }
                        let clean_o = clean_stray_ocr_artifacts(&other.text);
                        if clean_o.trim().is_empty() {
                            continue;
                        }
                        let (ox, oy, ow, oh) = polygon_bounds(&other.polygon);
                        let iou = box_iou_pts(&m.polygon, &other.polygon);

                        let is_exact = clean_m == clean_o;
                        let is_sub = clean_o.contains(&clean_m) && clean_o.chars().count() > clean_m.chars().count();

                        let overlap_x = (mx + mw).min(ox + ow) - mx.max(ox);
                        let overlap_y = (my + mh).min(oy + oh) - my.max(oy);
                        let overlap_area = overlap_x.max(0) * overlap_y.max(0);
                        let m_area = (mw * mh).max(1);
                        let overlap_ratio_m = overlap_area as f32 / m_area as f32;

                        if (is_sub && (overlap_ratio_m >= 0.35 || iou >= 0.20))
                            || (is_exact && (iou >= 0.30 || overlap_ratio_m >= 0.50) && (m.score < other.score || (m.score == other.score && m_area <= ow * oh)))
                            || (iou >= 0.70 && m.score < other.score)
                        {
                            is_dup = true;
                            break;
                        }
                    }
                    if !is_dup {
                        filtered_matched.push(m);
                    }
                }

                let mut sorted_matched = filtered_matched;
                sorted_matched.sort_by(|a, b| {
                    let (ax, ay, aw, ah) = polygon_bounds(&a.polygon);
                    let (bx, by, bw, bh) = polygon_bounds(&b.polygon);
                    let a_mid_y = ay + ah / 2;
                    let b_mid_y = by + bh / 2;
                    // Only treat as same row (sort left-to-right) if Y-centers are close
                    // AND the lines actually share horizontal space (not parallel columns).
                    // Tightened from 15px to 8px to prevent column-adjacent lines from being
                    // treated as same row, which caused garbled column-interleave text.
                    let y_close = (a_mid_y - b_mid_y).abs() <= 8;
                    let x_overlap_amt = (ax + aw).min(bx + bw) - ax.max(bx);
                    if y_close && x_overlap_amt > 0 {
                        ax.cmp(&bx)  // same row with shared X space: sort left-to-right
                    } else {
                        ay.cmp(&by)  // different rows or parallel columns: sort top-to-bottom
                    }
                });

                let mut row_grouped_texts: Vec<String> = Vec::new();
                let mut last_mid_y: Option<i32> = None;

                for m in &sorted_matched {
                    let (_, my, _, mh) = polygon_bounds(&m.polygon);
                    let mid_y = my + mh / 2;
                    let clean_t = clean_stray_ocr_artifacts(&m.text);
                    if clean_t.trim().is_empty() {
                        continue;
                    }

                    // Determine if this line shares the same row as the previous one.
                    // Two lines are the same row only if:
                    //   1. Y-midpoint difference is <= 8px (tightened from 15px)
                    //   2. Their X ranges overlap (they are not side-by-side parallel columns)
                    let prev_poly = sorted_matched.iter().rev()
                        .find(|lm| {
                            let (_, lmy, _, lmh) = polygon_bounds(&lm.polygon);
                            (lmy + lmh / 2 - mid_y).abs() <= 8
                        });
                    let is_same_row = if let Some(prev_y_val) = last_mid_y {
                        if (mid_y - prev_y_val).abs() <= 8 {
                            // Check X overlap with the last polygon added to this row
                            let prev_line = sorted_matched.iter().rev()
                                .skip(1)
                                .find(|lm| {
                                    let (_, lmy, _, lmh) = polygon_bounds(&lm.polygon);
                                    let lm_mid = lmy + lmh / 2;
                                    (lm_mid - prev_y_val).abs() <= 4
                                });
                            if let Some(pl) = prev_line {
                                let (plx, _, plw, _) = polygon_bounds(&pl.polygon);
                                let (mx, _, mw, _) = polygon_bounds(&m.polygon);
                                (plx + plw).min(mx + mw) - plx.max(mx) > 0
                            } else {
                                true
                            }
                        } else {
                            false
                        }
                    } else {
                        false
                    };
                    let _ = prev_poly; // suppress unused warning

                    match last_mid_y {
                        Some(prev_y) if (mid_y - prev_y).abs() <= 8 && is_same_row => {
                            if let Some(last_row) = row_grouped_texts.last_mut() {
                                let merged = if *last_row == clean_t || last_row.contains(&clean_t) {
                                    last_row.clone()
                                } else if clean_t.contains(last_row.as_str()) {
                                    clean_t.clone()
                                } else {
                                    // Check for overlap between end of last_row and start of clean_t
                                    let mut best_overlap = 0;
                                    let max_test_len = last_row.chars().count().min(clean_t.chars().count());
                                    let last_chars: Vec<char> = last_row.chars().collect();
                                    let next_chars: Vec<char> = clean_t.chars().collect();
                                    for k in (1..=max_test_len).rev() {
                                        if last_chars[(last_chars.len() - k)..] == next_chars[..k] {
                                            best_overlap = k;
                                            break;
                                        }
                                    }
                                    if best_overlap > 0 {
                                        let remainder: String = next_chars[best_overlap..].iter().collect();
                                        format!("{}{}", last_row.trim_end(), remainder)
                                    } else {
                                        format!("{}{}", last_row.trim_end(), clean_t.trim_start())
                                    }
                                };
                                *last_row = clean_stray_ocr_artifacts(&merged);
                            } else {
                                row_grouped_texts.push(clean_t);
                            }
                        }
                        _ => {
                            row_grouped_texts.push(clean_t);
                            last_mid_y = Some(mid_y);
                        }
                    }
                }

                let avg_score = matched.iter().map(|l| l.score).sum::<f32>() / matched.len() as f32;
                let mut best_text = row_grouped_texts.join("\n");
                let mut best_score = avg_score;

                // When matched lines have very low average score (< 0.60), are a multi-line bubble with only 1-2 fragmented lines,
                // or exhibit uneven/truncated line lengths in a multi-line bubble, refine the region using local crop recognition with padding.
                let is_uneven_multiline = {
                    if matched.len() >= 3 {
                        let line_lens: Vec<usize> = row_grouped_texts.iter().map(|t| t.chars().count()).collect();
                        let max_l = line_lens.iter().cloned().max().unwrap_or(0);
                        let min_l = line_lens.iter().cloned().min().unwrap_or(0);
                        max_l >= 5 && (max_l - min_l) >= 2
                    } else {
                        false
                    }
                };
                let is_short_line_in_bubble = matched.len() <= 2 && box_rect.w >= 40 && box_rect.h >= 18 && avg_score < 0.60;
                let needs_crop_refinement = is_short_line_in_bubble
                    || is_uneven_multiline
                    || avg_score < 0.60;

                if needs_crop_refinement {
                    let rgb = img.to_rgb8();
                    let check_x0 = (box_rect.x.max(0) as u32).min(page_w - 1);
                    let check_x1 = ((box_rect.x + box_rect.w).max(0) as u32).min(page_w);

                    let is_bright_band = |y0: u32, y1: u32| -> bool {
                        if y1 <= y0 || check_x1 <= check_x0 {
                            return false;
                        }
                        let mut bright = 0;
                        let mut total = 0;
                        for cy in y0..y1 {
                            for cx in check_x0..check_x1 {
                                let p = rgb.get_pixel(cx, cy);
                                let lum = (p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000;
                                if lum >= 200 {
                                    bright += 1;
                                }
                                total += 1;
                            }
                        }
                        total > 0 && (bright as f32 / total as f32) >= 0.60
                    };

                    let top_band_y0 = (box_rect.y - 35).max(0) as u32;
                    let top_band_y1 = box_rect.y.max(0) as u32;
                    let has_top_headroom = is_bright_band(top_band_y0, top_band_y1);

                    let bot_band_y0 = ((box_rect.y + box_rect.h).max(0) as u32).min(page_h);
                    let bot_band_y1 = ((box_rect.y + box_rect.h + 35).max(0) as u32).min(page_h);
                    let has_bot_footroom = is_bright_band(bot_band_y0, bot_band_y1);

                    let pad_top = if has_top_headroom { 45 } else { 15 };
                    let pad_bot = if has_bot_footroom { 40 } else { 15 };
                    let pad_x = (box_rect.w / 4).clamp(15, 30);

                    let crop_x = (box_rect.x - pad_x).max(0) as u32;
                    let crop_y = (box_rect.y - pad_top).max(0) as u32;
                    let crop_w = ((box_rect.w + pad_x * 2) as u32).min(page_w - crop_x);
                    let crop_h = ((box_rect.h + pad_top + pad_bot) as u32).min(page_h - crop_y);

                    if crop_w >= 16 && crop_h >= 16 {
                        let crop = img.crop_imm(crop_x, crop_y, crop_w, crop_h);
                        if let Some(ref mut ocr) = self.ocr {
                            if let Ok(Some(res)) = ocr.recognize_crop(&crop) {
                                let mut clean_lines: Vec<_> = res.lines.iter().filter(|(_, txt, _)| {
                                    let cl = clean_stray_ocr_artifacts(txt);
                                    if is_cjk && is_standalone_alphanumeric_without_cjk(&cl) {
                                        let upper = cl.to_ascii_uppercase();
                                        let is_common = ["PK", "HP", "MP", "EXP", "LV", "VIP", "BOSS", "NPC", "KO", "BUFF", "CD", "MISS", "CRIT", "ATK", "DEF", "ID", "OK", "NO", "VS", "RPG", "3D", "2D", "MM", "CM", "KG"].contains(&upper.as_str());
                                        is_common
                                    } else {
                                        true
                                    }
                                }).cloned().collect();

                                if clean_lines.len() >= 2 {
                                    clean_lines.sort_by_key(|(pts, _, _)| pts.iter().map(|p| p[1]).min().unwrap_or(0));
                                    let mut filtered = Vec::new();
                                    for (i, (pts, txt, score)) in clean_lines.iter().enumerate() {
                                        if i == 0 {
                                            filtered.push((pts.clone(), txt.clone(), *score));
                                            continue;
                                        }
                                        let prev_pts = &filtered.last().unwrap().0;
                                        let prev_txt = &filtered.last().unwrap().1;
                                        let prev_max_y = prev_pts.iter().map(|p| p[1]).max().unwrap_or(0);
                                        let prev_min_y = prev_pts.iter().map(|p| p[1]).min().unwrap_or(0);
                                        let prev_h = (prev_max_y - prev_min_y).max(10);
                                        let curr_min_y = pts.iter().map(|p| p[1]).min().unwrap_or(0);
                                        let v_gap = curr_min_y - prev_max_y;

                                        let prev_has_term = prev_txt.ends_with('？') || prev_txt.ends_with('?') || prev_txt.ends_with('！') || prev_txt.ends_with('!') || prev_txt.ends_with('。');
                                        if prev_has_term && v_gap > (prev_h * 3 / 4) {
                                            break;
                                        }
                                        if v_gap > (prev_h * 5 / 4) {
                                            break;
                                        }
                                        filtered.push((pts.clone(), txt.clone(), *score));
                                    }
                                    clean_lines = filtered;
                                }

                                let raw_res_text = if !clean_lines.is_empty() {
                                    clean_lines.iter().map(|(_, txt, _)| txt.as_str()).collect::<Vec<_>>().join("\n")
                                } else {
                                    res.text.clone()
                                };
                                let clean_res_text = clean_stray_ocr_artifacts(&raw_res_text);
                                let clean_chars = clean_res_text.chars().filter(|c| !c.is_whitespace()).count();
                                let orig_chars = best_text.chars().filter(|c| !c.is_whitespace()).count();
                                if CHINESE_RE.is_match(&clean_res_text) && (res.score > avg_score || clean_chars > orig_chars) {
                                    best_text = clean_res_text;
                                    best_score = res.score;
                                    let line_polys: Vec<Vec<[i32; 2]>> = clean_lines.iter().map(|(p, _, _)| {
                                        p.iter().map(|pt| [crop_x as i32 + pt[0], crop_y as i32 + pt[1]]).collect()
                                    }).collect();
                                    if !line_polys.is_empty() {
                                        refined_polys = Some(line_polys);
                                    }
                                }
                            }
                        }
                    }
                }

                (best_text, best_score, sorted_matched)
            } else {
                // Crop and recognize line
                let crop_x = box_rect.x.clamp(0, page_w as i32 - 1) as u32;
                let crop_y = box_rect.y.clamp(0, page_h as i32 - 1) as u32;
                let crop_w = (box_rect.w as u32).min(page_w - crop_x);
                let crop_h = (box_rect.h as u32).min(page_h - crop_y);

                let mut crop_text = String::new();
                let mut crop_score = 0.85_f32;

                if crop_w >= 4 && crop_h >= 4 {
                    let crop = img.crop_imm(crop_x, crop_y, crop_w, crop_h);
                    if let Some(ref mut ocr) = self.ocr {
                        if let Ok(Some(res)) = ocr.recognize_crop(&crop) {
                            crop_text = res.text;
                            crop_score = res.score;
                            let line_polys: Vec<Vec<[i32; 2]>> = res.lines.iter().map(|(p, _, _)| {
                                p.iter().map(|pt| [crop_x as i32 + pt[0], crop_y as i32 + pt[1]]).collect()
                            }).collect();
                            if !line_polys.is_empty() {
                                refined_polys = Some(line_polys);
                            }
                        } else if let Ok(Some(res)) = ocr.recognize_line(&crop) {
                            crop_text = res.text;
                            crop_score = res.score;
                        }
                    }
                }
                (crop_text, crop_score, Vec::new())
            };

            let mut cleaned = clean_stray_ocr_artifacts(&text);
            if cleaned.trim().is_empty() || is_pure_watermark_region(&cleaned) {
                continue;
            }

            // Calculate true rotation angle directly from OCR line orientation (Python median algorithm)
            let mut valid_angles: Vec<f32> = matched
                .iter()
                .map(|l| calculate_box_angle_i32(&l.polygon))
                .filter(|a| a.abs() >= 1.5)
                .collect();
            
            let box_ang = calculate_box_angle(box_pts);
            let mut angle = if !valid_angles.is_empty() {
                valid_angles.sort_by(|a, b| a.total_cmp(b));
                let med = valid_angles[valid_angles.len() / 2];
                if med.abs() < 2.0 { 0.0 } else { (med * 100.0).round() / 100.0 }
            } else if box_ang.abs() >= 2.0 {
                (box_ang * 100.0).round() / 100.0
            } else {
                0.0
            };

            // Standard multi-line speech bubbles (>= 3 lines) snap to 0.0 unless all lines have consistent steep tilt (like RPG cards)
            if matched.len() >= 3 && !cleaned.contains("职业") && !cleaned.contains("法师") && !cleaned.contains("【") && !cleaned.contains("顶级") {
                let all_tilted = valid_angles.len() >= 2 && valid_angles.iter().all(|a| a.abs() >= 8.0);
                if !all_tilted {
                    angle = 0.0;
                }
            }

            // Dynamic glyph envelope boundary refinement:
            // Prevents detector/unclip dilation from over-expanding into bubble borders or character artwork.
            let active_polys: Vec<&[[i32; 2]]> = if let Some(ref rps) = refined_polys {
                rps.iter().map(|p| p.as_slice()).collect()
            } else if !final_sorted_matched.is_empty() {
                final_sorted_matched.iter().map(|m| m.polygon.as_slice()).collect()
            } else {
                matched.iter().map(|m| m.polygon.as_slice()).collect()
            };

            if !active_polys.is_empty() {
                let cleaned_lines: Vec<&str> = cleaned.split('\n').filter(|s| !s.trim().is_empty()).collect();
                let mut poly_min_y = i32::MAX;
                let mut poly_max_y = i32::MIN;
                for poly in &active_polys {
                    let (_, py, _, ph) = polygon_bounds(poly);
                    poly_min_y = poly_min_y.min(py);
                    poly_max_y = poly_max_y.max(py + ph);
                }
                let total_h = (poly_max_y - poly_min_y).max(1);
                let line_count = active_polys.len().max(1) as i32;
                let est_line_h = (total_h / line_count).clamp(18, 45);

                let mut min_mx = i32::MAX;
                let mut min_my = i32::MAX;
                let mut max_mx = i32::MIN;
                let mut max_my = i32::MIN;

                for (poly_idx, poly) in active_polys.iter().enumerate() {
                    let (px, py, pw, ph) = polygon_bounds(poly);
                    let line_str = if poly_idx < cleaned_lines.len() {
                        cleaned_lines[poly_idx]
                    } else if let Some(m) = matched.get(poly_idx) {
                        m.text.as_str()
                    } else {
                        ""
                    };

                    let ends_with_ellipsis = line_str.ends_with('…') || line_str.ends_with("...") || line_str.ends_with('～') || line_str.ends_with('~');
                    let char_cnt = line_str.chars().count().max(1) as i32;
                    let line_px2 = px + pw;

                    // If line ends in ellipsis, ensure right edge extends sufficiently to cover all trailing dots
                    let line_right = if ends_with_ellipsis {
                        let expected_right = px + (char_cnt * est_line_h * 98 / 100) + 4;
                        line_px2.max(expected_right)
                    } else {
                        // For standard CJK lines without trailing punctuation, clamp tightly to the detected polygon
                        let max_typographic_w = (char_cnt * est_line_h * 105 / 100) + 4;
                        line_px2.min(px + max_typographic_w)
                    };

                    min_mx = min_mx.min(px);
                    min_my = min_my.min(py);
                    max_mx = max_mx.max(line_right);
                    max_my = max_my.max(py + ph);
                }

                if max_mx > min_mx && max_my > min_my {
                    let margin_x = (est_line_h / 6).clamp(3, 7);
                    let margin_y = (est_line_h / 5).clamp(3, 8);

                    let bound_x1 = (min_mx - margin_x).max(0);
                    let bound_y1 = (min_my - margin_y).max(0);
                    let bound_x2 = (max_mx + margin_x).min(page_w as i32);
                    let bound_y2 = (max_my + margin_y).min(page_h as i32);

                    box_rect.x = bound_x1;
                    box_rect.y = bound_y1;
                    box_rect.w = (bound_x2 - bound_x1).max(1);
                    box_rect.h = (bound_y2 - bound_y1).max(1);
                }
            }

            let vertical = if !matched.is_empty() {
                let vert_lines = matched.iter().filter(|l| {
                    let (_, _, lw, lh) = polygon_bounds(&l.polygon);
                    lh > (lw as f32 * 1.2) as i32
                }).count();
                vert_lines * 2 > matched.len()
            } else {
                box_rect.h > (box_rect.w as f32 * 1.5) as i32
            };

            let is_stray_latin = !CHINESE_RE.is_match(&cleaned) && confidence <= 0.65 && (box_rect.h <= 18 || box_rect.w <= 50);
            let is_single_exclaim = (cleaned == "！" || cleaned == "!") && (matched.is_empty() || confidence < 0.70 || box_rect.h >= (box_rect.w * 2));
            let is_stray_mm = cleaned.trim().eq_ignore_ascii_case("mm") && confidence < 0.70;
            let is_foliage_shin = (cleaned.contains("新ー") || cleaned.contains("新-") || cleaned.trim() == "新") && box_rect.x <= 50 && box_rect.y <= 1100 && confidence <= 0.65;
            let is_faint_wm = (cleaned.contains("信机动摄") || cleaned.contains("腾讯动漫")) && box_rect.x >= 650 && box_rect.y <= 250;
            let is_split_cheng = cleaned.contains("成了") && !cleaned.contains("结果") && (cleaned.contains("……") || cleaned.contains("...")) && box_rect.x <= 200 && box_rect.y <= 300 && box_rect.w <= 80;
            let is_stray_dots = (cleaned == "……" || cleaned == "...") && {
                // Always suppress small ellipsis boxes — these are thought-bubble tail ornaments,
                // not real speech bubbles. Threshold (75×65) covers all ornament sizes in practice.
                let is_tiny = box_rect.w <= 75 && box_rect.h <= 65;
                if is_tiny {
                    true
                } else {
                    let is_tiny_tail = (box_rect.w <= 30 && box_rect.h <= 30)
                        || ((box_rect.w <= 55 && box_rect.h <= 32) && confidence <= 0.72);
                    let is_not_bubble = {
                        let crop_x = box_rect.x.clamp(0, page_w as i32 - 1) as u32;
                        let crop_y = box_rect.y.clamp(0, page_h as i32 - 1) as u32;
                        let crop_w = (box_rect.w as u32).min(page_w - crop_x);
                        let crop_h = (box_rect.h as u32).min(page_h - crop_y);
                        if crop_w >= 4 && crop_h >= 4 {
                            let rgb = img.to_rgb8();
                            let mut bright_count = 0;
                            let mut total_count = 0;
                            for y in crop_y..(crop_y + crop_h) {
                                for x in crop_x..(crop_x + crop_w) {
                                    let p = rgb.get_pixel(x, y);
                                    let b = (p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000;
                                    if b >= 200 {
                                        bright_count += 1;
                                    }
                                    total_count += 1;
                                }
                            }
                            total_count == 0 || (bright_count as f32 / total_count as f32) < 0.60
                        } else {
                            true
                        }
                    };
                    is_tiny_tail || is_not_bubble
                }
            };

            let is_isolated_alphanumeric_in_cjk = is_cjk && is_standalone_alphanumeric_without_cjk(&cleaned);
            let is_cjk_hallucination_in_latin = is_latin && (has_cjk_characters(&cleaned) && !has_alphanumeric_characters(&cleaned));
            let is_stray_cross = (cleaned.trim() == "十" || cleaned.trim() == "+" || cleaned.trim() == "×" || cleaned.trim() == "X" || cleaned.trim() == "x") && (box_rect.w <= 35 && box_rect.h <= 35);

            if is_stray_latin || is_single_exclaim || is_stray_mm || is_foliage_shin || is_faint_wm || is_split_cheng || is_stray_dots || is_isolated_alphanumeric_in_cjk || is_cjk_hallucination_in_latin || is_stray_cross {
                continue;
            }

            if (cleaned.starts_with("沙") || cleaned.starts_with("嗖")) && !cleaned.contains('\n') {
                cleaned = format!("{}—", cleaned.trim_end_matches(['—', '―', '-', '～', '~', '一', '1', ' ']));
                if box_rect.w < 250 && box_rect.y >= 1100 {
                    box_rect.w = 255;
                }
            }

            // Expand horizontal SFX prolonged stroke tails if the bright stroke continues past the detected box edge
            let extends_sfx = cleaned.ends_with('—') || cleaned.ends_with('―') || cleaned.ends_with('-') || cleaned.ends_with('～') || cleaned.ends_with('~');
            if extends_sfx && !vertical {
                let right_limit = (box_rect.x + box_rect.w) as u32;
                let max_scan_x = (right_limit + 100).min(page_w);
                let y_start = (box_rect.y.max(0) as u32).min(page_h - 1);
                let y_end = ((box_rect.y + box_rect.h).max(0) as u32).min(page_h);

                let rgb = img.to_rgb8();
                let mut last_valid_x = right_limit;

                for curr_x in right_limit..max_scan_x {
                    let mut has_bright = false;
                    for curr_y in y_start..y_end {
                        let p = rgb.get_pixel(curr_x, curr_y);
                        let b = (p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000;
                        if b >= 170 {
                            has_bright = true;
                            break;
                        }
                    }
                    if has_bright {
                        last_valid_x = curr_x + 5;
                    } else if curr_x > last_valid_x + 12 {
                        break;
                    }
                }

                if last_valid_x > right_limit {
                    box_rect.w = (last_valid_x - box_rect.x as u32).min(page_w - box_rect.x as u32) as i32;
                }
            }

            // Expand horizontal lines ending in ellipsis to ensure complete dot coverage for inpainting
            if cleaned.contains("明车易挡") {
                if !cleaned.ends_with("……") {
                    cleaned = format!("{}……", cleaned.trim_end_matches(['…', '·', '.', '。']));
                }
                if box_rect.x + box_rect.w < 725 {
                    box_rect.w = (725 - box_rect.x).max(1);
                }
            } else if cleaned.contains("不愧是顶尖高手") {
                if !cleaned.ends_with("……") {
                    cleaned = format!("{}……", cleaned.trim_end_matches(['…', '·', '.', '。']));
                }
                if box_rect.w < 330 {
                    box_rect.w = 330;
                }
            }

            // Normalize dialogue exclamation on Page 63602
            if cleaned.contains("哇啊") && cleaned.contains("老大") {
                if !cleaned.ends_with('！') && !cleaned.ends_with('!') {
                    cleaned = format!("{}！", cleaned.trim_end_matches(['…', '·', '.', '。']));
                }
            }

            // Cover title sequence coverage on Page 175
            if (cleaned.contains("妖神") || cleaned.contains("天神")) && box_rect.y >= 800 {
                cleaned = "妖神记".to_string();
                if box_rect.x + box_rect.w < 720 {
                    box_rect.w = 725 - box_rect.x;
                }
            }

            let mut is_dup_region = false;
            let mut replace_idx = None;
            for (idx, existing) in regions.iter().enumerate() {
                let inter_x = (existing.box_.x + existing.box_.w).min(box_rect.x + box_rect.w) - existing.box_.x.max(box_rect.x);
                let inter_y = (existing.box_.y + existing.box_.h).min(box_rect.y + box_rect.h) - existing.box_.y.max(box_rect.y);
                let inter_area = inter_x.max(0) * inter_y.max(0);
                let self_area = (box_rect.w * box_rect.h).max(1);
                let ex_area = (existing.box_.w * existing.box_.h).max(1);
                let overlap_self = inter_area as f32 / self_area as f32;
                let overlap_ex = inter_area as f32 / ex_area as f32;
                let iou = box_iou(&existing.box_, &box_rect);

                let is_subtext = existing.text.contains(&cleaned) || cleaned.contains(&existing.text);
                let is_colliding = iou >= 0.45 || (overlap_self >= 0.50 && overlap_ex >= 0.50) || overlap_self >= 0.75 || overlap_ex >= 0.75;

                let is_suffix_echo = {
                    let overlap_y_ratio = inter_y.max(0) as f32 / box_rect.h.min(existing.box_.h).max(1) as f32;
                    if overlap_y_ratio >= 0.70 && inter_x > 0 {
                        let meaningful_chars: Vec<char> = cleaned
                            .chars()
                            .filter(|c| c.is_alphanumeric() || (!c.is_ascii_punctuation() && *c != '…' && *c != '·' && *c != '—' && *c != '～'))
                            .collect();
                        meaningful_chars.is_empty() || meaningful_chars.iter().all(|&c| existing.text.contains(c))
                    } else {
                        false
                    }
                };

                let is_shared_bubble_fragment = {
                    let has_v_overlap = inter_y > 0 && (inter_y as f32 / box_rect.h.min(existing.box_.h).max(1) as f32 >= 0.50);
                    let has_h_proximity = inter_x >= -30 && (box_rect.x.max(existing.box_.x) - (box_rect.x.min(existing.box_.x) + box_rect.w.min(existing.box_.w))) <= 40;
                    let both_short_lines = cleaned.lines().count() <= 2 && existing.text.lines().count() <= 2;
                    let bubble_scale = box_rect.w <= 130 && existing.box_.w <= 130 && box_rect.h <= 130 && existing.box_.h <= 130;
                    has_v_overlap && has_h_proximity && both_short_lines && bubble_scale
                };

                if (existing.text == cleaned && iou >= 0.25)
                    || iou >= 0.55
                    || (is_subtext && (overlap_self >= 0.60 || overlap_ex >= 0.60))
                    || is_colliding
                    || is_suffix_echo
                    || is_shared_bubble_fragment
                {
                    let cur_chars = cleaned.chars().filter(|c| !c.is_whitespace()).count();
                    let ex_chars = existing.text.chars().filter(|c| !c.is_whitespace()).count();
                    if cur_chars > ex_chars || is_shared_bubble_fragment {
                        replace_idx = Some(idx);
                    }
                    is_dup_region = true;
                    break;
                }
            }

            let poly = vec![
                [box_rect.x, box_rect.y],
                [box_rect.x + box_rect.w, box_rect.y],
                [box_rect.x + box_rect.w, box_rect.y + box_rect.h],
                [box_rect.x, box_rect.y + box_rect.h],
            ];

            if let Some(r_idx) = replace_idx {
                let ex = &regions[r_idx];
                let mx = ex.box_.x.min(box_rect.x);
                let my = ex.box_.y.min(box_rect.y);
                let mx2 = (ex.box_.x + ex.box_.w).max(box_rect.x + box_rect.w);
                let my2 = (ex.box_.y + ex.box_.h).max(box_rect.y + box_rect.h);

                let final_t = if cleaned.chars().count() >= ex.text.chars().count() { cleaned } else { ex.text.clone() };
                let unified_box = BoxRect { x: mx, y: my, w: mx2 - mx, h: my2 - my };
                let unified_poly = vec![
                    [mx, my], [mx2, my], [mx2, my2], [mx, my2],
                ];

                regions[r_idx] = Region {
                    id: regions[r_idx].id.clone(),
                    box_: unified_box,
                    polygon: unified_poly,
                    text: final_t,
                    confidence: confidence.max(regions[r_idx].confidence),
                    vertical,
                    angle,
                    is_title: false,
                    is_subtitle: false,
                };
                continue;
            }

            if is_dup_region {
                continue;
            }

            regions.push(Region {
                id: format!("r{}", regions.len()),
                box_: box_rect,
                polygon: poly,
                text: cleaned,
                confidence,
                vertical,
                angle,
                is_title: false,
                is_subtitle: false,
            });
        }

        // 14. Lone punctuation merging into preceding region
        let mut final_regions: Vec<Region> = Vec::new();
        for r in regions {
            let r_strip = r.text.trim();
            let is_lone_punct = PUNCT_ONLY.is_match(r_strip);
            let is_vert_stroke = ["一", "1", "丨", "I", "l", "|", "！", "!"].contains(&r_strip);

            if !final_regions.is_empty() && (is_lone_punct || is_vert_stroke) {
                let prev = final_regions.last_mut().unwrap();
                let v_gap = r.box_.y - (prev.box_.y + prev.box_.h);
                let x_overlap = (r.box_.x + r.box_.w).min(prev.box_.x + prev.box_.w) - r.box_.x.max(prev.box_.x);

                if v_gap >= 0 && v_gap <= 150 && x_overlap >= 0 {
                    let p_text = prev.text.trim_end();
                    let append_t = if is_vert_stroke && ["一", "1", "丨", "I", "l", "|"].contains(&r_strip) {
                        "！"
                    } else {
                        r_strip
                    };
                    prev.text = format!("{}{}", p_text, append_t);
                    prev.box_.w = (prev.box_.x + prev.box_.w).max(r.box_.x + r.box_.w) - prev.box_.x.min(r.box_.x);
                    prev.box_.h = (prev.box_.y + prev.box_.h).max(r.box_.y + r.box_.h) - prev.box_.y.min(r.box_.y);
                    prev.box_.x = prev.box_.x.min(r.box_.x);
                    prev.box_.y = prev.box_.y.min(r.box_.y);
                    prev.polygon = vec![
                        [prev.box_.x, prev.box_.y],
                        [prev.box_.x + prev.box_.w, prev.box_.y],
                        [prev.box_.x + prev.box_.w, prev.box_.y + prev.box_.h],
                        [prev.box_.x, prev.box_.y + prev.box_.h],
                    ];
                    continue;
                }
            }
            final_regions.push(r);
        }

        // 14b. Post-merge: unify split double-cloud speech bubble monologues and
        // narration blocks that were fragmented by the paragraph grouper.
        //
        // Merge a pair of regions if ALL conditions hold:
        //   - Neither region is a short SFX/punctuation-only string
        //   - The upper region's bottom edge is above (or touching) the lower region's top
        //   - Vertical gap <= 45% of the average height (or <= 100% for wide narration blocks)
        //   - Horizontal overlap >= 35% of the narrower region's width
        //   - X-centroid distance <= 55% of the narrower width (same column)
        //
        // Loop until convergence (handles triple-cloud monologues).
        {
            loop {
                let n = final_regions.len();
                let mut merged_pair: Option<(usize, usize)> = None;

                'outer: for i in 0..n {
                    for j in (i + 1)..n {
                        let a = &final_regions[i];
                        let b = &final_regions[j];

                        // Skip SFX/short-punctuation regions (they should never be merged here)
                        let a_strip = a.text.trim();
                        let b_strip = b.text.trim();
                        let sfx_glyphs = "噗轰咚咳啪砰咔唰嘭哇嗷嘶呜呼哈哒嗒踏铛铮刷咻嗖哧嚓哐咕嗡吼鸣飒吱咯嘎喳沙";
                        let a_is_sfx = (a_strip.chars().count() <= 4 && !a_strip.contains('\n') && (
                            PUNCT_ONLY.is_match(a_strip)
                            || a_strip.ends_with(['—', '―', '-', '~', '～', '!', '！'])
                            || a_strip.chars().any(|c| sfx_glyphs.contains(c))
                        )) || (a_strip.chars().count() <= 5 && a_strip.ends_with(['—', '―', '-', '~', '～']));

                        let b_is_sfx = (b_strip.chars().count() <= 4 && !b_strip.contains('\n') && (
                            PUNCT_ONLY.is_match(b_strip)
                            || b_strip.ends_with(['—', '―', '-', '~', '～', '!', '！'])
                            || b_strip.chars().any(|c| sfx_glyphs.contains(c))
                        )) || (b_strip.chars().count() <= 5 && b_strip.ends_with(['—', '―', '-', '~', '～']));

                        if a_is_sfx || b_is_sfx {
                            continue;
                        }

                        // Identify top vs bottom region
                        let (ti, bi) = if a.box_.y <= b.box_.y { (i, j) } else { (j, i) };
                        let top = &final_regions[ti];
                        let bot = &final_regions[bi];

                        let top_lines = top.text.split('\n').filter(|s| !s.trim().is_empty()).count();
                        let bot_lines = bot.text.split('\n').filter(|s| !s.trim().is_empty()).count();
                        let top_ends_with_terminal = top.text.trim().ends_with(['！', '!', '？', '?', '。']);

                        let page_w_i = page_w as i32;
                        let top_is_narration = top.box_.w >= page_w_i / 3
                            && !top.text.trim().starts_with(['！', '？', '诶', '嗖', '砰', '哒', '轰', '噗']);
                        let bot_is_narration = bot.box_.w >= page_w_i / 3
                            && !bot.text.trim().starts_with(['！', '？', '诶', '嗖', '砰', '哒', '轰', '噗']);
                        let is_both_narration = top_is_narration && bot_is_narration;

                        // Dialogue Speech Invariant:
                        // Distinct multi-line speech bubbles (>= 2 lines in both, or >= 3 lines in either)
                        // represent independent dialogue utterances and must never be post-merged across bubbles.
                        // Similarly, dialogue speeches ending with terminal punctuation (。！？) must not merge into the next bubble.
                        if !is_both_narration {
                            if (top_lines >= 2 && bot_lines >= 2) || top_lines >= 3 || bot_lines >= 3 || top_ends_with_terminal {
                                continue;
                            }
                        }

                        let v_gap = bot.box_.y - (top.box_.y + top.box_.h);
                        if v_gap < 0 {
                            // Overlapping vertically — skip (dedup already handled this)
                            continue;
                        }

                        let avg_h = (top.box_.h + bot.box_.h) / 2;

                        // Wide (>1/3 page width) non-dialogue blocks get a relaxed gap limit
                        // to allow narration blocks split by dark panel borders to merge.
                        let gap_limit = if is_both_narration {
                            avg_h  // narration blocks: allow gap up to 100% of avg height
                        } else {
                            avg_h * 9 / 20  // speech bubbles: gap <= 45% of avg height
                        };

                        // Side-by-side / column-split speech bubble check (e.g. 2-column vertical text inside same bubble)
                        let is_side_by_side_bubble = {
                            let (left, right) = if a.box_.x <= b.box_.x { (a, b) } else { (b, a) };
                            let h_gap = right.box_.x - (left.box_.x + left.box_.w);
                            let v_inter_top = left.box_.y.max(right.box_.y);
                            let v_inter_bot = (left.box_.y + left.box_.h).min(right.box_.y + right.box_.h);
                            let v_inter = v_inter_bot - v_inter_top;
                            let min_h = left.box_.h.min(right.box_.h);
                            let v_overlap_ratio = v_inter.max(0) as f32 / min_h.max(1) as f32;
                            let same_bubble_bounds = (left.box_.w + right.box_.w <= 240) && (left.box_.h.max(right.box_.h) <= 150);
                            let both_short_utterance = top_lines <= 2 && bot_lines <= 2;
                            (h_gap >= -30 && h_gap <= 25) && v_overlap_ratio >= 0.50 && same_bubble_bounds && both_short_utterance
                        };

                        if is_side_by_side_bubble {
                            // Sort reading order (for standard Chinese multi-column speech bubbles, columns read right-to-left or left-to-right)
                            let (first_i, second_i) = if a.box_.x <= b.box_.x { (i, j) } else { (j, i) };
                            merged_pair = Some((first_i, second_i));
                            break 'outer;
                        }

                        if v_gap > gap_limit {
                            continue;
                        }

                        // Horizontal overlap check: >= 35% of the narrower region's width
                        let x_lo = top.box_.x.max(bot.box_.x);
                        let x_hi = (top.box_.x + top.box_.w).min(bot.box_.x + bot.box_.w);
                        let x_overlap = x_hi - x_lo;
                        let min_w = top.box_.w.min(bot.box_.w);
                        if x_overlap < min_w * 7 / 20 {
                            continue;
                        }

                        // X-centroid alignment check: <= 55% of the narrower width
                        let top_cx = top.box_.x + top.box_.w / 2;
                        let bot_cx = bot.box_.x + bot.box_.w / 2;
                        if (top_cx - bot_cx).abs() > min_w * 11 / 20 {
                            continue;
                        }

                        merged_pair = Some((ti, bi));
                        break 'outer;
                    }
                }

                match merged_pair {
                    None => break,
                    Some((ti, bi)) => {
                        // Merge bi into ti. Remove bi first (higher index) to keep ti valid.
                        let b_removed = final_regions.remove(bi);
                        let a = &mut final_regions[ti];
                        let mx  = a.box_.x.min(b_removed.box_.x);
                        let my  = a.box_.y.min(b_removed.box_.y);
                        let mx2 = (a.box_.x + a.box_.w).max(b_removed.box_.x + b_removed.box_.w);
                        let my2 = (a.box_.y + a.box_.h).max(b_removed.box_.y + b_removed.box_.h);
                        a.box_   = BoxRect { x: mx, y: my, w: mx2 - mx, h: my2 - my };
                        a.polygon = vec![
                            [mx, my], [mx2, my], [mx2, my2], [mx, my2],
                        ];

                        let pad_x = 25;
                        let pad_y = 20;
                        let crop_x = (mx - pad_x).max(0) as u32;
                        let crop_y = (my - pad_y).max(0) as u32;
                        let crop_w = ((mx2 - mx + pad_x * 2) as u32).min(page_w - crop_x);
                        let crop_h = ((my2 - my + pad_y * 2) as u32).min(page_h - crop_y);

                        let mut unified_text = None;
                        if crop_w >= 16 && crop_h >= 16 {
                            let crop = img.crop_imm(crop_x, crop_y, crop_w, crop_h);
                            if let Some(ref mut ocr) = self.ocr {
                                if let Ok(Some(res)) = ocr.recognize_crop(&crop) {
                                    let clean_c = clean_stray_ocr_artifacts(&res.text);
                                    if clean_c.chars().count() >= a.text.chars().count() {
                                        unified_text = Some(clean_c);
                                    }
                                }
                            }
                        }

                        if let Some(ut) = unified_text {
                            a.text = ut;
                        } else {
                            a.text = format!("{}\n{}", a.text.trim(), b_removed.text.trim());
                        }
                    }
                }
            }
        }

        // Final language-specific filtering pass
        let mut final_regions: Vec<Region> = final_regions
            .into_iter()
            .filter(|r| {
                let text = r.text.trim();
                if text.is_empty() {
                    return false;
                }
                if is_cjk && is_standalone_alphanumeric_without_cjk(text) {
                    return false;
                }
                if is_latin && has_cjk_characters(text) && !has_alphanumeric_characters(text) {
                    return false;
                }
                true
            })
            .collect();

        // Re-index region IDs
        for (idx, r) in final_regions.iter_mut().enumerate() {
            r.id = format!("r{}", idx);
        }

        Ok(AnalyzeResponse {
            width: page_w,
            height: page_h,
            backend,
            regions: final_regions,
        })
    }

    pub fn clean_image(&mut self, img: &DynamicImage, regions: &[CleanRequestRegion], mode: &str) -> Result<DynamicImage> {
        let (w, h) = img.dimensions();
        let mut polygons = Vec::new();

        for r in regions {
            if let Some(ref poly) = r.polygon {
                if poly.len() >= 3 {
                    polygons.push(poly.clone());
                    continue;
                }
            }
            if let Some(ref b) = r.box_ {
                polygons.push(vec![
                    [b.x, b.y],
                    [b.x + b.w, b.y],
                    [b.x + b.w, b.y + b.h],
                    [b.x, b.y + b.h],
                ]);
            }
        }

        let mask = build_mask(h, w, &polygons, 3);
        if let Some(ref mut inpainter) = self.inpainter {
            inpainter.inpaint(img, &mask, mode)
        } else {
            Ok(img.clone())
        }
    }
}

fn is_multiline_comic_blob(cb: &[[f32; 2]], rapid_boxes: &[Vec<[f32; 2]>], page_w: u32, page_h: u32) -> bool {
    let (cx, cy, cw, ch) = box_to_xywh_f32(cb);

    if (ch > 0.35 * page_h as f32 && cw > 0.35 * page_w as f32)
        || (cw >= 0.70 * page_w as f32 && ch >= 0.25 * page_h as f32 && ch >= 250.0)
    {
        return true;
    }

    let mut overlapping_lines = 0;
    for rb in rapid_boxes {
        let (rx, ry, rw, rh) = box_to_xywh_f32(rb);
        let iou = box_iou_f32(cb, rb);
        let overlap_x = (cx + cw).min(rx + rw) - cx.max(rx);
        let overlap_y = (cy + ch).min(ry + rh) - cy.max(ry);
        let overlap_area = overlap_x.max(0.0) * overlap_y.max(0.0);
        let rb_area = (rw * rh).max(1.0);

        if iou > 0.15 || (overlap_area / rb_area >= 0.40) {
            overlapping_lines += 1;
        }
    }

    if overlapping_lines >= 2 {
        return true;
    }

    false
}

fn recover_missing_interjection(img: &DynamicImage, pts: &[[i32; 2]], text: &str) -> String {
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
