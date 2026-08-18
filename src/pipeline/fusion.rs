use image::{DynamicImage, GenericImageView};
use crate::ml::detect::ComicTextDetector;
use crate::ml::geometry::{box_iou_f32, box_iou_pts, box_to_xywh_f32, polygon_bounds};
use crate::ml::ocr::{OcrLine, RapidOcr};
use crate::ml::schemas::BoxRect;
use crate::ml::watermark::WatermarkRemover;
use crate::ml::detect::{clean_stray_ocr_artifacts, is_watermark_line, CHINESE_RE};

pub struct DetectionFusionResult {
    pub comic_boxes: Vec<Vec<[i32; 2]>>,
    pub comic_scores: Vec<f32>,
    pub rapid_lines: Vec<OcrLine>,
    pub backend: String,
}

pub fn fuse_detections(
    detector: &mut Option<ComicTextDetector>,
    ocr: &mut Option<RapidOcr>,
    watermark: &WatermarkRemover,
    img: &DynamicImage,
    source_lang: Option<&str>,
) -> DetectionFusionResult {
    let (page_w, page_h) = img.dimensions();

    // 1. ComicTextDetector Detection
    let mut comic_boxes: Vec<Vec<[i32; 2]>> = Vec::new();
    let mut comic_scores: Vec<f32> = Vec::new();
    let mut backend = "rapidocr-fallback".to_string();

    if let Some(ref mut det) = detector {
        if let Ok(res) = det.detect(img) {
            comic_boxes = res.boxes;
            comic_scores = res.scores;
            backend = res.backend;
        }
    }

    // 2. RapidOCR Full-Page Det + Rec
    let mut rapid_lines: Vec<OcrLine> = Vec::new();
    if let Some(ref mut o) = ocr {
        if let Ok(rl) = o.detect_and_recognize_tiled_with_lang(img, true, source_lang) {
            rapid_lines = rl;
        }
    }

    // 3. Fallback: RapidOCR isolated recognition for ComicTextDetector boxes
    if let Some(ref mut o) = ocr {
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

                if iou >= 0.20 || rl_contained || cb_covered || crate::ml::geometry::line_center_inside_box(&rl.polygon, &cb_rect) {
                    ocr_det_matched[idx] = true;

                    // If ComicTextDetector box is significantly wider or taller than RapidLine (e.g. ellipsis truncated on right or vertical line truncated)
                    // test if recognizing ComicBox yields full text (including ellipsis / full vertical onomatopoeia).
                    let is_wider = cb_w >= rw + 25 || (cb_w as f32) >= (rw as f32 * 1.25);
                    let is_taller = cb_h >= rh + 25 || (cb_h as f32) >= (rh as f32 * 1.25);
                    if is_wider || is_taller {
                        let pad_x = 15;
                        let pad_y = 10;
                        let cx = (cb_x - pad_x).max(0) as u32;
                        let cy = (cb_y - pad_y).max(0) as u32;
                        let cw = ((cb_w + pad_x * 2) as u32).min(w - cx);
                        let ch = ((cb_h + pad_y * 2) as u32).min(h - cy);
                        if cw >= 8 && ch >= 8 {
                            let crop = img.crop_imm(cx, cy, cw, ch);
                            if let Ok(Some(line_res)) = o.recognize_line_with_lang(&crop, source_lang) {
                                let clean_c = clean_stray_ocr_artifacts(&line_res.text);
                                let clean_chars = clean_c.chars().filter(|c| !c.is_whitespace()).count();
                                let rl_chars = rl.text.chars().filter(|c| !c.is_whitespace()).count();
                                if clean_chars > rl_chars || (clean_c.contains('…') && !rl.text.contains('…')) {
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
                            if let Ok(Some(crop_res)) = o.recognize_crop_with_lang(&crop, source_lang) {
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
                        } else if let Ok(Some(line_res)) = o.recognize_line_with_lang(&crop, source_lang) {
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

    DetectionFusionResult {
        comic_boxes,
        comic_scores,
        rapid_lines,
        backend,
    }
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
