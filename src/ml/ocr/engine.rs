use std::path::Path;
use anyhow::{Context, Result};
use image::{DynamicImage, GenericImageView, ImageBuffer, Rgb};
use ort::{session::Session, value::Tensor};
use rayon::prelude::*;

use crate::ml::detect::{lines_map_to_boxes, CHINESE_RE, PUNCT_ONLY};
use crate::ml::geometry::{box_iou_pts, polygon_bounds};
use super::decode::{decode_ctc_slice, parse_dict_string, OcrLine, OcrResult};
use super::slicing::{horizontal_paragraph_to_line_strips, vertical_to_upright_horizontal_strip};

// SINGLE CONTINUOUS DET TARGET FOR THE LONG IMAGE SIDE OF A FULL PAGE. EVERY FULL PAGE
// IS SCALED TO EXACTLY THIS LONG SIDE SO THE EFFECTIVE TEXT SCALE IS IDENTICAL ACROSS
// SOURCE RESOLUTIONS. THE FORMER THREE-TIER LADDER (960/1500/2000) JUMPED THE EFFECTIVE
// SCALE BY UP TO 33% AT THE 960 AND 1500 PX BOUNDARIES, MAKING BORDERLINE LINE SPLITS
// (E.G. TWO-LOBE DOUBLE BUBBLES) FLIP WITH INPUT SIZE.
const OCR_DET_LIMIT_SIDE: f32 = 2000.0;

/// HISTORICAL TIER LADDER APPLIED TO THE ASSET'S OWN LONG SIDE. TILE SLICES AND CONTENT-
/// TIGHT CROPS KEEP THIS PER-ASSET SCALING: THEY ARE SMALL CROPS WHOSE ORIGINAL TUNED
/// BEHAVIOUR IS ALREADY SCALE-STABLE, AND RE-TARGETING THEM TO THE FULL-PAGE LIMIT WOULD
/// OVER-MAGNIFY SMALL PAGES AND HALLUCINATE FRAGMENT GLYPHS.
fn ocr_sub_image_det_limit(max_side: u32) -> f32 {
    if max_side < 960 {
        960.0
    } else if max_side < 1500 {
        1500.0
    } else {
        2000.0
    }
}

pub struct RapidOcr {
    det_session: Option<Session>,
    rec_session: Session,
    characters: Vec<String>,
    korean_rec_session: Option<Session>,
    characters_korean: Option<Vec<String>>,
    // LAZY REGISTRATION PAYLOAD: BYTES + DICT HELD UNTIL FIRST KOREAN/CYRILLIC/THAI
    // USE, SO A ZH/JA/EN WORKLOAD NEVER PAYS FOR THESE SESSIONS' RSS.
    korean_pending: Option<(Vec<u8>, String)>,
    cyrillic_rec_session: Option<Session>,
    characters_cyrillic: Option<Vec<String>>,
    cyrillic_pending: Option<(Vec<u8>, String)>,
    thai_rec_session: Option<Session>,
    characters_thai: Option<Vec<String>>,
    thai_pending: Option<(Vec<u8>, String)>,
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
        let rec_session = crate::ml::device::create_session_from_memory(rec_bytes, "rapid_ocr_rec")?;
        let det_session = if let Some(db) = det_bytes {
            Some(crate::ml::device::create_session_from_memory(db, "rapid_ocr_det")?)
        } else {
            None
        };

        let characters = parse_dict_string(dict_str);

        Ok(Self {
            det_session,
            rec_session,
            characters,
            korean_rec_session: None,
            characters_korean: None,
            korean_pending: None,
            cyrillic_rec_session: None,
            characters_cyrillic: None,
            cyrillic_pending: None,
            thai_rec_session: None,
            characters_thai: None,
            thai_pending: None,
        })
    }

    pub fn load_korean_from_bytes(&mut self, bytes: &[u8], dict_str: &str) -> Result<()> {
        // DEFER SESSION CONSTRUCTION TO FIRST KOREAN USE (SEE ensure_korean_rec).
        self.korean_pending = Some((bytes.to_vec(), dict_str.to_string()));
        Ok(())
    }

    pub fn load_korean_model<P: AsRef<Path>, D: AsRef<Path>>(&mut self, model_path: P, dict_path: D) -> Result<()> {
        let bytes = std::fs::read(model_path.as_ref())?;
        let dict_str = std::fs::read_to_string(dict_path.as_ref())?;
        self.load_korean_from_bytes(&bytes, &dict_str)
    }

    pub fn load_cyrillic_from_bytes(&mut self, bytes: &[u8], dict_str: &str) -> Result<()> {
        // DEFER SESSION CONSTRUCTION TO FIRST CYRILLIC USE (SEE ensure_cyrillic_rec).
        self.cyrillic_pending = Some((bytes.to_vec(), dict_str.to_string()));
        Ok(())
    }

    pub fn load_cyrillic_model<P: AsRef<Path>, D: AsRef<Path>>(&mut self, model_path: P, dict_path: D) -> Result<()> {
        let bytes = std::fs::read(model_path.as_ref())?;
        let dict_str = std::fs::read_to_string(dict_path.as_ref())?;
        self.load_cyrillic_from_bytes(&bytes, &dict_str)
    }

    pub fn load_thai_from_bytes(&mut self, bytes: &[u8], dict_str: &str) -> Result<()> {
        // DEFER SESSION CONSTRUCTION TO FIRST THAI USE (SEE ensure_thai_rec).
        self.thai_pending = Some((bytes.to_vec(), dict_str.to_string()));
        Ok(())
    }

    pub fn load_thai_model<P: AsRef<Path>, D: AsRef<Path>>(&mut self, model_path: P, dict_path: D) -> Result<()> {
        let bytes = std::fs::read(model_path.as_ref())?;
        let dict_str = std::fs::read_to_string(dict_path.as_ref())?;
        self.load_thai_from_bytes(&bytes, &dict_str)
    }

    pub fn get_rec_session_and_dict(&mut self, source_lang: Option<&str>) -> (&mut Session, &[String]) {
        let lang = source_lang.unwrap_or("").trim().to_ascii_lowercase();
        if lang.starts_with("ko") || lang == "korean" {
            self.ensure_korean_rec();
            if self.korean_rec_session.is_some() && self.characters_korean.is_some() {
                return (self.korean_rec_session.as_mut().unwrap(), self.characters_korean.as_ref().unwrap());
            }
        }
        if lang.starts_with("ru") || lang.starts_with("cyrillic") || lang == "russian" {
            self.ensure_cyrillic_rec();
            if self.cyrillic_rec_session.is_some() && self.characters_cyrillic.is_some() {
                return (self.cyrillic_rec_session.as_mut().unwrap(), self.characters_cyrillic.as_ref().unwrap());
            }
        }
        if lang.starts_with("th") || lang == "thai" {
            self.ensure_thai_rec();
            if self.thai_rec_session.is_some() && self.characters_thai.is_some() {
                return (self.thai_rec_session.as_mut().unwrap(), self.characters_thai.as_ref().unwrap());
            }
        }
        (&mut self.rec_session, &self.characters)
    }

    fn ensure_korean_rec(&mut self) {
        if self.korean_rec_session.is_none() {
            if let Some((bytes, dict)) = self.korean_pending.take() {
                if let Ok(session) = crate::ml::device::create_session_from_memory(&bytes, "rapid_ocr_korean") {
                    self.korean_rec_session = Some(session);
                    self.characters_korean = Some(parse_dict_string(&dict));
                }
            }
        }
    }

    fn ensure_cyrillic_rec(&mut self) {
        if self.cyrillic_rec_session.is_none() {
            if let Some((bytes, dict)) = self.cyrillic_pending.take() {
                if let Ok(session) = crate::ml::device::create_session_from_memory(&bytes, "rapid_ocr_cyrillic") {
                    self.cyrillic_rec_session = Some(session);
                    self.characters_cyrillic = Some(parse_dict_string(&dict));
                }
            }
        }
    }

    fn ensure_thai_rec(&mut self) {
        if self.thai_rec_session.is_none() {
            if let Some((bytes, dict)) = self.thai_pending.take() {
                if let Ok(session) = crate::ml::device::create_session_from_memory(&bytes, "rapid_ocr_thai") {
                    self.thai_rec_session = Some(session);
                    self.characters_thai = Some(parse_dict_string(&dict));
                }
            }
        }
    }

    /// DIRECT TEXT RECOGNITION ON A LINE CROP
    pub fn recognize_line(&mut self, crop: &DynamicImage) -> Result<Option<OcrResult>> {
        self.recognize_line_with_lang(crop, None)
    }

    pub fn recognize_line_with_lang(&mut self, crop: &DynamicImage, source_lang: Option<&str>) -> Result<Option<OcrResult>> {
        let (w, h) = crop.dimensions();
        if w < 4 || h < 4 {
            return Ok(None);
        }

        // FOR VERTICAL CROPS (H >= 1.3 * W), TEST UPRIGHT PROJECTION SLICING FIRST (NO SIDEWAYS ROTATION DISTORTION)
        if h as f32 >= 1.3 * w as f32 {
            let mut best_res: Option<OcrResult> = None;

            // 1. UPRIGHT HORIZONTAL PROJECTION SLICING (VALLEY-CUT)
            if let Some(upright_strip) = vertical_to_upright_horizontal_strip(crop) {
                if let Ok(Some(res_upright)) = self.recognize_line_horizontal_with_lang(&upright_strip, source_lang) {
                    if CHINESE_RE.is_match(&res_upright.text) || res_upright.score >= 0.60 {
                        best_res = Some(res_upright);
                    }
                }
            }

            // 2. ROTATION FALLBACK (ROT 270)
            let rot270 = crop.rotate270();
            if let Ok(Some(res270)) = self.recognize_line_horizontal_with_lang(&rot270, source_lang) {
                let r270_chars = res270.text.chars().filter(|c| !c.is_whitespace()).count();
                let prev_chars = best_res.as_ref().map(|r| r.text.chars().filter(|c| !c.is_whitespace()).count()).unwrap_or(0);
                if (r270_chars > prev_chars && CHINESE_RE.is_match(&res270.text)) || (r270_chars == prev_chars && res270.score > best_res.as_ref().map(|r| r.score).unwrap_or(0.0)) {
                    best_res = Some(res270);
                }
            }

            // 3. ROTATION FALLBACK (ROT 90)
            let rot90 = crop.rotate90();
            if let Ok(Some(res90)) = self.recognize_line_horizontal_with_lang(&rot90, source_lang) {
                let r90_chars = res90.text.chars().filter(|c| !c.is_whitespace()).count();
                let prev_chars = best_res.as_ref().map(|r| r.text.chars().filter(|c| !c.is_whitespace()).count()).unwrap_or(0);
                if (r90_chars > prev_chars && CHINESE_RE.is_match(&res90.text)) || (r90_chars == prev_chars && res90.score > best_res.as_ref().map(|r| r.score).unwrap_or(0.0)) {
                    best_res = Some(res90);
                }
            }

            if let Some(r) = best_res {
                if CHINESE_RE.is_match(&r.text) || crate::ml::detect::has_cjk_characters(&r.text) || r.score >= 0.65 {
                    return Ok(Some(r));
                }
            }
        }

        self.recognize_line_horizontal_with_lang(crop, source_lang)
    }

    /// Batched text recognition on multiple line crops (up to batch size 16)
    pub fn recognize_lines_batched(&mut self, crops: &[DynamicImage]) -> Result<Vec<Option<OcrResult>>> {
        self.recognize_lines_batched_with_lang(crops, None)
    }

    pub fn recognize_lines_batched_with_lang(&mut self, crops: &[DynamicImage], source_lang: Option<&str>) -> Result<Vec<Option<OcrResult>>> {
        if crops.is_empty() {
            return Ok(Vec::new());
        }

        let mut results = Vec::with_capacity(crops.len());
        let chunk_size = 16_usize;

        for chunk in crops.chunks(chunk_size) {
            let batch_len = chunk.len();
            let mut processed_crops = Vec::with_capacity(batch_len);

            for c in chunk {
                let (w, h) = c.dimensions();
                if w < 4 || h < 4 {
                    processed_crops.push(None);
                    continue;
                }
                if h as f32 >= 1.3 * w as f32 {
                    if let Some(upright) = vertical_to_upright_horizontal_strip(c) {
                        processed_crops.push(Some(upright));
                    } else {
                        let rot = c.rotate270();
                        processed_crops.push(Some(rot));
                    }
                } else {
                    processed_crops.push(Some(c.clone()));
                }
            }

            let target_h = 48_usize;

            // RESIZE EVERY CROP IN PARALLEL (INDEPENDENT WORK), THEN REDUCE THE MAX
            // SCALED WIDTH ACROSS THE BATCH (FAULT D: PARALLELIZE CPU PREPROCESSING).
            let resized_list: Vec<Option<(image::RgbaImage, usize)>> = processed_crops
                .par_iter()
                .map(|opt_crop| {
                    opt_crop.as_ref().map(|c| {
                        let (w, h) = c.dimensions();
                        let r = target_h as f32 / h.max(1) as f32;
                        let scaled_w = ((w as f32 * r).round() as usize).clamp(16, 2048);
                        let resized = image::imageops::resize(
                            c,
                            scaled_w as u32,
                            target_h as u32,
                            image::imageops::FilterType::Triangle,
                        );
                        (resized, scaled_w)
                    })
                })
                .collect();

            let max_scaled_w = resized_list
                .iter()
                .filter_map(|item| item.as_ref().map(|(_, sw)| *sw))
                .max()
                .unwrap_or(320)
                .max(320);

            #[cfg(feature = "directml")]
            let target_w = max_scaled_w.div_ceil(128) * 128;
            #[cfg(not(feature = "directml"))]
            let target_w = max_scaled_w;
            let mut tensor_vec = vec![0.0_f32; batch_len * 3 * target_h * target_w];
            let item_stride = 3 * target_h * target_w;
            let stride_c = target_h * target_w;
            let stride_y = target_w;

            // FILL THE TENSOR IN PARALLEL — EACH BATCH ITEM WRITES ITS OWN DISJOINT
            // SLICE OF tensor_vec (FAULT D: PARALLELIZE CPU PREPROCESSING).
            tensor_vec
                .par_chunks_mut(item_stride)
                .enumerate()
                .for_each(|(b_idx, chunk)| {
                    if let Some((resized, scaled_w)) = resized_list[b_idx].as_ref() {
                        for y in 0..target_h {
                            for x in 0..*scaled_w {
                                let p = resized.get_pixel(x as u32, y as u32);
                                let r_norm = (p[0] as f32 / 255.0 - 0.5) / 0.5;
                                let g_norm = (p[1] as f32 / 255.0 - 0.5) / 0.5;
                                let b_norm = (p[2] as f32 / 255.0 - 0.5) / 0.5;

                                let base_idx = y * stride_y + x;
                                chunk[base_idx] = b_norm;
                                chunk[stride_c + base_idx] = g_norm;
                                chunk[2 * stride_c + base_idx] = r_norm;
                            }
                        }
                    }
                });

            let input_tensor = Tensor::from_array(([batch_len, 3, target_h, target_w], tensor_vec))
                .map_err(|e| anyhow::anyhow!("Batched tensor create error: {}", e))?;

            let (rec_session, characters) = self.get_rec_session_and_dict(source_lang);
            let outputs = rec_session.run(ort::inputs![input_tensor])
                .map_err(|e| anyhow::anyhow!("Batched rec session run error: {}", e))?;

            let (out_shape, out_slice) = outputs[0].try_extract_tensor::<f32>()
                .map_err(|e| anyhow::anyhow!("Extract batched rec output error: {}", e))?;

            let dims: Vec<usize> = out_shape.iter().map(|&d| d as usize).collect();
            if dims.len() < 3 {
                for _ in 0..batch_len {
                    results.push(None);
                }
                continue;
            }

            let time_steps = dims[1];
            let num_classes = dims[2];
            let batch_slice_stride = time_steps * num_classes;

            for b_idx in 0..batch_len {
                if resized_list[b_idx].is_none() {
                    results.push(None);
                    continue;
                }
                let slice_start = b_idx * batch_slice_stride;
                let slice_end = slice_start + batch_slice_stride;
                let item_out = &out_slice[slice_start..slice_end];
                let mut ocr_res = decode_ctc_slice(item_out, time_steps, num_classes, characters);
                if let Some(ref mut res) = ocr_res {
                    res.text = crate::ml::detect::filter_text_by_source_lang(&res.text, source_lang).trim().to_string();
                    if res.text.is_empty() {
                        ocr_res = None;
                    }
                }
                results.push(ocr_res);
            }
        }

        Ok(results)
    }

    pub fn recognize_line_horizontal(&mut self, crop: &DynamicImage) -> Result<Option<OcrResult>> {
        self.recognize_line_horizontal_with_lang(crop, None)
    }

    fn recognize_line_horizontal_with_lang(&mut self, crop: &DynamicImage, source_lang: Option<&str>) -> Result<Option<OcrResult>> {
        let (w, h) = crop.dimensions();
        if w < 4 || h < 4 {
            return Ok(None);
        }

        let target_h = 48_u32;
        let r = target_h as f32 / h as f32;
        let max_w = ((w as f32 * r).round() as u32).max(16);
        #[cfg(feature = "directml")]
        let target_w = (max_w.max(320) as usize).div_ceil(128) * 128;
        #[cfg(not(feature = "directml"))]
        let target_w = max_w.max(320) as usize;

        let resized = image::imageops::resize(
            crop,
            max_w,
            target_h,
            image::imageops::FilterType::Triangle,
        );

        let mut tensor_vec = vec![0.0_f32; 3 * target_h as usize * target_w as usize];
        let stride_c = target_h as usize * target_w as usize;
        let stride_y = target_w as usize;

        // PP-OCR normalization in BGR format: (pixel / 255.0 - 0.5) / 0.5
        for y in 0..target_h as usize {
            for x in 0..max_w as usize {
                let p = resized.get_pixel(x as u32, y as u32);
                let r_norm = (p[0] as f32 / 255.0 - 0.5) / 0.5;
                let g_norm = (p[1] as f32 / 255.0 - 0.5) / 0.5;
                let b_norm = (p[2] as f32 / 255.0 - 0.5) / 0.5;

                let base_idx = y * stride_y + x;
                tensor_vec[base_idx] = b_norm;
                tensor_vec[stride_c + base_idx] = g_norm;
                tensor_vec[2 * stride_c + base_idx] = r_norm;
            }
        }

        let input_tensor = Tensor::from_array(([1, 3, target_h as usize, target_w as usize], tensor_vec))
            .map_err(|e| anyhow::anyhow!("Tensor create error: {}", e))?;

        let (rec_session, characters) = self.get_rec_session_and_dict(source_lang);
        let res = {
            let outputs = rec_session.run(ort::inputs![input_tensor])
                .map_err(|e| anyhow::anyhow!("Session run error: {}", e))?;

            let (out_shape, out_slice) = outputs[0].try_extract_tensor::<f32>()
                .map_err(|e| anyhow::anyhow!("Extract rec output error: {}", e))?;

            let dims: Vec<usize> = out_shape.iter().map(|&d| d as usize).collect();
            if dims.len() < 3 {
                return Ok(None);
            }

            let time_steps = dims[1];
            let num_classes = dims[2];

            let mut r_opt = decode_ctc_slice(out_slice, time_steps, num_classes, characters);
            if let Some(ref mut r) = r_opt {
                r.text = crate::ml::detect::filter_text_by_source_lang(&r.text, source_lang).trim().to_string();
                if r.text.is_empty() {
                    r_opt = None;
                }
            }
            r_opt
        };

        if res.is_none() {
            // INVERTED CONTRAST FALLBACK FOR LIGHT TEXT ON DARK BACKGROUND (E.G. WHITE SIGNAGE BADGES)
            let mut inverted = crop.to_rgba8();
            image::imageops::invert(&mut inverted);
            let inv_dyn = DynamicImage::ImageRgba8(inverted);
            let (iw, ih) = inv_dyn.dimensions();
            let inv_r = target_h as f32 / ih as f32;
            let inv_max_w = ((iw as f32 * inv_r).round() as u32).max(16);
            #[cfg(feature = "directml")]
            let inv_target_w = (inv_max_w.max(320) as usize).div_ceil(128) * 128;
            #[cfg(not(feature = "directml"))]
            let inv_target_w = inv_max_w.max(320) as usize;
            let inv_resized = image::imageops::resize(
                &inv_dyn,
                inv_max_w,
                target_h,
                image::imageops::FilterType::Triangle,
            );
            let mut inv_tensor_vec = vec![0.0_f32; 3 * target_h as usize * inv_target_w as usize];
            let inv_stride_c = target_h as usize * inv_target_w as usize;
            let inv_stride_y = inv_target_w as usize;
            for y in 0..target_h as usize {
                for x in 0..inv_max_w as usize {
                    let p = inv_resized.get_pixel(x as u32, y as u32);
                    let r_norm = (p[0] as f32 / 255.0 - 0.5) / 0.5;
                    let g_norm = (p[1] as f32 / 255.0 - 0.5) / 0.5;
                    let b_norm = (p[2] as f32 / 255.0 - 0.5) / 0.5;

                    let base_idx = y * inv_stride_y + x;
                    inv_tensor_vec[base_idx] = b_norm;
                    inv_tensor_vec[inv_stride_c + base_idx] = g_norm;
                    inv_tensor_vec[2 * inv_stride_c + base_idx] = r_norm;
                }
            }
            if let Ok(input_tensor) = Tensor::from_array(([1, 3, target_h as usize, inv_target_w as usize], inv_tensor_vec)) {
                if let Ok(outputs) = rec_session.run(ort::inputs![input_tensor]) {
                    if let Ok((out_shape, out_slice)) = outputs[0].try_extract_tensor::<f32>() {
                        let dims: Vec<usize> = out_shape.iter().map(|&d| d as usize).collect();
                        if dims.len() >= 3 {
                            let time_steps = dims[1];
                            let num_classes = dims[2];
                            let mut inv_res = decode_ctc_slice(out_slice, time_steps, num_classes, characters);
                            if let Some(ref mut r) = inv_res {
                                r.text = crate::ml::detect::filter_text_by_source_lang(&r.text, source_lang).trim().to_string();
                                if !r.text.is_empty() {
                                    return Ok(Some(r.clone()));
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(res)
    }

    /// OCR on a crop with 32px padding, multi-line reading-order sorting, and substring deduplication.
    pub fn recognize_crop(&mut self, crop: &DynamicImage) -> Result<Option<OcrResult>> {
        self.recognize_crop_with_lang(crop, None)
    }

    pub fn recognize_crop_with_lang(&mut self, crop: &DynamicImage, source_lang: Option<&str>) -> Result<Option<OcrResult>> {
        let (w, h) = crop.dimensions();
        if w < 8 || h < 8 {
            return Ok(None);
        }

        // Padded image with 32px boundary
        let target_h = 32_u32.max(h.div_ceil(32) * 32);
        let target_w = 32_u32.max(w.div_ceil(32) * 32);
        let dh = target_h - h;
        let dw = target_w - w;
        let pad_top = dh / 2;
        let pad_left = dw / 2;

        // ADAPTIVE BACKGROUND LUMINANCE ESTIMATION
        let mut total_lum = 0_u64;
        let sample_step = (w * h / 200).max(1);
        let mut samples = 0_u64;
        for y in (0..h).step_by(sample_step as usize) {
            for x in (0..w).step_by(sample_step as usize) {
                let p = crop.get_pixel(x, y);
                let lum = (p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000;
                total_lum += lum as u64;
                samples += 1;
            }
        }
        let mean_lum = (total_lum / samples.max(1)) as u32;
        let bg_fill = if mean_lum < 128 { Rgb([0_u8, 0, 0]) } else { Rgb([255_u8, 255, 255]) };

        let mut padded = ImageBuffer::from_pixel(target_w, target_h, bg_fill);
        for y in 0..h {
            for x in 0..w {
                let p = crop.get_pixel(x, y);
                padded.put_pixel(pad_left + x, pad_top + y, Rgb([p[0], p[1], p[2]]));
            }
        }

        let mut raw_lines = self.detect_and_recognize_tiled_inner(&DynamicImage::ImageRgb8(padded), false, source_lang, Some(ocr_sub_image_det_limit(w.max(h))))?;
        if raw_lines.is_empty() {
            raw_lines = self.detect_and_recognize_tiled_inner(crop, false, source_lang, Some(ocr_sub_image_det_limit(w.max(h))))?;
        }
        raw_lines = crate::ml::detect::filter_orthogonal_line_conflicts(raw_lines);

        if raw_lines.is_empty() {
            // Fallback for compact single/short utterance speech bubble crops (e.g. isolated 'え。', '！？')
            if w <= 120 && h <= 120 {
                if let Ok(Some(line_res)) = self.recognize_line_with_lang(crop, source_lang) {
                    let clean_t = line_res.text.trim();
                    if !clean_t.is_empty() && (PUNCT_ONLY.is_match(clean_t) || crate::ml::detect::has_cjk_characters(clean_t) || crate::ml::detect::has_alphanumeric_characters(clean_t)) {
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
            let (_, _, w, h) = polygon_bounds(&l.polygon);
            h >= (w as f32 * 1.2) as i32
        }).count();
        let horiz_count = raw_lines.iter().filter(|l| {
            let (_, _, w, h) = polygon_bounds(&l.polygon);
            w >= (h as f32 * 1.2) as i32
        }).count();
        let is_vertical_crop = vertical_count > horiz_count && !raw_lines.is_empty();

        let is_ja = matches!(source_lang, Some("ja") | Some("japanese"));
        // FOR MULTI-LINE CROPS (W >= 60, H >= 40):
        // TEST PROJECTION-BASED HORIZONTAL ROW SLICING (FOR NON-JAPANESE OR EXPLICIT HORIZONTAL CROPS)
        if (!is_vertical_crop || !is_ja) && w >= 60 && h >= 40 {
            let proj_strips = horizontal_paragraph_to_line_strips(crop);
            if proj_strips.len() >= 2 {
                let mut proj_lines = Vec::new();
                for (poly, strip_img) in proj_strips {
                    if let Ok(Some(line_res)) = self.recognize_line_horizontal_with_lang(&strip_img, source_lang) {
                        let clean_t = crate::ml::detect::clean_stray_ocr_artifacts(&line_res.text);
                        if !clean_t.trim().is_empty() && line_res.score >= 0.55 {
                            proj_lines.push((poly, clean_t, line_res.score));
                        }
                    }
                }
                if proj_lines.len() >= 2 {
                    let proj_chars: usize = proj_lines.iter().map(|(_, t, _)| t.chars().filter(|c| !c.is_whitespace()).count()).sum();
                    let raw_chars: usize = raw_lines.iter().map(|l| l.text.chars().filter(|c| !c.is_whitespace()).count()).sum();
                    if proj_chars >= raw_chars || raw_lines.is_empty() {
                        let text_lines: Vec<String> = proj_lines.iter().map(|(_, t, _)| t.clone()).collect();
                        let max_score = proj_lines.iter().map(|(_, _, s)| *s).fold(0.0_f32, f32::max);
                        return Ok(Some(OcrResult {
                            text: text_lines.join("\n"),
                            score: max_score,
                            lines: proj_lines,
                        }));
                    }
                }
            }
        }

        if is_vertical_crop {
            // SORT VERTICAL READING ORDER (RIGHT-TO-LEFT COLUMNS, TOP-TO-BOTTOM LINES).
            // A PER-PAIR BANDED COMPARATOR (SWITCHING BETWEEN X-ORDER AND Y-ORDER BASED ON A
            // DIFF THRESHOLD) VIOLATES TRANSITIVITY FOR 3+ LINES WHOSE MID_X STRADDLE THE
            // THRESHOLD BOUNDARY, CRASHING THE SORT WITH "user-provided comparison function
            // does not correctly implement a total order". INSTEAD, ASSIGN EACH LINE A COLUMN
            // REPRESENTATIVE IN A SINGLE FIRST-FIT PASS, THEN SORT BY (COLUMN DESC, Y ASC) —
            // A STRICT TOTAL ORDER THAT PRESERVES RIGHT-TO-LEFT COLUMN READING ORDER.
            // THRESHOLD IS 40% OF MEDIAN COLUMN WIDTH — PERCENTAGE-BASED FOR RESOLUTION INVARIANCE.
            // MINIMUM FLOOR IS 20% OF MEDIAN WIDTH (NEVER A HARDCODED PIXEL VALUE).
            let col_w_threshold = {
                let widths: Vec<i32> = raw_lines.iter().map(|l| polygon_bounds(&l.polygon).2).collect();
                if widths.is_empty() {
                    1
                } else {
                    let mut ws = widths.clone();
                    ws.sort_unstable();
                    let median_w = ws[ws.len() / 2];
                    (median_w * 2 / 5).max(median_w / 5).max(1)
                }
            };
            let mut col_reps: Vec<i32> = Vec::new();
            let mut col_ids: Vec<usize> = Vec::with_capacity(raw_lines.len());
            for l in &raw_lines {
                let (lx, _, lw, _) = polygon_bounds(&l.polygon);
                let mid_x = lx + lw / 2;
                if let Some(pos) = col_reps.iter().position(|&rep| (rep - mid_x).abs() < col_w_threshold) {
                    col_ids.push(pos);
                } else {
                    col_reps.push(mid_x);
                    col_ids.push(col_reps.len() - 1);
                }
            }
            let mut keyed: Vec<_> = raw_lines
                .drain(..)
                .zip(col_ids)
                .map(|(line, col)| {
                    let (_, ay, _, _) = polygon_bounds(&line.polygon);
                    (col_reps[col], ay, line)
                })
                .collect();
            // RIGHTMOST COLUMN FIRST (REPRESENTATIVE MID_X DESCENDING), THEN TOP-TO-BOTTOM
            keyed.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
            raw_lines = keyed.into_iter().map(|(_, _, line)| line).collect();
        } else {
            // HORIZONTAL READING ORDER (TOP-TO-BOTTOM, LEFT-TO-RIGHT).
            // A PER-PAIR BANDED COMPARATOR (Y-DIFF VS THRESHOLD, THEN FALL BACK TO X)
            // VIOLATES TRANSITIVITY FOR 3+ LINES WHOSE Y COORDINATES STRADDLE THE
            // THRESHOLD BOUNDARY. INSTEAD, ASSIGN EACH LINE A ROW REPRESENTATIVE IN A
            // SINGLE FIRST-FIT PASS, THEN SORT BY (ROW ASC, X ASC) — A STRICT TOTAL ORDER.
            // ROW BAND THRESHOLD IS 25% OF MEDIAN LINE HEIGHT — PERCENTAGE-BASED FOR RESOLUTION INVARIANCE.
            let row_band_threshold = {
                let heights: Vec<i32> = raw_lines.iter().map(|l| polygon_bounds(&l.polygon).3).collect();
                if heights.is_empty() {
                    1
                } else {
                    let mut hs = heights.clone();
                    hs.sort_unstable();
                    let median_h = hs[hs.len() / 2];
                    (median_h / 4).max(1)
                }
            };
            let mut row_reps: Vec<i32> = Vec::new();
            let mut row_ids: Vec<usize> = Vec::with_capacity(raw_lines.len());
            for l in &raw_lines {
                let (_, ly, _, _) = polygon_bounds(&l.polygon);
                if let Some(pos) = row_reps.iter().position(|&rep| (rep - ly).abs() <= row_band_threshold) {
                    row_ids.push(pos);
                } else {
                    row_reps.push(ly);
                    row_ids.push(row_reps.len() - 1);
                }
            }
            let mut keyed: Vec<_> = raw_lines
                .drain(..)
                .zip(row_ids)
                .map(|(line, row)| {
                    let (lx, _, _, _) = polygon_bounds(&line.polygon);
                    (row_reps[row], lx, line)
                })
                .collect();
            // TOP-TO-BOTTOM (ROW REPRESENTATIVE ASCENDING), THEN LEFT-TO-RIGHT
            keyed.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
            raw_lines = keyed.into_iter().map(|(_, _, line)| line).collect();
        }

        // Substring & duplicate deduplication
        let mut dedup_lines: Vec<OcrLine> = Vec::new();
        for line in raw_lines {
            let mut duplicate = false;
            for existing in &dedup_lines {
                let same_text = line.text == existing.text || line.text.contains(&existing.text) || existing.text.contains(&line.text);
                let iou = box_iou_pts(&line.polygon, &existing.polygon);
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

    /// FAST BOUNDING-BOX-ONLY DETECTION (SKIPS RECOGNITION / CTC DECODING ENTIRELY)
    pub fn detect_only(&mut self, img: &DynamicImage) -> Result<Vec<Vec<[i32; 2]>>> {
        let (w, h) = img.dimensions();
        if w < 16 || h < 16 {
            return Ok(Vec::new());
        }

        if let Some(ref mut det) = self.det_session {
            let max_side = w.max(h);
            let limit_side = ocr_sub_image_det_limit(max_side);
            let ratio = limit_side / max_side as f32;
            let resize_w = (((w as f32 * ratio).round() as u32 / 32) * 32).max(32);
            let resize_h = (((h as f32 * ratio).round() as u32 / 32) * 32).max(32);

            let resized = image::imageops::resize(
                img,
                resize_w,
                resize_h,
                image::imageops::FilterType::Triangle,
            );

            let mut det_vec = vec![0.0_f32; 3 * resize_h as usize * resize_w as usize];
            let stride_c = resize_h as usize * resize_w as usize;
            let stride_y = resize_w as usize;

            det_vec.par_chunks_mut(stride_c).enumerate().for_each(|(c, plane)| {
                for y in 0..resize_h as usize {
                    for x in 0..resize_w as usize {
                        let p = resized.get_pixel(x as u32, y as u32);
                        let v = match c {
                            0 => (p[0] as f32 / 255.0 - 0.485) / 0.229,
                            1 => (p[1] as f32 / 255.0 - 0.456) / 0.224,
                            _ => (p[2] as f32 / 255.0 - 0.406) / 0.225,
                        };
                        plane[y * stride_y + x] = v;
                    }
                }
            });

            let det_tensor = Tensor::from_array(([1, 3, resize_h as usize, resize_w as usize], det_vec))
                .map_err(|e| anyhow::anyhow!("Det tensor create error: {}", e))?;

            let det_out = det.run(ort::inputs![det_tensor])
                .map_err(|e| anyhow::anyhow!("Det run error: {}", e))?;

            let (_out_shape, out_slice) = det_out[0].try_extract_tensor::<f32>()
                .map_err(|e| anyhow::anyhow!("Extract det error: {}", e))?;

            let mut det_lines_map = vec![0.0_f32; resize_w as usize * resize_h as usize];
            det_lines_map.copy_from_slice(out_slice);

            let (boxes, _) = lines_map_to_boxes(
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

            Ok(boxes)
        } else {
            Ok(Vec::new())
        }
    }

    /// Full-page or sub-image DBNet text line detection and recognition with optional sliding tile passes.
    pub fn detect_and_recognize(&mut self, img: &DynamicImage) -> Result<Vec<OcrLine>> {
        self.detect_and_recognize_tiled(img, true)
    }

    pub fn detect_and_recognize_tiled(&mut self, img: &DynamicImage, tiled: bool) -> Result<Vec<OcrLine>> {
        self.detect_and_recognize_tiled_with_lang(img, tiled, None)
    }

    pub fn detect_and_recognize_tiled_with_lang(&mut self, img: &DynamicImage, tiled: bool, source_lang: Option<&str>) -> Result<Vec<OcrLine>> {
        self.detect_and_recognize_tiled_inner(img, tiled, source_lang, None)
    }

    /// `det_limit_override` REPLACES THE FULL-PAGE TARGET FOR SUB-ASSET PASSES: TILE
    /// SLICES AND CROP RE-SCANS SCALE BY THEIR OWN SIZE (HISTORICAL LADDER), NOT BY THE
    /// PAGE TARGET, WHICH WOULD OVER-MAGNIFY SMALL PAGES AND HALLUCINATE FRAGMENTS.
    fn detect_and_recognize_tiled_inner(&mut self, img: &DynamicImage, tiled: bool, source_lang: Option<&str>, det_limit_override: Option<f32>) -> Result<Vec<OcrLine>> {
        let (w, h) = img.dimensions();
        if w < 16 || h < 16 {
            return Ok(Vec::new());
        }

        let mut lines = Vec::new();
        let detected_boxes = if let Some(ref mut det) = self.det_session {
            let max_side = w.max(h);
            let ratio = det_limit_override.unwrap_or(OCR_DET_LIMIT_SIDE) / max_side as f32;
            let resize_w = (((w as f32 * ratio).round() as u32 / 32) * 32).max(32);
            let resize_h = (((h as f32 * ratio).round() as u32 / 32) * 32).max(32);

            let resized = image::imageops::resize(
                img,
                resize_w,
                resize_h,
                image::imageops::FilterType::Triangle,
            );

            let mut det_vec = vec![0.0_f32; 3 * resize_h as usize * resize_w as usize];
            let stride_c = resize_h as usize * resize_w as usize;
            let stride_y = resize_w as usize;

            // PP-OCR Det normalization in RGB format: (RGB / 255.0 - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
            // FILL THE THREE CHANNEL PLANES IN PARALLEL (FAULT D: PARALLELIZE CPU PREPROCESSING).
            det_vec.par_chunks_mut(stride_c).enumerate().for_each(|(c, plane)| {
                for y in 0..resize_h as usize {
                    for x in 0..resize_w as usize {
                        let p = resized.get_pixel(x as u32, y as u32);
                        let v = match c {
                            0 => (p[0] as f32 / 255.0 - 0.485) / 0.229,
                            1 => (p[1] as f32 / 255.0 - 0.456) / 0.224,
                            _ => (p[2] as f32 / 255.0 - 0.406) / 0.225,
                        };
                        plane[y * stride_y + x] = v;
                    }
                }
            });

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

            let (boxes, _) = lines_map_to_boxes(
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

        // FIRST PASS: COLLECT ALL DETECTED LINE CROPS (NO INFERENCE YET)
        let mut pending: Vec<(Vec<[i32; 2]>, DynamicImage)> = Vec::new();
        for poly in detected_boxes {
            let ang = crate::ml::geometry::calculate_box_angle_i32(&poly);
            let crop_opt = if ang.abs() >= 2.0 && poly.len() == 4 {
                crate::ml::geometry::get_rotate_crop_image(img, &poly)
            } else {
                None
            };

            let crop = if let Some(rc) = crop_opt {
                rc
            } else {
                let (x0, y0, bw, bh) = polygon_bounds(&poly);
                if bw >= 4 && bh >= 4 && x0 < w as i32 && y0 < h as i32 {
                    let crop_x = x0.max(0) as u32;
                    let crop_y = y0.max(0) as u32;
                    let crop_w = (bw as u32).min(w - crop_x);
                    let crop_h = (bh as u32).min(h - crop_y);

                    if crop_w >= 4 && crop_h >= 4 {
                        img.crop_imm(crop_x, crop_y, crop_w, crop_h)
                    } else {
                        continue;
                    }
                } else {
                    continue;
                }
            };
            pending.push((poly, crop));
        }

        // SECOND PASS: BATCH THE HORIZONTAL LINE CROPS INTO ONE ORT CALL INSTEAD
        // OF ONE BATCH-1 CALL PER CROP — THE PER-CROP BATCH-1 PATH KEEPS THE GPU
        // IDLE BETWEEN TINY KERNELS, BATCHING AMORTIZES THE LAUNCH OVERHEAD.
        // VERTICAL CROPS (H >= 1.3 * W) STAY ON THE PER-CROP SMART PATH: THEIR
        // UPRIGHT-SLICING + ROTATION FALLBACKS ARE LOAD-BEARING FOR TBRL MANGA
        // TEXT AND THE BATCHED SINGLE-PASS PATH CANNOT REPRODUCE THAT OUTPUT.
        let batch_slots: Vec<usize> = pending
            .iter()
            .enumerate()
            .filter(|(_, (_, c))| {
                let (cw, ch) = c.dimensions();
                (ch as f32) < 1.3 * (cw as f32)
            })
            .map(|(idx, _)| idx)
            .collect();
        let crops: Vec<DynamicImage> = batch_slots.iter().map(|&i| pending[i].1.clone()).collect();
        let batch_results = if crops.is_empty() {
            Vec::new()
        } else {
            self.recognize_lines_batched_with_lang(&crops, source_lang)
                .unwrap_or_else(|_| {
                    crops
                        .iter()
                        .map(|c| self.recognize_line_with_lang(c, source_lang).ok().flatten())
                        .collect()
                })
        };

        // THIRD PASS: RE-ALIGN RESULTS TO THEIR ORIGINAL DETECTION SLOT AND EMIT
        // IN DETECTION ORDER (HORIZONTAL BATCH + VERTICAL SMART PATH TOGETHER), SO
        // THE OUTPUT ORDER IS IDENTICAL TO THE PRE-BATCHING BEHAVIOUR.
        let mut results_by_idx: Vec<Option<OcrResult>> = (0..pending.len()).map(|_| None).collect();
        for (slot_idx, &pending_idx) in batch_slots.iter().enumerate() {
            results_by_idx[pending_idx] = batch_results.get(slot_idx).cloned().flatten();
        }
        for (idx, (_, crop)) in pending.iter().enumerate() {
            let (cw, ch) = crop.dimensions();
            if (ch as f32) >= 1.3 * (cw as f32) {
                if let Ok(Some(line_res)) = self.recognize_line_with_lang(crop, source_lang) {
                    results_by_idx[idx] = Some(line_res);
                }
            }
        }
        for (idx, (poly, _)) in pending.iter().enumerate() {
            if let Some(line_res) = results_by_idx[idx].take() {
                if !line_res.text.is_empty() {
                    lines.push(OcrLine {
                        polygon: poly.clone(),
                        text: line_res.text,
                        score: line_res.score,
                    });
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
                    if let Ok(tile_lines) = self.detect_and_recognize_tiled_inner(&tile_crop, false, source_lang, Some(ocr_sub_image_det_limit(tile_crop.dimensions().0.max(tile_crop.dimensions().1)))) {
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

        let mut lines = crate::ml::detect::filter_orthogonal_line_conflicts(lines);

        // FILTER OPTICAL BOUNDARY SLIVERS: THIN LINES (H <= 13PX) WITH LOW CONFIDENCE (SCORE < 0.65)
        lines.retain(|l| {
            let (_, _, lw, lh) = polygon_bounds(&l.polygon);
            let is_thin_horiz = lh <= 13 && lw >= 30;
            let is_thin_vert = lw <= 13 && lh >= 30;
            if (is_thin_horiz || is_thin_vert) && l.score < 0.65 {
                return false;
            }
            true
        });

        Ok(lines)
    }

    /// CROP AN ROI WITH SMALL MARGIN
    pub fn crop_region(img: &DynamicImage, polygon: &[[i32; 2]], margin: i32) -> DynamicImage {
        let (w, h) = img.dimensions();
        let (min_x, min_y, bw, bh) = polygon_bounds(polygon);

        let x0 = (min_x - margin).clamp(0, w as i32 - 1) as u32;
        let y0 = (min_y - margin).clamp(0, h as i32 - 1) as u32;
        let x1 = ((min_x + bw + margin) as u32).min(w);
        let y1 = ((min_y + bh + margin) as u32).min(h);

        let crop_w = (x1 - x0).max(1);
        let crop_h = (y1 - y0).max(1);

        img.crop_imm(x0, y0, crop_w, crop_h)
    }
}


