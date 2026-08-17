use std::path::Path;
use anyhow::{Context, Result};
use image::{DynamicImage, GenericImageView, ImageBuffer, Rgb};
use ort::{session::Session, value::Tensor};

use serde::{Deserialize, Serialize};
use super::detect::{CHINESE_RE, PUNCT_ONLY};
use super::geometry::{
    box_iou_pts,
};

pub struct RapidOcr {
    det_session: Option<Session>,
    rec_session: Session,
    characters: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrLine {
    pub polygon: Vec<[i32; 2]>,
    pub text: String,
    pub score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrResult {
    pub text: String,
    pub score: f32,
    pub lines: Vec<(Vec<[i32; 2]>, String, f32)>,
}

impl RapidOcr {
    pub fn new<P: AsRef<Path>, D: AsRef<Path>>(
        det_path: Option<P>,
        rec_path: P,
        dict_path: D,
    ) -> Result<Self> {
        let rec_bytes = std::fs::read(rec_path.as_ref())
            .context("Failed to read PP-OCR recognition model")?;
        let det_bytes = if let Some(dp) = det_path {
            if dp.as_ref().exists() {
                Some(std::fs::read(dp.as_ref()).context("Failed to read PP-OCR detection model")?)
            } else {
                None
            }
        } else {
            None
        };
        let dict_str = std::fs::read_to_string(dict_path.as_ref())
            .context("Failed to read vocabulary dictionary")?;

        Self::from_bytes(det_bytes.as_deref(), &rec_bytes, &dict_str)
    }

    pub fn from_bytes(
        det_bytes: Option<&[u8]>,
        rec_bytes: &[u8],
        dict_str: &str,
    ) -> Result<Self> {
        let rec_session = Session::builder()
            .map_err(|e| anyhow::anyhow!("Rec session builder error: {}", e))?
            .with_intra_threads(num_cpus::get().min(8))
            .map_err(|e| anyhow::anyhow!("Rec session intra threads error: {}", e))?
            .commit_from_memory(rec_bytes)
            .map_err(|e| anyhow::anyhow!("Commit rec from memory error: {}", e))?;

        let det_session = if let Some(db) = det_bytes {
            let ds = Session::builder()
                .map_err(|e| anyhow::anyhow!("Det session builder error: {}", e))?
                .with_intra_threads(num_cpus::get().min(8))
                .map_err(|e| anyhow::anyhow!("Det session intra threads error: {}", e))?
                .commit_from_memory(db)
                .map_err(|e| anyhow::anyhow!("Commit det from memory error: {}", e))?;
            Some(ds)
        } else {
            None
        };

        let characters: Vec<String> = if let Ok(json_chars) = serde_json::from_str::<Vec<String>>(dict_str) {
            json_chars
        } else {
            let mut list = vec!["blank".to_string()];
            for line in dict_str.lines() {
                list.push(line.to_string());
            }
            list.push(" ".to_string());
            list
        };

        Ok(Self {
            det_session,
            rec_session,
            characters,
        })
    }

    /// Direct text recognition on a line crop
    pub fn recognize_line(&mut self, crop: &DynamicImage) -> Result<Option<OcrResult>> {
        let (w, h) = crop.dimensions();
        if w < 4 || h < 4 {
            return Ok(None);
        }

        // If vertical crop (h >= 1.3 * w), try rotated 270 (top-to-bottom -> left-to-right)
        if h as f32 >= 1.3 * w as f32 {
            let rot = crop.rotate270();
            if let Ok(Some(rot_res)) = self.recognize_line_horizontal(&rot) {
                if CHINESE_RE.is_match(&rot_res.text) || rot_res.score >= 0.70 {
                    return Ok(Some(rot_res));
                }
            }
        }

        self.recognize_line_horizontal(crop)
    }

    fn recognize_line_horizontal(&mut self, crop: &DynamicImage) -> Result<Option<OcrResult>> {
        let (w, h) = crop.dimensions();
        if w < 4 || h < 4 {
            return Ok(None);
        }

        let target_h = 48_u32;
        let r = target_h as f32 / h as f32;
        let max_w = ((w as f32 * r).round() as u32).max(16);
        let target_w = max_w.max(320);

        let resized = image::imageops::resize(
            crop,
            max_w,
            target_h,
            image::imageops::FilterType::Triangle,
        );

        let mut tensor_vec = vec![0.0_f32; 1 * 3 * target_h as usize * target_w as usize];
        let stride_c = target_h as usize * target_w as usize;
        let stride_y = target_w as usize;

        // PP-OCR normalization in BGR format: (pixel / 255.0 - 0.5) / 0.5
        for y in 0..target_h as usize {
            for x in 0..max_w as usize {
                let p = resized.get_pixel(x as u32, y as u32);
                let r_norm = (p[0] as f32 / 255.0 - 0.5) / 0.5;
                let g_norm = (p[1] as f32 / 255.0 - 0.5) / 0.5;
                let b_norm = (p[2] as f32 / 255.0 - 0.5) / 0.5;

                tensor_vec[0 * stride_c + y * stride_y + x] = b_norm;
                tensor_vec[1 * stride_c + y * stride_y + x] = g_norm;
                tensor_vec[2 * stride_c + y * stride_y + x] = r_norm;
            }
        }

        let input_tensor = Tensor::from_array(([1, 3, target_h as usize, target_w as usize], tensor_vec))
            .map_err(|e| anyhow::anyhow!("Tensor create error: {}", e))?;

        let outputs = self.rec_session.run(ort::inputs![input_tensor])
            .map_err(|e| anyhow::anyhow!("Session run error: {}", e))?;

        let (out_shape, out_slice) = outputs[0].try_extract_tensor::<f32>()
            .map_err(|e| anyhow::anyhow!("Extract rec output error: {}", e))?;

        let dims: Vec<usize> = out_shape.iter().map(|&d| d as usize).collect();
        if dims.len() < 3 {
            return Ok(None);
        }

        let time_steps = dims[1];
        let num_classes = dims[2];

        // CTC greedy argmax decoding
        let mut text = String::new();
        let mut prev_idx = 0_usize;
        let mut total_prob = 0.0_f32;
        let mut token_count = 0_usize;

        for t in 0..time_steps {
            let offset = t * num_classes;
            let mut max_idx = 0;
            let mut max_val = out_slice[offset];

            for c in 1..num_classes {
                let v = out_slice[offset + c];
                if v > max_val {
                    max_val = v;
                    max_idx = c;
                }
            }

            if max_idx != 0 && max_idx != prev_idx {
                if max_idx < self.characters.len() {
                    let ch = &self.characters[max_idx];
                    if ch != "blank" {
                        text.push_str(ch);
                        let prob = (1.0 / (1.0 + (-max_val.max(-20.0).min(20.0)).exp())).clamp(0.0, 1.0);
                        total_prob += prob;
                        token_count += 1;
                    }
                }
            }
            prev_idx = max_idx;
        }

        let avg_confidence = if token_count > 0 {
            total_prob / token_count as f32
        } else {
            0.0
        };

        let trimmed = text.trim().to_string();
        if trimmed.is_empty() {
            Ok(None)
        } else {
            Ok(Some(OcrResult {
                text: trimmed,
                score: avg_confidence,
                lines: Vec::new(),
            }))
        }
    }

    /// OCR on a crop with 32px padding, multi-line reading-order sorting, and substring deduplication.
    pub fn recognize_crop(&mut self, crop: &DynamicImage) -> Result<Option<OcrResult>> {
        let (w, h) = crop.dimensions();
        if w < 8 || h < 8 {
            return Ok(None);
        }

        // Padded image with 32px boundary
        let target_h = 32_u32.max(((h + 31) / 32) * 32);
        let target_w = 32_u32.max(((w + 31) / 32) * 32);
        let dh = target_h - h;
        let dw = target_w - w;
        let pad_top = dh / 2;
        let pad_left = dw / 2;

        let mut padded = ImageBuffer::from_pixel(target_w, target_h, Rgb([255_u8, 255, 255]));
        for y in 0..h {
            for x in 0..w {
                let p = crop.get_pixel(x, y);
                padded.put_pixel(pad_left + x, pad_top + y, Rgb([p[0], p[1], p[2]]));
            }
        }

        let mut raw_lines = self.detect_and_recognize(&DynamicImage::ImageRgb8(padded))?;
        if raw_lines.is_empty() {
            raw_lines = self.detect_and_recognize(crop)?;
        }

        if raw_lines.is_empty() {
            // Strict regex-gated fallback for compact single-glyph punctuation crops
            if w <= 60 || h <= 60 || (h >= 2 * w && w <= 80) {
                if let Ok(Some(line_res)) = self.recognize_line(crop) {
                    if PUNCT_ONLY.is_match(&line_res.text) {
                        let poly = vec![
                            [0, 0],
                            [w as i32, 0],
                            [w as i32, h as i32],
                            [0, h as i32],
                        ];
                        return Ok(Some(OcrResult {
                            text: line_res.text.clone(),
                            score: line_res.score,
                            lines: vec![(poly, line_res.text, line_res.score)],
                        }));
                    }
                }
            }
            return Ok(None);
        }

        // Detect if crop lines are predominantly vertical
        let vertical_count = raw_lines.iter().filter(|l| {
            let (_, _, w, h) = super::geometry::polygon_bounds(&l.polygon);
            h > (w as f32 * 1.2) as i32
        }).count();
        let is_vertical_crop = vertical_count * 2 >= raw_lines.len() && !raw_lines.is_empty();

        if is_vertical_crop {
            // Right-to-left column reading order for vertical text
            raw_lines.sort_by(|a, b| {
                let (ax, ay, aw, _) = super::geometry::polygon_bounds(&a.polygon);
                let (bx, by, bw, _) = super::geometry::polygon_bounds(&b.polygon);
                let a_right = ax + aw;
                let b_right = bx + bw;
                let x_close = (a_right - b_right).abs() <= 10;
                if x_close {
                    ay.cmp(&by)
                } else {
                    b_right.cmp(&a_right)
                }
            });
        } else {
            // Top-to-bottom, left-to-right reading order for horizontal text
            raw_lines.sort_by(|a, b| {
                let ya = a.polygon[0][1];
                let yb = b.polygon[0][1];
                ya.cmp(&yb).then(a.polygon[0][0].cmp(&b.polygon[0][0]))
            });
        }

        // Substring & duplicate deduplication
        let mut dedup_lines: Vec<OcrLine> = Vec::new();
        for line in raw_lines {
            let mut duplicate = false;
            for existing in &dedup_lines {
                let iou = box_iou_pts(&line.polygon, &existing.polygon);
                let same_text = line.text == existing.text || line.text.contains(&existing.text) || existing.text.contains(&line.text);
                if (same_text && iou >= 0.25) || iou >= 0.65 {
                    duplicate = true;
                    break;
                }
            }
            if !duplicate {
                dedup_lines.push(line);
            }
        }

        if dedup_lines.is_empty() {
            return Ok(None);
        }

        let text_lines: Vec<String> = dedup_lines.iter().map(|l| l.text.clone()).collect();
        let max_score = dedup_lines.iter().map(|l| l.score).fold(0.0_f32, f32::max);
        let out_lines: Vec<(Vec<[i32; 2]>, String, f32)> = dedup_lines
            .into_iter()
            .map(|l| {
                let shifted_poly: Vec<[i32; 2]> = l
                    .polygon
                    .into_iter()
                    .map(|p| [p[0] - pad_left as i32, p[1] - pad_top as i32])
                    .collect();
                (shifted_poly, l.text, l.score)
            })
            .collect();

        Ok(Some(OcrResult {
            text: text_lines.join("\n"),
            score: max_score,
            lines: out_lines,
        }))
    }

    /// Full-page or sub-image DBNet text line detection and recognition with optional sliding tile passes.
    pub fn detect_and_recognize(&mut self, img: &DynamicImage) -> Result<Vec<OcrLine>> {
        self.detect_and_recognize_tiled(img, true)
    }

    pub fn detect_and_recognize_tiled(&mut self, img: &DynamicImage, tiled: bool) -> Result<Vec<OcrLine>> {
        let (w, h) = img.dimensions();
        if w < 16 || h < 16 {
            return Ok(Vec::new());
        }

        let mut lines = Vec::new();
        let detected_boxes = if let Some(ref mut det) = self.det_session {
            let max_side = w.max(h);
            let limit_side = if max_side < 960 { 960 } else if max_side < 1500 { 1500 } else { 2000 };
            let ratio = limit_side as f32 / max_side as f32;
            let resize_w = (((w as f32 * ratio).round() as u32 / 32) * 32).max(32);
            let resize_h = (((h as f32 * ratio).round() as u32 / 32) * 32).max(32);

            let resized = image::imageops::resize(
                img,
                resize_w,
                resize_h,
                image::imageops::FilterType::Triangle,
            );

            let mut det_vec = vec![0.0_f32; 1 * 3 * resize_h as usize * resize_w as usize];
            let stride_c = resize_h as usize * resize_w as usize;
            let stride_y = resize_w as usize;

            // PP-OCR Det normalization in RGB format: (RGB / 255.0 - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
            for y in 0..resize_h as usize {
                for x in 0..resize_w as usize {
                    let p = resized.get_pixel(x as u32, y as u32);
                    let r = (p[0] as f32 / 255.0 - 0.485) / 0.229;
                    let g = (p[1] as f32 / 255.0 - 0.456) / 0.224;
                    let b = (p[2] as f32 / 255.0 - 0.406) / 0.225;

                    det_vec[0 * stride_c + y * stride_y + x] = r;
                    det_vec[1 * stride_c + y * stride_y + x] = g;
                    det_vec[2 * stride_c + y * stride_y + x] = b;
                }
            }

            let det_tensor = Tensor::from_array(([1, 3, resize_h as usize, resize_w as usize], det_vec))
                .map_err(|e| anyhow::anyhow!("Det tensor create error: {}", e))?;

            let det_out = det.run(ort::inputs![det_tensor])
                .map_err(|e| anyhow::anyhow!("Det run error: {}", e))?;

            let (_out_shape, out_slice) = det_out[0].try_extract_tensor::<f32>()
                .map_err(|e| anyhow::anyhow!("Extract det error: {}", e))?;

            let mut det_lines_map = vec![0.0_f32; resize_w as usize * resize_h as usize];
            for i in 0..det_lines_map.len() {
                det_lines_map[i] = out_slice[i];
            }

            let (boxes, _) = super::detect::lines_map_to_boxes(
                &det_lines_map,
                resize_w as usize,
                resize_h as usize,
                w as usize,
                h as usize,
                0.3,
                0.5,
                1.6,
                1000,
                3,
            );

            boxes
        } else {
            Vec::new()
        };

        for poly in detected_boxes {
            let (x0, y0, bw, bh) = super::geometry::polygon_bounds(&poly);
            if bw >= 4 && bh >= 4 && x0 < w as i32 && y0 < h as i32 {
                let crop_x = x0.max(0) as u32;
                let crop_y = y0.max(0) as u32;
                let crop_w = (bw as u32).min(w - crop_x);
                let crop_h = (bh as u32).min(h - crop_y);

                if crop_w >= 4 && crop_h >= 4 {
                    let crop = img.crop_imm(crop_x, crop_y, crop_w, crop_h);
                    if let Ok(Some(line_res)) = self.recognize_line(&crop) {
                        if !line_res.text.is_empty() {
                            lines.push(OcrLine {
                                polygon: poly,
                                text: line_res.text,
                                score: line_res.score,
                            });
                        }
                    }
                }
            }
        }

        // Tiled recognition passes on manhwa pages (h >= 600)
        if tiled && h >= 600 {
            let slice_h = 500_u32;
            let step_y = 300_u32;
            let mut y = 0_u32;

            while y < h {
                let y_end = (y + slice_h).min(h);
                let cur_slice_h = y_end - y;

                if cur_slice_h >= 32 {
                    let tile_crop = img.crop_imm(0, y, w, cur_slice_h);
                    if let Ok(tile_lines) = self.detect_and_recognize_tiled(&tile_crop, false) {
                        for mut tl in tile_lines {
                            for p in &mut tl.polygon {
                                p[1] += y as i32;
                            }
                            let has_cn = CHINESE_RE.is_match(&tl.text);
                            let min_score = if has_cn { 0.50 } else { 0.70 };

                            if tl.text.trim().is_empty() || tl.score < min_score {
                                continue;
                            }

                            let mut matched_idx = None;
                            for (idx, existing) in lines.iter().enumerate() {
                                let iou = box_iou_pts(&tl.polygon, &existing.polygon);
                                if iou >= 0.30 {
                                    matched_idx = Some(idx);
                                    break;
                                }
                            }

                            match matched_idx {
                                None => lines.push(tl),
                                Some(idx) => {
                                    let existing = &lines[idx];
                                    let has_cn_old = CHINESE_RE.is_match(&existing.text);
                                    if (has_cn && !has_cn_old) || (tl.score > existing.score + 0.05) || (has_cn && tl.score >= 0.70 && existing.score < 0.70) {
                                        lines[idx] = tl;
                                    }
                                }
                            }
                        }
                    }
                }

                if y_end >= h {
                    break;
                }
                y += step_y;
            }
        }

        // Sort lines top-to-bottom, left-to-right
        lines.sort_by(|a, b| {
            let ya = a.polygon[0][1];
            let yb = b.polygon[0][1];
            let xa = a.polygon[0][0];
            let xb = b.polygon[0][0];
            ya.cmp(&yb).then(xa.cmp(&xb))
        });

        Ok(lines)
    }

    /// Crop an ROI with small margin
    pub fn crop_region(img: &DynamicImage, polygon: &[[i32; 2]], margin: i32) -> DynamicImage {
        let (w, h) = img.dimensions();
        let (min_x, min_y, bw, bh) = super::geometry::polygon_bounds(polygon);

        let x0 = (min_x - margin).clamp(0, w as i32 - 1) as u32;
        let y0 = (min_y - margin).clamp(0, h as i32 - 1) as u32;
        let x1 = ((min_x + bw + margin) as u32).min(w);
        let y1 = ((min_y + bh + margin) as u32).min(h);

        let crop_w = (x1 - x0).max(1);
        let crop_h = (y1 - y0).max(1);

        img.crop_imm(x0, y0, crop_w, crop_h)
    }
}
