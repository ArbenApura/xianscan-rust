// -- CRATE / EXTERNAL IMPORTS -- //
use image::{DynamicImage, GenericImageView};

// -- INTERNAL IMPORTS -- //
use crate::ml::detect::ComicTextDetector;
use crate::ml::detect::{clean_stray_ocr_artifacts, is_watermark_line, CHINESE_RE};
use crate::ml::geometry::{box_iou_f32, box_iou_pts, box_to_xywh_f32, polygon_bounds};
use crate::ml::ocr::{OcrLine, RapidOcr};
use crate::ml::schemas::BoxRect;
use crate::ml::watermark::WatermarkRemover;

use anyhow::Result;

// -- TYPES & STRUCTS -- //

pub struct DetectionFusionResult {
    pub comic_boxes: Vec<Vec<[i32; 2]>>,
    pub comic_scores: Vec<f32>,
    pub panels: Vec<BoxRect>,
    pub bubbles: Vec<BoxRect>,
    pub onomatopoeia: Vec<(BoxRect, f32)>,
    pub text_bubbles: Vec<(BoxRect, f32)>,
    pub text_free: Vec<(BoxRect, f32)>,
    pub rapid_lines: Vec<OcrLine>,
    pub backend: String,
    pub detector_time_ms: f64,
    pub ocr_fullpage_time_ms: f64,
    pub rescue_time_ms: f64,
    pub watermark_time_ms: f64,
    pub rescued_crops_count: usize,
    pub watermark_recovered_count: usize,
    pub raw_ocr_lines_count: usize,
}

// -- FUNCTIONS & ALGORITHMS -- //

pub fn fuse_detections(
    detector: &mut Option<ComicTextDetector>,
    ocr: &mut Option<RapidOcr>,
    watermark: &WatermarkRemover,
    img: &DynamicImage,
    source_lang: Option<&str>,
    enable_watermark_inpaint: bool,
    allow_degraded_fallback: bool,
) -> Result<DetectionFusionResult> {
    let (page_w, page_h) = img.dimensions();

    // 1 & 2. PARALLEL EXECUTION: RUN COMIC LAYOUT DETECTOR AND RAPIDOCR CONCURRENTLY VIA SCOPED THREADS
    let (det_result, ocr_result) = std::thread::scope(|s| {
        let det_handle = s.spawn(|| -> Result<(Option<crate::ml::detect::DetectResult>, f64)> {
            if let Some(ref mut det) = detector {
                let t0 = std::time::Instant::now();
                match det.detect(img) {
                    Ok(res) => {
                        let dur = t0.elapsed().as_secs_f64() * 1000.0;
                        return Ok((Some(res), dur));
                    }
                    Err(e) => {
                        tracing::error!("Comic layout detector inference failed: {}", e);
                        if !allow_degraded_fallback {
                            return Err(anyhow::anyhow!("LAYOUT_DETECTOR_FAILED: Comic layout detector inference crashed: {}", e));
                        }
                    }
                }
            } else if !allow_degraded_fallback {
                return Err(anyhow::anyhow!("LAYOUT_DETECTOR_FAILED: Comic layout detector model is not loaded or missing."));
            }
            Ok((None, 0.0))
        });

        let ocr_handle = s.spawn(|| {
            if let Some(ref mut o) = ocr {
                let t0 = std::time::Instant::now();
                if let Ok(rl) = o.detect_and_recognize_tiled_with_lang(img, true, source_lang) {
                    let dur = t0.elapsed().as_secs_f64() * 1000.0;
                    // FILTER OUT GIANT ARTWORK HALLUCINATIONS, NOISE STROKES, HIGH-TILT NOISE, AND OPTICAL BORDER SLIVERS
                    let mut filtered: Vec<OcrLine> = rl
                        .into_iter()
                        .filter(|line| {
                            let (_, _, lw, lh) = polygon_bounds(&line.polygon);
                            let t = line.text.trim();
                            if t.is_empty() {
                                return false;
                            }
                            // 1. DROP GIANT ARTWORK HALLUCINATIONS (W >= 60% PAGE_W, H >= 120PX, SCORE < 0.75)
                            if lw >= (page_w as f32 * 0.60) as i32 && lh >= 120 && line.score < 0.75 {
                                return false;
                            }
                            // 2. DROP STANDALONE REPEATED NOISE STROKES
                            if crate::ml::detect::is_standalone_noise_stroke(t) {
                                return false;
                            }
                            // 3. DROP HIGH-TILT NON-DIALOGUE WITH LOW RECOGNITION CONFIDENCE (THETA >= 12.0 DEG, SCORE < 0.60)
                            let angle = crate::ml::geometry::calculate_box_angle_i32(&line.polygon);
                            if angle.abs() >= 12.0 && line.score < 0.60 {
                                return false;
                            }
                            // In non-Latin script sources (CJK/Korean/Japanese), drop slanted/angled pure Latin lines (theta >= 10.0 deg) that lack native script
                            if crate::ml::detect::is_non_latin_source(source_lang) && angle.abs() >= 10.0 && !crate::ml::detect::has_native_script_for_lang(t, source_lang) {
                                return false;
                            }
                            // 4. DROP MARGIN ARCHITECTURAL / BUILDING GRID TEXTURE NOISE & SLICED EDGE FRAGMENTS (FLUSH TO MARGIN X <= 5 OR X + LW >= PAGE_W - 5, LOW CONFIDENCE SCORE < 0.75, NO BUBBLE)
                            let (px, _, _, _) = polygon_bounds(&line.polygon);
                            let is_margin_flush = px <= 5 || px + lw >= page_w as i32 - 5;
                            if is_margin_flush && line.score < 0.75 {
                                return false;
                            }
                            true
                        })
                        .collect();

                    // 4. DROP THIN CONTRAST-BORDER OPTICAL SLIVERS (LH <= 25PX) THAT OVERLAP NORMAL-HEIGHT LINES (LH >= 35PX)
                    let normal_lines: Vec<([i32; 4], f32)> = filtered
                        .iter()
                        .filter_map(|l| {
                            let (x, y, w, h) = polygon_bounds(&l.polygon);
                            if h >= 35 && l.score >= 0.65 {
                                Some(([x, y, w, h], l.score))
                            } else {
                                None
                            }
                        })
                        .collect();

                    filtered.retain(|l| {
                        let (lx, ly, lw, lh) = polygon_bounds(&l.polygon);
                        if lh <= 25 {
                            let is_sliver = normal_lines.iter().any(|([nx, ny, nw, nh], _)| {
                                let ix = (lx + lw).min(nx + nw) - lx.max(*nx);
                                let iy = (ly + lh).min(ny + nh) - ly.max(*ny);
                                if ix > 0 && iy > 0 {
                                    let overlap_y = iy as f32 / lh as f32;
                                    let overlap_x = ix as f32 / lw.min(*nw) as f32;
                                    overlap_y >= 0.60 && overlap_x >= 0.50
                                } else {
                                    false
                                }
                            });
                            if is_sliver {
                                return false;
                            }
                        }
                        true
                    });

                    return (filtered, dur);
                }
            }
            (Vec::new(), 0.0)
        });

        let det_res = det_handle.join().unwrap();
        let ocr_res = ocr_handle.join().unwrap();
        (det_res, ocr_res)
    });

    let (res_opt, detector_time_ms) = det_result?;
    let (mut rapid_lines, ocr_fullpage_time_ms) = ocr_result;

    let (comic_boxes, comic_scores, panels, bubbles, onomatopoeia, text_bubbles, text_free, backend) = match res_opt {
        Some(res) => (
            res.boxes,
            res.scores,
            res.panels,
            res.bubbles,
            res.onomatopoeia,
            res.text_bubbles,
            res.text_free,
            res.backend,
        ),
        None => (
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            "rapidocr-fallback".to_string(),
        ),
    };

    let raw_ocr_lines_count = rapid_lines.len();
    let mut rescued_crops_count = 0_usize;

    // 3. Fallback: RapidOCR isolated recognition for ComicTextDetector boxes
    let t_rescue0 = std::time::Instant::now();
    if let Some(ref mut o) = ocr {
        if !comic_boxes.is_empty() {
            let (w, h) = img.dimensions();
            let mut ocr_det_matched = vec![false; comic_boxes.len()];

        for (idx, cb) in comic_boxes.iter().enumerate() {
            let (cb_x, cb_y, cb_w, cb_h) = polygon_bounds(cb);
            let cb_rect = BoxRect { x: cb_x, y: cb_y, w: cb_w, h: cb_h };
            let cb_area = (cb_w * cb_h).max(1);

            let is_cb_multiline = cb_h >= 45 && cb_w >= 45;
            let internal_rapid_lines_count = rapid_lines.iter().filter(|rl| {
                let (rx, ry, rw, rh) = polygon_bounds(&rl.polygon);
                let rc_x = rx + rw / 2;
                let rc_y = ry + rh / 2;
                let center_in = rc_x >= cb_x && rc_x <= cb_x + cb_w && rc_y >= cb_y && rc_y <= cb_y + cb_h;
                let iou = box_iou_pts(cb, &rl.polygon);
                (center_in || iou >= 0.20) && rl.score >= 0.72
            }).count();

            if is_cb_multiline && internal_rapid_lines_count >= 2 {
                ocr_det_matched[idx] = true;
                continue;
            }

            for (r_idx, rl) in rapid_lines.iter().enumerate() {
                let (rx, ry, rw, rh) = polygon_bounds(&rl.polygon);
                let rl_area = (rw * rh).max(1);
                let iou = box_iou_pts(cb, &rl.polygon);

                let overlap_x = (cb_x + cb_w).min(rx + rw) - cb_x.max(rx);
                let overlap_y = (cb_y + cb_h).min(ry + rh) - cb_y.max(ry);
                let overlap_area = overlap_x.max(0) * overlap_y.max(0);

                let rl_contained = overlap_area as f32 / rl_area as f32 >= 0.50;
                let cb_covered = overlap_area as f32 / cb_area as f32 >= 0.20;
                let is_cb_vert = cb_h > (cb_w as f32 * 1.3) as i32;
                let is_rl_vert = rh > (rw as f32 * 1.3) as i32;
                let is_aspect_compatible = is_cb_vert == is_rl_vert;

                let is_multiline_cb = (cb_h as f32) >= (rh as f32 * 1.8);
                if is_aspect_compatible && (iou >= 0.20 || rl_contained || cb_covered || crate::ml::geometry::line_center_inside_box(&rl.polygon, &cb_rect)) {
                    ocr_det_matched[idx] = true;

                    let is_wider = !is_rl_vert && (cb_w >= rw + 8 || (cb_w as f32) >= (rw as f32 * 1.10));
                    let is_taller = is_rl_vert && (cb_h >= rh + 10 || (cb_h as f32) >= (rh as f32 * 1.10));
                    let is_missing_lines = is_multiline_cb && !is_rl_vert && (cb_h >= 45 && cb_w >= 45);
                    let is_non_latin_corrupted_latin = crate::ml::detect::is_non_latin_source(source_lang)
                        && !crate::ml::detect::has_native_script_for_lang(&rl.text, source_lang)
                        && rl.text.chars().any(|c| c.is_ascii_alphabetic());
                    let is_low_conf_or_degenerate = rl.score < 0.65 || (rl.text.trim().chars().count() <= 1 && (rh >= 35 || rw >= 35)) || is_non_latin_corrupted_latin;
                    if is_wider || is_taller || is_missing_lines || is_low_conf_or_degenerate {
                        let pad_x = if is_rl_vert { 16 } else { 15 };
                        let pad_y = if is_rl_vert { 12 } else { 15 };
                        let cx = (cb_x - pad_x).max(0) as u32;
                        let cy = (cb_y - pad_y).max(0) as u32;
                        let cw = ((cb_w + pad_x * 2) as u32).min(w - cx);
                        let ch = ((cb_h + pad_y * 2) as u32).min(h - cy);
                        if cw >= 8 && ch >= 8 {
                            let crop = img.crop_imm(cx, cy, cw, ch);
                            let rec_opt = o.recognize_crop_with_lang(&crop, source_lang).ok().flatten().and_then(|c_res| {
                                if !c_res.text.trim().is_empty() {
                                    Some(crate::ml::ocr::OcrResult {
                                        text: c_res.text,
                                        score: c_res.score,
                                        lines: c_res.lines,
                                    })
                                } else {
                                    None
                                }
                            }).or_else(|| o.recognize_line_with_lang(&crop, source_lang).ok().flatten())
                            .or_else(|| o.recognize_crop_with_lang(&crop, None).ok().flatten());

                            if let Some(line_res) = rec_opt {
                                let clean_c = clean_stray_ocr_artifacts(&line_res.text);
                                let clean_chars = clean_c.chars().filter(|c| !c.is_whitespace()).count();
                                let rl_chars = rl.text.chars().filter(|c| !c.is_whitespace()).count();
                                let clean_cjk = clean_c.chars().filter(|c| crate::ml::detect::has_cjk_characters(&c.to_string())).count();
                                let rl_cjk = rl.text.chars().filter(|c| crate::ml::detect::has_cjk_characters(&c.to_string())).count();
                                let is_excessive_multiline_bleed = !is_multiline_cb && !is_rl_vert && clean_c.contains('\n') && rl.score >= 0.70;
                                let is_better = !is_excessive_multiline_bleed && (
                                    clean_chars > rl_chars
                                        || clean_cjk > rl_cjk
                                        || (clean_c.contains('…') && !rl.text.contains('…'))
                                        || (clean_chars == rl_chars && line_res.score > rl.score + 0.05)
                                );
                                if is_better {
                                    let union_x = cb_x.min(rx);
                                    let union_y = cb_y.min(ry);
                                    let union_w = (cb_x + cb_w).max(rx + rw) - union_x;
                                    let union_h = (cb_y + cb_h).max(ry + rh) - union_y;
                                    let offset_poly = vec![
                                        [union_x, union_y],
                                        [union_x + union_w, union_y],
                                        [union_x + union_w, union_y + union_h],
                                        [union_x, union_y + union_h],
                                    ];
                                    rapid_lines[r_idx] = OcrLine {
                                        polygon: offset_poly,
                                        text: clean_c,
                                        score: line_res.score.max(rl.score),
                                    };
                                    rescued_crops_count += 1;
                                }
                            }
                        }
                    }
                    break;
                }
            }
        }

        let mut single_line_pending: Vec<(Vec<[i32; 2]>, DynamicImage)> = Vec::new();

        for (idx, cb) in comic_boxes.iter().enumerate() {
            if !ocr_det_matched[idx] {
                let (bx, by, bw, bh) = polygon_bounds(cb);
                if bw >= 4 && bh >= 4 && bx < w as i32 && by < h as i32 {
                    let pad_x = (bw / 2).clamp(4, 25);
                    let pad_y = (bh / 2).clamp(4, 20);
                    let crop_x = (bx - pad_x).max(0) as u32;
                    let crop_y = (by - pad_y).max(0) as u32;
                    let crop_w = ((bw + pad_x * 2) as u32).min(w - crop_x);
                    let crop_h = ((bh + pad_y * 2) as u32).min(h - crop_y);

                    if crop_w >= 4 && crop_h >= 4 {
                        let crop = img.crop_imm(crop_x, crop_y, crop_w, crop_h);
                        let mut recognized_from_crop = false;
                        if crop_w >= 16 && crop_h >= 16 {
                            if let Ok(Some(crop_res)) = o.recognize_crop_with_lang(&crop, source_lang) {
                                if !crop_res.lines.is_empty() {
                                    for (sub_poly, sub_text, sub_score) in crop_res.lines {
                                        if sub_score >= 0.60 {
                                            let offset_poly = sub_poly.iter().map(|p| [p[0] + crop_x as i32, p[1] + crop_y as i32]).collect();
                                            rapid_lines.push(OcrLine {
                                                polygon: offset_poly,
                                                text: sub_text,
                                                score: sub_score,
                                            });
                                            rescued_crops_count += 1;
                                        }
                                    }
                                    recognized_from_crop = true;
                                } else if !crop_res.text.is_empty() && crop_res.score >= 0.60 {
                                    rapid_lines.push(OcrLine {
                                        polygon: cb.clone(),
                                        text: crop_res.text,
                                        score: crop_res.score,
                                    });
                                    rescued_crops_count += 1;
                                    recognized_from_crop = true;
                                }
                            }
                        }
                        if !recognized_from_crop {
                            // FOR VERTICAL/HORIZONTAL JAPANESE SFX LINES (NARROW STRIP), ATTEMPT DIRECT LINE RECOGNITION WITH ROTATION FALLBACK
                            let is_strip = (crop_w <= 200 || crop_h <= 200) && (crop_h as f32 >= crop_w as f32 * 1.5 || crop_w as f32 >= crop_h as f32 * 1.5);
                            if is_strip {
                                if let Ok(Some(line_res)) = o.recognize_line_with_lang(&crop, source_lang) {
                                    if !line_res.text.trim().is_empty() && line_res.score >= 0.55 {
                                        rapid_lines.push(OcrLine {
                                            polygon: cb.clone(),
                                            text: line_res.text,
                                            score: line_res.score,
                                        });
                                        rescued_crops_count += 1;
                                        recognized_from_crop = true;
                                    }
                                }
                            }
                        }
                        if !recognized_from_crop && (crop_w <= 120 || crop_h <= 120) && !(crop_w >= 200 && crop_h >= 200) {
                            single_line_pending.push((cb.clone(), crop));
                        }
                    }
                }
            }
        }

        // BATCH RECOGNITION OF SINGLE-LINE UNMATCHED CROPS IN CHUNKS OF 16
        if !single_line_pending.is_empty() {
            let crops: Vec<DynamicImage> = single_line_pending.iter().map(|(_, c)| c.clone()).collect();
            if let Ok(batched_res) = o.recognize_lines_batched_with_lang(&crops, source_lang) {
                for (b_idx, res_opt) in batched_res.into_iter().enumerate() {
                    if let Some(line_res) = res_opt {
                        if !line_res.text.is_empty() && line_res.score >= 0.65 {
                            rapid_lines.push(OcrLine {
                                polygon: single_line_pending[b_idx].0.clone(),
                                text: line_res.text,
                                score: line_res.score,
                            });
                            rescued_crops_count += 1;
                        }
                    }
                }
            }
        }
        }
    }
    let rescue_time_ms = t_rescue0.elapsed().as_secs_f64() * 1000.0;

    // 4. Chromatic Watermark Recovery on Localized Region (Optional, default OFF)
    let t_wm0 = std::time::Instant::now();
    let mut watermark_recovered_count = 0_usize;

    if enable_watermark_inpaint {
        let color_wm_mask = watermark.create_bubble_watermark_mask(img, 210, 20, 35, 15);
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
            let clean_wm_img = watermark.inpaint_colliding_watermarks(img, &color_wm_mask);
            if let Some(ref mut o) = ocr {
                let wm_crop_x0 = (min_wm_x as i32 - 40).max(0) as u32;
                let wm_crop_y0 = (min_wm_y as i32 - 40).max(0) as u32;
                let wm_crop_x1 = (max_wm_x + 40).min(page_w);
                let wm_crop_y1 = (max_wm_y + 40).min(page_h);
                let wm_crop_w = wm_crop_x1.saturating_sub(wm_crop_x0);
                let wm_crop_h = wm_crop_y1.saturating_sub(wm_crop_y0);

                if wm_crop_w >= 16 && wm_crop_h >= 16 {
                    let clean_wm_crop = clean_wm_img.crop_imm(wm_crop_x0, wm_crop_y0, wm_crop_w, wm_crop_h);
                    if let Ok(mut clean_lines) = o.detect_and_recognize_tiled_with_lang(&clean_wm_crop, false, source_lang) {
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

                            if overlap_pix >= 15 && (CHINESE_RE.is_match(&cl.text) || !crate::ml::detect::is_cjk_source(source_lang)) && !is_watermark_line(&cl.text) {
                                let mut replaced = false;
                                let (cx, cy, cw, ch) = polygon_bounds(&cl.polygon);
                                let c_mid_x = cx as f32 + cw as f32 / 2.0;
                                let c_mid_y = cy as f32 + ch as f32 / 2.0;

                                for rl in &mut rapid_lines {
                                    let iou = box_iou_pts(&cl.polygon, &rl.polygon);
                                    let (rx, ry, rw, rh) = polygon_bounds(&rl.polygon);
                                    let r_mid_x = rx as f32 + rw as f32 / 2.0;
                                    let r_mid_y = ry as f32 + rh as f32 / 2.0;
                                    let dist_sq = (c_mid_x - r_mid_x).powi(2) + (c_mid_y - r_mid_y).powi(2);
                                    let is_spatial_neighbor = dist_sq <= (cw.max(rw) as f32 * 0.75).powi(2) + (ch.max(rh) as f32 * 1.5).powi(2);

                                    let has_latin = rl.text.chars().any(|c| c.is_ascii_alphabetic());
                                    let same_text = cl.text == rl.text || cl.text.contains(&rl.text) || rl.text.contains(&cl.text);

                                    if (has_latin && iou >= 0.15) || (iou >= 0.50) || (same_text && (iou >= 0.25 || is_spatial_neighbor)) {
                                        // If existing line is already clean and has no latin watermark corruption, keep the original unless cl has higher confidence without trailing suffix noise
                                        let cl_clean = cl.text.trim();
                                        let has_trailing_noise = cl_clean.ends_with('一') || cl_clean.ends_with('-') || cl_clean.ends_with('1');
                                        if has_latin || (!has_trailing_noise && cl.score > rl.score) {
                                            *rl = cl.clone();
                                        }
                                        replaced = true;
                                        watermark_recovered_count += 1;
                                        break;
                                    }
                                }
                                // ONLY INSERT AS A BRAND NEW LINE IF IT DOES NOT SPATIALLY OVERLAP ANY EXISTING LINE
                                if !replaced {
                                    let overlaps_existing = rapid_lines.iter().any(|rl| {
                                        let iou = box_iou_pts(&cl.polygon, &rl.polygon);
                                        let (rx, ry, rw, rh) = polygon_bounds(&rl.polygon);
                                        let ix = (cx + cw).min(rx + rw) - cx.max(rx);
                                        let iy = (cy + ch).min(ry + rh) - cy.max(ry);
                                        iou >= 0.20 || (ix > 0 && iy > 0 && (ix * iy) as f32 / (cw * ch).max(1) as f32 >= 0.35)
                                    });
                                    if !overlaps_existing {
                                        rapid_lines.push(cl.clone());
                                        watermark_recovered_count += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    let watermark_time_ms = t_wm0.elapsed().as_secs_f64() * 1000.0;

    Ok(DetectionFusionResult {
        comic_boxes,
        comic_scores,
        panels,
        bubbles,
        onomatopoeia,
        text_bubbles,
        text_free,
        rapid_lines,
        backend,
        detector_time_ms,
        ocr_fullpage_time_ms,
        rescue_time_ms,
        watermark_time_ms,
        rescued_crops_count,
        watermark_recovered_count,
        raw_ocr_lines_count,
    })
}

pub fn is_multiline_comic_blob(cb: &[[f32; 2]], rapid_boxes: &[Vec<[f32; 2]>], page_w: u32, page_h: u32) -> bool {
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

    overlapping_lines >= 2
}
