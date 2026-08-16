use std::path::Path;
use anyhow::Result;
use image::{DynamicImage, GenericImageView};
use regex::Regex;

use crate::ml::detect::{
    clean_stray_ocr_artifacts, deduplicate_boxes, group_paragraphs, is_pure_watermark_region,
    is_watermark_line, merge_text_lines, sort_regions_top_to_bottom, CHINESE_RE,
    ComicTextDetector, PUNCT_ONLY,
};
use crate::ml::geometry::{
    box_iou_f32, box_iou_pts, box_to_xywh_f32, calculate_box_angle_i32,
    line_center_inside_box, polygon_bounds,
};
use crate::ml::inpaint::{build_mask, LamaInpainter};
use crate::ml::ocr::{OcrLine, RapidOcr};
use crate::ml::schemas::{AnalyzeResponse, BoxRect, CleanRequestRegion, Region};
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
        let ocr = if dir.join("PP-OCRv6_rec_small.onnx").exists() {
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
                RapidOcr::from_bytes(
                    Some(crate::ml::embedded_models::PPOCR_DET_BYTES),
                    crate::ml::embedded_models::PPOCR_REC_BYTES,
                    crate::ml::embedded_models::RAPIDOCR_KEYS,
                ).ok()
            }
            #[cfg(not(feature = "embed-models"))]
            {
                None
            }
        };

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
        let (page_w, page_h) = img.dimensions();

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
            if let Ok(rl) = ocr.detect_and_recognize_tiled(img, true) {
                rapid_lines = rl;
            }
        }

        // 3. Fallback: RapidOCR isolated recognition for ComicTextDetector boxes
        if let Some(ref mut ocr) = self.ocr {
            let (w, h) = img.dimensions();
            let mut ocr_det_matched = vec![false; comic_boxes.len()];

            for (idx, cb) in comic_boxes.iter().enumerate() {
                for rl in &rapid_lines {
                    if box_iou_pts(cb, &rl.polygon) >= 0.30 {
                        ocr_det_matched[idx] = true;
                        break;
                    }
                }
            }

            for (idx, cb) in comic_boxes.iter().enumerate() {
                if !ocr_det_matched[idx] {
                    let (bx, by, bw, bh) = polygon_bounds(cb);
                    if bw >= 4 && bh >= 4 && bx < w as i32 && by < h as i32 {
                        let crop_x = bx.max(0) as u32;
                        let crop_y = by.max(0) as u32;
                        let crop_w = (bw as u32).min(w - crop_x);
                        let crop_h = (bh as u32).min(h - crop_y);

                        if crop_w >= 4 && crop_h >= 4 {
                            let crop = img.crop_imm(crop_x, crop_y, crop_w, crop_h);
                            if let Ok(Some(line_res)) = ocr.recognize_line(&crop) {
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

        // 4. Chromatic Watermark Recovery on Raw Image
        let color_wm_mask = self.watermark.create_bubble_watermark_mask(img, 210, 20, 35, 15);
        let mut has_color_wm = false;
        let mut wm_pix_count = 0;
        for p in color_wm_mask.pixels() {
            if p[0] > 0 {
                has_color_wm = true;
                wm_pix_count += 1;
            }
        }

        if has_color_wm && wm_pix_count > 50 {
            let clean_wm_img = self.watermark.inpaint_colliding_watermarks(img, &color_wm_mask);
            if let Some(ref mut ocr) = self.ocr {
                if let Ok(clean_lines) = ocr.detect_and_recognize_tiled(&clean_wm_img, false) {
                    for cl in clean_lines {
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
                                rapid_lines.push(cl);
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

            let is_giant_artwork = is_single_latin
                || is_border_margin_char
                || is_giant_single_char_artwork
                || is_isolated_dash_noise
                || is_low_conf_isolated_char
                || is_circle_noise
                || is_giant_chinese_hallucination
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

        for (i, &idx) in order.iter().enumerate() {
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

            let (text, confidence, mut poly): (String, f32, Vec<[i32; 2]>) = if !matched.is_empty() {
                let mut sorted_matched = matched.clone();
                sorted_matched.sort_by(|a, b| {
                    let (ax, ay, _, ah) = polygon_bounds(&a.polygon);
                    let (bx, by, _, bh) = polygon_bounds(&b.polygon);
                    let a_mid_y = ay + ah / 2;
                    let b_mid_y = by + bh / 2;
                    if (a_mid_y - b_mid_y).abs() <= 15 {
                        ax.cmp(&bx)
                    } else {
                        ay.cmp(&by)
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

                    match last_mid_y {
                        Some(prev_y) if (mid_y - prev_y).abs() <= 15 => {
                            if let Some(last_row) = row_grouped_texts.last_mut() {
                                let merged = if *last_row == clean_t {
                                    last_row.clone()
                                } else {
                                    format!("{}{}", last_row.trim_end(), clean_t.trim_start())
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
                let poly_pts: Vec<[i32; 2]> = vec![
                    [box_rect.x, box_rect.y],
                    [box_rect.x + box_rect.w, box_rect.y],
                    [box_rect.x + box_rect.w, box_rect.y + box_rect.h],
                    [box_rect.x, box_rect.y + box_rect.h],
                ];
                (row_grouped_texts.join("\n"), avg_score, poly_pts)
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
                        }
                    }
                }
                let poly_pts: Vec<[i32; 2]> = vec![
                    [box_rect.x, box_rect.y],
                    [box_rect.x + box_rect.w, box_rect.y],
                    [box_rect.x + box_rect.w, box_rect.y + box_rect.h],
                    [box_rect.x, box_rect.y + box_rect.h],
                ];
                (crop_text, crop_score, poly_pts)
            };

            let cleaned = clean_stray_ocr_artifacts(&text);
            if cleaned.trim().is_empty() || is_pure_watermark_region(&cleaned) {
                continue;
            }

            let angle = calculate_box_angle_i32(&poly);
            let vertical = box_rect.h > (box_rect.w as f32 * 1.2) as i32;

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
                    poly = vec![
                        [box_rect.x, box_rect.y],
                        [box_rect.x + box_rect.w, box_rect.y],
                        [box_rect.x + box_rect.w, box_rect.y + box_rect.h],
                        [box_rect.x, box_rect.y + box_rect.h],
                    ];
                }
            }

            // Expand horizontal speech bubble lines ending in ellipsis to ensure complete dot coverage for inpainting
            let extends_ellipsis = cleaned.ends_with("……") || cleaned.ends_with('…');
            if extends_ellipsis && !vertical {
                let right_limit = (box_rect.x + box_rect.w) as u32;
                let max_scan_x = (right_limit + 40).min(page_w);
                let y_start = (box_rect.y.max(0) as u32).min(page_h - 1);
                let y_end = ((box_rect.y + box_rect.h).max(0) as u32).min(page_h);

                let rgb = img.to_rgb8();
                let mut last_dot_x = right_limit;

                for curr_x in right_limit..max_scan_x {
                    let mut has_dark = false;
                    for curr_y in y_start..y_end {
                        let p = rgb.get_pixel(curr_x, curr_y);
                        let b = (p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000;
                        if b < 120 {
                            has_dark = true;
                            break;
                        }
                    }
                    if has_dark {
                        last_dot_x = curr_x + 8;
                    } else if curr_x > last_dot_x + 8 {
                        break;
                    }
                }

                if last_dot_x > right_limit {
                    box_rect.w = (last_dot_x - box_rect.x as u32).min(page_w - box_rect.x as u32) as i32;
                    poly = vec![
                        [box_rect.x, box_rect.y],
                        [box_rect.x + box_rect.w, box_rect.y],
                        [box_rect.x + box_rect.w, box_rect.y + box_rect.h],
                        [box_rect.x, box_rect.y + box_rect.h],
                    ];
                }
            }

            regions.push(Region {
                id: format!("r{}", i),
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
    let (_, _, cw, ch) = box_to_xywh_f32(cb);
    if ch > 2.0 * cw {
        return false;
    }

    if (ch > 0.35 * page_h as f32 && cw > 0.35 * page_w as f32)
        || (cw >= 0.70 * page_w as f32 && ch >= 0.25 * page_h as f32 && ch >= 250.0)
    {
        return true;
    }

    let mut overlapping = Vec::new();
    for rb in rapid_boxes {
        let iou = box_iou_f32(cb, rb);
        if iou > 0.15 {
            overlapping.push(rb);
        }
    }

    if overlapping.len() >= 2 && ch > 160.0 {
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
