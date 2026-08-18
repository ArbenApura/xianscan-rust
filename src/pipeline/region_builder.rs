use image::DynamicImage;
use crate::ml::detect::{
    clean_stray_ocr_artifacts, has_alphanumeric_characters, has_cjk_characters,
    is_pure_watermark_region, is_standalone_alphanumeric_without_cjk, CHINESE_RE,
};
use crate::ml::geometry::{
    box_iou, box_iou_pts, calculate_box_angle, calculate_box_angle_i32,
    line_center_inside_box, polygon_bounds,
};
use crate::ml::ocr::{OcrLine, RapidOcr};
use crate::ml::schemas::{BoxRect, Region};

pub fn build_regions(
    ocr: &mut Option<RapidOcr>,
    img: &DynamicImage,
    dedup_boxes: &[Vec<[f32; 2]>],
    order: &[usize],
    split_lines: &[OcrLine],
    page_w: u32,
    page_h: u32,
    is_cjk: bool,
    is_latin: bool,
    source_lang: Option<&str>,
) -> Vec<Region> {
    let mut regions: Vec<Region> = Vec::new();

    for &idx in order {
        let box_pts = &dedup_boxes[idx];
        let (bx, by, bw, bh) = crate::ml::geometry::box_to_xywh_f32(box_pts);
        let mut box_rect = BoxRect {
            x: bx.max(0.0) as i32,
            y: by.max(0.0) as i32,
            w: bw.max(1.0) as i32,
            h: bh.max(1.0) as i32,
        };

        let raw_matched: Vec<&OcrLine> = split_lines
            .iter()
            .filter(|l| line_center_inside_box(&l.polygon, &box_rect))
            .collect();

        let has_non_wm = raw_matched.iter().any(|l| !crate::ml::detect::is_watermark_line(&l.text) && !crate::ml::detect::is_watermark_line(&clean_stray_ocr_artifacts(&l.text)));
        let matched: Vec<&OcrLine> = if has_non_wm {
            raw_matched
                .into_iter()
                .filter(|l| !crate::ml::detect::is_watermark_line(&l.text) && !crate::ml::detect::is_watermark_line(&clean_stray_ocr_artifacts(&l.text)))
                .collect()
        } else {
            raw_matched
        };

        let mut refined_polys: Option<Vec<Vec<[i32; 2]>>> = None;
        let mut active_line_polys: Vec<Vec<[i32; 2]>> = Vec::new();

        let (text, confidence): (String, f32) = if !matched.is_empty() {
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

                    // Trailing phantom echo line (e.g. "这此" colliding with "这些……")
                    let is_echo_noise = is_cjk
                        && clean_m.chars().count() <= 3
                        && (overlap_ratio_m >= 0.40 || (my - oy).abs() <= 20)
                        && (mx - ox).abs() <= 25
                        && clean_m.chars().any(|c| clean_o.contains(c))
                        && other.score > m.score;

                    if (is_sub && (overlap_ratio_m >= 0.35 || iou >= 0.20))
                        || is_echo_noise
                        || (is_exact && (iou >= 0.30 || overlap_ratio_m >= 0.50) && (m.score < other.score || (m.score == other.score && m_area <= ow * oh)))
                        || (iou >= 0.70 && m.score < other.score)
                    {
                        is_dup = true;
                        break;
                    }
                }
                let is_ruby_sliver = if is_cjk {
                    let mut is_ruby = false;
                    let has_kanji = clean_m.chars().any(|c| ('\u{4e00}'..='\u{9fa5}').contains(&c));
                    for &other in &matched {
                        if std::ptr::eq(m, other) { continue; }
                        let (ox, oy, ow, oh) = polygon_bounds(&other.polygon);
                        let v_inter = (my + mh).min(oy + oh) - my.max(oy);
                        let v_ratio = v_inter.max(0) as f32 / mh.max(1) as f32;
                        let h_gap = (mx - (ox + ow)).abs().min((ox - (mx + mw)).abs());
                        let other_clean = clean_stray_ocr_artifacts(&other.text);
                        let other_has_kanji = other_clean.chars().any(|c| ('\u{4e00}'..='\u{9fa5}').contains(&c));

                        // Parallel vertical ruby column (Furigana): narrow line running beside main line with kanji
                        if v_ratio >= 0.45 && h_gap <= 28 && mw <= 30 && (mw as f32) <= (ow as f32 * 0.70) && (!has_kanji || m.score < 0.70) && other_has_kanji {
                            is_ruby = true;
                            break;
                        }
                        // Short horizontal ruby line
                        if v_ratio >= 0.50 && h_gap <= 18 && mw <= 25 && (mw as f32) <= (ow as f32 * 0.65) && clean_m.chars().count() <= 3 && !has_kanji {
                            is_ruby = true;
                            break;
                        }
                    }
                    is_ruby
                } else {
                    false
                };

                if !is_dup && !is_ruby_sliver {
                    filtered_matched.push(m);
                }
            }

            active_line_polys = filtered_matched.iter().map(|m| m.polygon.clone()).collect();

            let is_vert_cluster = {
                let vert_count = filtered_matched.iter().filter(|l| {
                    let (_, _, lw, lh) = polygon_bounds(&l.polygon);
                    lh >= (lw as f32 * 1.2) as i32
                }).count();
                vert_count * 2 >= filtered_matched.len() || (box_rect.h > (box_rect.w as f32 * 1.2) as i32 && is_cjk)
            };

            let mut sorted_matched = filtered_matched.clone();
            sorted_matched.sort_by(|a, b| {
                let (ax, ay, aw, ah) = polygon_bounds(&a.polygon);
                let (bx, by, bw, bh) = polygon_bounds(&b.polygon);
                let a_mid_x = ax + aw / 2;
                let b_mid_x = bx + bw / 2;
                let a_mid_y = ay + ah / 2;
                let b_mid_y = by + bh / 2;

                if is_vert_cluster {
                    let min_w = aw.min(bw).max(8);
                    let x_close = (a_mid_x - b_mid_x).abs() <= (min_w * 2 / 5).max(6);
                    if x_close {
                        ay.cmp(&by) // Within vertical column: top-to-bottom
                    } else {
                        bx.cmp(&ax) // Multi-column vertical Japanese/CJK: Right-to-Left (descending X)
                    }
                } else {
                    let y_close = (a_mid_y - b_mid_y).abs() <= 8;
                    if y_close {
                        ax.cmp(&bx) // Horizontal: same row left-to-right
                    } else {
                        ay.cmp(&by) // Horizontal: rows top-to-bottom
                    }
                }
            });

            let mut row_grouped_texts: Vec<String> = Vec::new();
            let mut last_mid_y: Option<i32> = None;

            for (m_idx, m) in sorted_matched.iter().enumerate() {
                let (_, my, _, mh) = polygon_bounds(&m.polygon);
                let mid_y = my + mh / 2;
                let clean_t = clean_stray_ocr_artifacts(&m.text);
                if clean_t.trim().is_empty() {
                    continue;
                }

                let is_same_row = if let Some(prev_y_val) = last_mid_y {
                    if (mid_y - prev_y_val).abs() <= 8 {
                        let prev_line = if m_idx > 0 { Some(&sorted_matched[m_idx - 1]) } else { None };
                        if let Some(pl) = prev_line {
                            let (plx, _, plw, _) = polygon_bounds(&pl.polygon);
                            let (mx, _, mw, _) = polygon_bounds(&m.polygon);
                            (plx + plw).min(mx + mw) - plx.max(mx) <= 5
                        } else {
                            true
                        }
                    } else {
                        false
                    }
                } else {
                    false
                };

                match last_mid_y {
                    Some(prev_y) if (mid_y - prev_y).abs() <= 8 && is_same_row => {
                        if let Some(last_row) = row_grouped_texts.last_mut() {
                            let merged = if *last_row == clean_t || last_row.contains(&clean_t) {
                                last_row.clone()
                            } else if clean_t.contains(last_row.as_str()) {
                                clean_t.clone()
                            } else {
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
                                } else if last_row.ends_with(['！', '!', '？', '?', '。']) && !clean_t.ends_with(['！', '!', '？', '?', '。']) {
                                    format!("{}\n{}", last_row.trim_end(), clean_t.trim_start())
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
            let mut valid_angles: Vec<f32> = matched
                .iter()
                .map(|l| calculate_box_angle_i32(&l.polygon))
                .filter(|a| a.abs() >= 1.5)
                .collect();
            let box_ang = calculate_box_angle(box_pts);
            if box_ang.abs() >= 1.5 {
                valid_angles.push(box_ang);
            }
            valid_angles.sort_by(|a, b| a.total_cmp(b));
            let median_angle = if !valid_angles.is_empty() {
                valid_angles[valid_angles.len() / 2]
            } else {
                0.0
            };

            let has_mixed_orientations = {
                let has_vert = matched.iter().any(|l| {
                    let (_, _, lw, lh) = polygon_bounds(&l.polygon);
                    lh >= (lw as f32 * 1.5) as i32 && lh >= 35
                });
                let has_horiz = matched.iter().any(|l| {
                    let (_, _, lw, lh) = polygon_bounds(&l.polygon);
                    lw >= (lh as f32 * 1.5) as i32 && lw >= 35
                });
                has_vert && has_horiz
            };

            let is_uneven_multiline = {
                if filtered_matched.len() >= 3 && filtered_matched.len() <= 6 {
                    let line_lens: Vec<usize> = row_grouped_texts.iter().map(|t| t.chars().count()).collect();
                    let max_l = line_lens.iter().cloned().max().unwrap_or(0);
                    let min_l = line_lens.iter().cloned().min().unwrap_or(0);
                    max_l >= 5 && (max_l - min_l) >= 2
                } else {
                    false
                }
            };
            let is_clean_multiline = (filtered_matched.len() >= 3 && avg_score >= 0.65)
                || (is_vert_cluster && filtered_matched.len() >= 2 && avg_score >= 0.65);
            let is_short_line_in_bubble = (filtered_matched.len() <= 2 && box_rect.w >= 30 && box_rect.h >= 18)
                || (box_rect.h >= (box_rect.w as f32 * 1.5) as i32 && box_rect.h >= 40);
            let needs_crop_refinement = !is_clean_multiline && (is_short_line_in_bubble
                || is_uneven_multiline
                || has_mixed_orientations
                || avg_score < 0.70);

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

                let max_top_allowed = dedup_boxes.iter()
                    .map(|b| crate::ml::geometry::box_to_xywh_f32(b))
                    .filter(|&(bx, by, bw, bh)| {
                        let b_x0 = bx as i32;
                        let b_x1 = (bx + bw) as i32;
                        let b_y1 = (by + bh) as i32;
                        let rx_overlap = b_x1.min(box_rect.x + box_rect.w) - b_x0.max(box_rect.x);
                        rx_overlap > 0 && b_y1 <= box_rect.y
                    })
                    .map(|(_bx, by, _bw, bh)| (box_rect.y - ((by + bh) as i32)).max(0) as u32)
                    .min()
                    .unwrap_or(100);

                let max_bot_allowed = dedup_boxes.iter()
                    .map(|b| crate::ml::geometry::box_to_xywh_f32(b))
                    .filter(|&(bx, by, bw, _bh)| {
                        let b_x0 = bx as i32;
                        let b_x1 = (bx + bw) as i32;
                        let b_y0 = by as i32;
                        let rx_overlap = b_x1.min(box_rect.x + box_rect.w) - b_x0.max(box_rect.x);
                        rx_overlap > 0 && b_y0 >= box_rect.y + box_rect.h
                    })
                    .map(|(_bx, by, _bw, _bh)| ((by as i32) - (box_rect.y + box_rect.h)).max(0) as u32)
                    .min()
                    .unwrap_or(100);

                let pad_top = if max_top_allowed < 50 {
                    ((if has_top_headroom { 45 } else { 15 }).min(max_top_allowed.max(4) / 2).max(4)) as i32
                } else {
                    (if has_top_headroom { 45 } else { 15 }) as i32
                };
                let pad_bot = if max_bot_allowed < 50 {
                    ((if has_bot_footroom { 40 } else { 15 }).min(max_bot_allowed.max(4) / 2).max(4)) as i32
                } else {
                    (if has_bot_footroom { 40 } else { 15 }) as i32
                };
                let pad_x = (box_rect.w / 4).clamp(15, 30);

                let crop_x = (box_rect.x - pad_x).max(0) as u32;
                let crop_y = (box_rect.y - pad_top).max(0) as u32;
                let crop_w = ((box_rect.w + pad_x * 2) as u32).min(page_w - crop_x);
                let crop_h = ((box_rect.h + pad_top + pad_bot) as u32).min(page_h - crop_y);

                if crop_w >= 16 && crop_h >= 16 {
                    let crop = img.crop_imm(crop_x, crop_y, crop_w, crop_h);
                    if let Some(ref mut o) = ocr {
                        if let Ok(Some(res)) = o.recognize_crop_with_lang(&crop, source_lang) {
                            let initial_lines: Vec<_> = res.lines.iter().filter(|(_, txt, _)| {
                                let cl = clean_stray_ocr_artifacts(txt);
                                if is_cjk && is_standalone_alphanumeric_without_cjk(&cl) {
                                    let upper = cl.to_ascii_uppercase();
                                    ["PK", "HP", "MP", "EXP", "LV", "VIP", "BOSS", "NPC", "KO", "BUFF", "CD", "MISS", "CRIT", "ATK", "DEF", "ID", "OK", "NO", "VS", "RPG", "3D", "2D", "MM", "CM", "KG"].contains(&upper.as_str())
                                } else {
                                    true
                                }
                            }).cloned().collect();

                            let mut clean_lines: Vec<_> = Vec::new();
                            for (c_idx, (c_poly, c_txt, c_score)) in initial_lines.iter().enumerate() {
                                let clean_c = clean_stray_ocr_artifacts(c_txt);
                                if clean_c.trim().is_empty() {
                                    continue;
                                }
                                let (cx, cy, cw, ch) = polygon_bounds(c_poly);
                                let has_c_kanji = clean_c.chars().any(|c| ('\u{4e00}'..='\u{9fa5}').contains(&c));
                                let mut is_crop_ruby = false;
                                for (o_idx, (o_poly, o_txt, _)) in initial_lines.iter().enumerate() {
                                    if c_idx == o_idx { continue; }
                                    let (ox, oy, ow, oh) = polygon_bounds(o_poly);
                                    let v_inter = (cy + ch).min(oy + oh) - cy.max(oy);
                                    let v_ratio = v_inter.max(0) as f32 / ch.max(1) as f32;
                                    let h_gap = (cx - (ox + ow)).abs().min((ox - (cx + cw)).abs());
                                    let clean_o = clean_stray_ocr_artifacts(o_txt);
                                    let has_o_kanji = clean_o.chars().any(|c| ('\u{4e00}'..='\u{9fa5}').contains(&c));

                                    if is_cjk && v_ratio >= 0.45 && h_gap <= 28 && cw <= 30 && (cw as f32) <= (ow as f32 * 0.70) && (!has_c_kanji || *c_score < 0.70) && has_o_kanji {
                                        is_crop_ruby = true;
                                        break;
                                    }
                                }
                                if !is_crop_ruby {
                                    // Ensure crop line belongs to this region and didn't bleed from an adjacent speech bubble
                                    let global_cx = crop_x as i32 + cx + cw / 2;
                                    let global_cy = crop_y as i32 + cy + ch / 2;
                                    let inside_x = global_cx >= (box_rect.x - 20) && global_cx <= (box_rect.x + box_rect.w + 20);
                                    let inside_y = global_cy >= (box_rect.y - 20) && global_cy <= (box_rect.y + box_rect.h + 20);
                                    if inside_x && inside_y {
                                        clean_lines.push((c_poly.clone(), c_txt.clone(), *c_score));
                                    }
                                }
                            }

                            if clean_lines.len() >= 2 {
                                let rad = median_angle.to_radians();
                                let cos_a = rad.cos();
                                let sin_a = rad.sin();
                                let rot_y = |x: i32, y: i32| -> f32 {
                                    -(x as f32) * sin_a + (y as f32) * cos_a
                                };
                                let rot_x = |x: i32, y: i32| -> f32 {
                                    (x as f32) * cos_a + (y as f32) * sin_a
                                };
                                let is_crop_vert_cluster = {
                                    let vert_count = clean_lines.iter().filter(|(p, _, _)| {
                                        let (_, _, lw, lh) = polygon_bounds(p);
                                        lh >= (lw as f32 * 1.2) as i32
                                    }).count();
                                    vert_count * 2 >= clean_lines.len() || (crop_h > (crop_w as f32 * 1.2) as u32 && is_cjk)
                                };

                                clean_lines.sort_by(|(pts_a, _, _), (pts_b, _, _)| {
                                    let (ax, ay, aw, ah) = polygon_bounds(pts_a);
                                    let (bx, by, bw, bh) = polygon_bounds(pts_b);
                                    let a_mid_x = ax + aw / 2;
                                    let b_mid_x = bx + bw / 2;
                                    let a_mid_y = ay + ah / 2;
                                    let b_mid_y = by + bh / 2;

                                    let a_rot_y = rot_y(a_mid_x, a_mid_y);
                                    let b_rot_y = rot_y(b_mid_x, b_mid_y);
                                    let a_rot_x = rot_x(a_mid_x, a_mid_y);
                                    let b_rot_x = rot_x(b_mid_x, b_mid_y);

                                    if is_crop_vert_cluster {
                                        let min_w = (aw.min(bw) as f32).max(8.0);
                                        let x_close = (a_mid_x - b_mid_x).abs() as f32 <= (min_w * 2.0 / 5.0).max(6.0);
                                        if x_close {
                                            a_rot_y.total_cmp(&b_rot_y)
                                        } else {
                                            b_rot_x.total_cmp(&a_rot_x) // Right to Left
                                        }
                                    } else {
                                        let min_h = (ah.min(bh) as f32).max(10.0);
                                        let y_close = (a_rot_y - b_rot_y).abs() <= (min_h * 0.40).max(6.0);
                                        if y_close {
                                            a_rot_x.total_cmp(&b_rot_x)
                                        } else {
                                            a_rot_y.total_cmp(&b_rot_y)
                                        }
                                    }
                                });

                                let mut grouped_lines: Vec<(Vec<[i32; 2]>, String, f32)> = Vec::new();
                                for (pts, txt, score) in clean_lines {
                                    let (x, y, w, h) = polygon_bounds(&pts);
                                    let mid_x = x + w / 2;
                                    let mid_y = y + h / 2;
                                    let curr_rot_y = rot_y(mid_x, mid_y);

                                    if let Some((last_pts, last_txt, last_score)) = grouped_lines.last_mut() {
                                        let (lx, ly, lw, lh) = polygon_bounds(last_pts);
                                        let last_mid_x = lx + lw / 2;
                                        let last_mid_y = ly + lh / 2;
                                        let last_rot_y = rot_y(last_mid_x, last_mid_y);
                                        let min_h = (lh.min(h) as f32).max(10.0);
                                        let same_row = (curr_rot_y - last_rot_y).abs() <= (min_h * 0.40).max(6.0);
                                        if same_row {
                                            let mut combined_pts = last_pts.clone();
                                            combined_pts.extend(pts);
                                            *last_pts = combined_pts;
                                            *last_txt = clean_stray_ocr_artifacts(&format!("{}{}", last_txt.trim_end(), txt.trim_start()));
                                            *last_score = (*last_score + score) / 2.0;
                                            continue;
                                        }
                                    }
                                    grouped_lines.push((pts, txt, score));
                                }

                                let mut filtered = Vec::new();
                                for (i, (pts, txt, score)) in grouped_lines.iter().enumerate() {
                                    if i == 0 {
                                        filtered.push((pts.clone(), txt.clone(), *score));
                                        continue;
                                    }
                                    let prev_pts = &filtered.last().unwrap().0;
                                    let prev_txt = &filtered.last().unwrap().1;
                                    let (_px, prev_min_y, _pw, prev_h) = polygon_bounds(prev_pts);
                                    let prev_max_y = prev_min_y + prev_h;
                                    let (_cx, curr_min_y, _cw, _ch) = polygon_bounds(pts);
                                    let v_gap = curr_min_y - prev_max_y;

                                    let prev_has_term = prev_txt.ends_with('？') || prev_txt.ends_with('?') || prev_txt.ends_with('！') || prev_txt.ends_with('!') || prev_txt.ends_with('。');
                                    if prev_has_term && (prev_txt.chars().count() >= 4 || filtered.len() >= 2) && v_gap > (prev_h * 3 / 4).max(12) {
                                        break;
                                    }
                                    if v_gap > (prev_h * 6 / 4).max(35) {
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
                            let clean_line_count = clean_res_text.split('\n').filter(|s| !s.trim().is_empty()).count();
                            let orig_line_count = best_text.split('\n').filter(|s| !s.trim().is_empty()).count();
                            let is_text_accepted = clean_chars > orig_chars
                                || (clean_chars == orig_chars && clean_line_count >= orig_line_count)
                                || (res.score > avg_score && clean_chars >= (orig_chars * 4 / 5).max(1) && clean_line_count >= orig_line_count)
                                || (has_mixed_orientations && clean_chars >= 2);
                            if CHINESE_RE.is_match(&clean_res_text) && is_text_accepted {
                                best_text = clean_res_text;
                                best_score = res.score;
                                let line_polys: Vec<Vec<[i32; 2]>> = clean_lines.iter().map(|(p, _, _)| {
                                    let (px, py, pw, ph) = polygon_bounds(p);
                                    vec![
                                        [crop_x as i32 + px, crop_y as i32 + py],
                                        [crop_x as i32 + px + pw, crop_y as i32 + py],
                                        [crop_x as i32 + px + pw, crop_y as i32 + py + ph],
                                        [crop_x as i32 + px, crop_y as i32 + py + ph],
                                    ]
                                }).collect();
                                if !line_polys.is_empty() {
                                    refined_polys = Some(line_polys);
                                }
                            }
                        }
                    }
                }
            }

            // FOR NARROW VERTICAL BUBBLES (H >= W * 1.8), TEST DIRECT FULL LINE RECOGNITION
            if (box_rect.h >= (box_rect.w as f32 * 1.8) as i32) && box_rect.w >= 10 && box_rect.h >= 20 {
                let tight_x = (box_rect.x - 5).max(0) as u32;
                let tight_y = (box_rect.y - 10).max(0) as u32;
                let tight_w = ((box_rect.w + 10) as u32).min(page_w - tight_x);
                let tight_h = ((box_rect.h + 20) as u32).min(page_h - tight_y);
                if tight_w >= 8 && tight_h >= 16 {
                    let tight_crop = img.crop_imm(tight_x, tight_y, tight_w, tight_h);
                    if let Some(ref mut o) = ocr {
                        if let Ok(Some(full_line_res)) = o.recognize_line_with_lang(&tight_crop, source_lang) {
                            let clean_full = clean_stray_ocr_artifacts(&full_line_res.text);
                            let clean_full_chars = clean_full.chars().filter(|c| !c.is_whitespace()).count();
                            let best_chars = best_text.chars().filter(|c| !c.is_whitespace()).count();
                            if CHINESE_RE.is_match(&clean_full) && (clean_full_chars > best_chars || (clean_full_chars == best_chars && full_line_res.score > best_score)) {
                                let chars_vec: Vec<String> = clean_full.chars().map(|c| c.to_string()).collect();
                                best_text = chars_vec.join("\n");
                                best_score = full_line_res.score;
                            }
                        }
                    }
                }
            }

            (best_text, best_score)
        } else {
            // CROP AND RECOGNIZE LINE
            let crop_x = box_rect.x.clamp(0, page_w as i32 - 1) as u32;
            let crop_y = box_rect.y.clamp(0, page_h as i32 - 1) as u32;
            let crop_w = (box_rect.w as u32).min(page_w - crop_x);
            let crop_h = (box_rect.h as u32).min(page_h - crop_y);

            let mut crop_text = String::new();
            let mut crop_score = 0.85_f32;

            if crop_w >= 4 && crop_h >= 4 {
                let crop = img.crop_imm(crop_x, crop_y, crop_w, crop_h);
                if let Some(ref mut o) = ocr {
                    if let Ok(Some(res)) = o.recognize_crop_with_lang(&crop, source_lang) {
                        crop_text = res.text;
                        crop_score = res.score;
                        let line_polys: Vec<Vec<[i32; 2]>> = res.lines.iter().map(|(p, _, _)| {
                            p.iter().map(|pt| [crop_x as i32 + pt[0], crop_y as i32 + pt[1]]).collect()
                        }).collect();
                        if !line_polys.is_empty() {
                            refined_polys = Some(line_polys);
                        }
                    } else if let Ok(Some(res)) = o.recognize_line_with_lang(&crop, source_lang) {
                        crop_text = res.text;
                        crop_score = res.score;
                    }
                }
            }
            (crop_text, crop_score)
        };

        let mut cleaned = clean_stray_ocr_artifacts(&text);
        cleaned = crate::ml::detect::filter_text_by_source_lang(&cleaned, source_lang).trim().to_string();
        if cleaned.trim().is_empty() || is_pure_watermark_region(&cleaned) {
            continue;
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

        // ISOLATED SINGLE-CHARACTER NON-SFX ARTWORK / WATERMARK HALLUCINATION FILTER
        let sfx_onomatopoeia = "啊呀哇嗷嘶呜呼哈噗轰咚咳啪砰咔唰嘭哒嗒踏铛铮刷咻嗖哧嚓哐咕嗡吼鸣飒吱咯嘎喳沙えエおオあアいイうウ";
        let char_count = cleaned.chars().filter(|c| !c.is_whitespace()).count();
        let has_cyrillic = crate::ml::detect::CYRILLIC_CHAR_RE.is_match(&cleaned);
        let has_thai = crate::ml::detect::THAI_CHAR_RE.is_match(&cleaned);
        let has_latin_alnum = crate::ml::detect::has_alphanumeric_characters(&cleaned);
        let cjk_count = cleaned.chars().filter(|c| CHINESE_RE.is_match(&c.to_string()) && !c.is_ascii_punctuation() && *c != '！' && *c != '!' && *c != '？' && *c != '?' && *c != '…' && *c != '~').count();

        if is_cjk && (char_count <= 1 || (cjk_count <= 1 && (box_rect.w <= 50 || box_rect.h <= 50)))
            && !cleaned.chars().any(|c| sfx_onomatopoeia.contains(c))
            && confidence < 0.73
        {
            continue;
        }

        if !is_cjk && (char_count <= 1 && !has_cyrillic && !has_thai && !has_latin_alnum)
            && confidence < 0.73
        {
            continue;
        }

        // CALCULATE ROTATION ANGLE DIRECTLY FROM OCR LINE ORIENTATION
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

        // STANDARD MULTI-LINE SPEECH BUBBLES SNAP TO 0.0 UNLESS UNIFORMLY TILTED
        if matched.len() >= 3 {
            let all_tilted = valid_angles.len() >= 2 && valid_angles.iter().all(|a| a.abs() >= 8.0);
            if !all_tilted && box_ang.abs() < 6.0 {
                angle = 0.0;
            }
        }

        // DYNAMIC GLYPH ENVELOPE BOUNDARY REFINEMENT
        let active_polys: Vec<&[[i32; 2]]> = if let Some(ref rps) = refined_polys {
            rps.iter().map(|p| p.as_slice()).collect()
        } else if !active_line_polys.is_empty() {
            active_line_polys.iter().map(|p| p.as_slice()).collect()
        } else {
            matched.iter().map(|m| m.polygon.as_slice()).collect()
        };

        if !active_polys.is_empty() {
            let mut min_mx = i32::MAX;
            let mut min_my = i32::MAX;
            let mut max_mx = i32::MIN;
            let mut max_my = i32::MIN;
            for poly in &active_polys {
                let (px, py, pw, ph) = polygon_bounds(poly);
                min_mx = min_mx.min(px);
                min_my = min_my.min(py);
                max_mx = max_mx.max(px + pw);
                max_my = max_my.max(py + ph);
            }

            if max_mx > min_mx && max_my > min_my {
                let total_w = max_mx - min_mx;
                let total_h = max_my - min_my;
                let line_count = active_polys.len().max(1) as i32;
                let (est_line_dim, has_punct) = if vertical {
                    (total_w / line_count, cleaned.contains('！') || cleaned.contains('!') || cleaned.contains('？') || cleaned.contains('?') || cleaned.contains('…') || cleaned.contains('~') || cleaned.contains('―') || cleaned.contains('ー'))
                } else {
                    (total_h / line_count, cleaned.contains('！') || cleaned.contains('!') || cleaned.contains('？') || cleaned.contains('?') || cleaned.contains('…') || cleaned.contains('~'))
                };

                let (margin_x, margin_y) = if vertical {
                    let my = if has_punct { (est_line_dim / 3).clamp(10, 22) } else { (est_line_dim / 4).clamp(4, 12) };
                    let mx = (est_line_dim / 5).clamp(3, 8);
                    (mx, my)
                } else {
                    let mx = if has_punct { (est_line_dim / 3).clamp(10, 22) } else { (est_line_dim / 4).clamp(4, 12) };
                    let my = (est_line_dim / 5).clamp(3, 8);
                    (mx, my)
                };

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

        let is_stray_latin = is_cjk && !CHINESE_RE.is_match(&cleaned) && confidence <= 0.65 && (box_rect.h <= 18 || box_rect.w <= 50);
        let is_single_exclaim = (cleaned == "！" || cleaned == "!") && (matched.is_empty() || confidence < 0.70 || box_rect.h >= (box_rect.w * 2));
        let is_stray_mm = cleaned.trim().eq_ignore_ascii_case("mm") && confidence < 0.70;
        let is_stray_dots = (cleaned == "……" || cleaned == "...") && (box_rect.w <= 75 && box_rect.h <= 65);

        let is_isolated_alphanumeric_in_cjk = is_cjk && is_standalone_alphanumeric_without_cjk(&cleaned) && {
            let upper = cleaned.to_ascii_uppercase();
            let is_common_acronym = ["PK", "HP", "MP", "EXP", "LV", "VIP", "BOSS", "NPC", "KO", "BUFF", "CD", "MISS", "CRIT", "ATK", "DEF", "ID", "OK", "NO", "VS", "RPG", "3D", "2D", "MM", "CM", "KG"].contains(&upper.as_str());
            !is_common_acronym && (confidence < 0.75 || cleaned.chars().any(|c| c.is_ascii_punctuation()) || cleaned.chars().any(|c| c.is_ascii_digit()))
        };
        let is_cjk_hallucination_in_latin = is_latin && (has_cjk_characters(&cleaned) && !has_alphanumeric_characters(&cleaned));
        let is_stray_cross = (cleaned.trim() == "十" || cleaned.trim() == "+" || cleaned.trim() == "×" || cleaned.trim() == "X" || cleaned.trim() == "x") && (box_rect.w <= 35 && box_rect.h <= 35);

        if is_stray_latin || is_single_exclaim || is_stray_mm || is_stray_dots || is_isolated_alphanumeric_in_cjk || is_cjk_hallucination_in_latin || is_stray_cross {
            continue;
        }

        // EXPAND HORIZONTAL SFX PROLONGED STROKE TAILS IF THE BRIGHT STROKE CONTINUES PAST DETECTED BOX EDGE
        let extends_sfx = cleaned.ends_with('—') || cleaned.ends_with('―') || cleaned.ends_with('-') || cleaned.ends_with('～') || cleaned.ends_with('~');

        if extends_sfx && !vertical {
            let right_limit = (box_rect.x + box_rect.w) as u32;
            let max_scan_x = (right_limit + 60).min(page_w);
            let y_start = (box_rect.y.max(0) as u32).min(page_h - 1);
            let y_end = ((box_rect.y + box_rect.h).max(0) as u32).min(page_h);

            let rgb = img.to_rgb8();
            let mut last_valid_x = right_limit;

            for curr_x in right_limit..max_scan_x {
                let mut has_bright_sfx = false;
                for curr_y in y_start..y_end {
                    let p = rgb.get_pixel(curr_x, curr_y);
                    let b = (p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000;
                    if b >= 180 {
                        has_bright_sfx = true;
                        break;
                    }
                }
                if has_bright_sfx {
                    last_valid_x = curr_x + 4;
                } else if curr_x > last_valid_x + 8 {
                    break;
                }
            }

            if last_valid_x > right_limit {
                box_rect.w = (last_valid_x - box_rect.x as u32).min(page_w - box_rect.x as u32) as i32;
            }
        }

        // TRAILING ELLIPSIS ENCLOSURE: MERGE ADJACENT SPLIT ELLIPSIS LINES
        if cleaned.ends_with("……") || cleaned.ends_with("...") {
            for line in split_lines {
                if line.text.contains('…') || line.text.contains("...") || line.text.contains('·') {
                    let (lx, ly, lw, lh) = polygon_bounds(&line.polygon);
                    let v_overlap = (ly + lh).min(box_rect.y + box_rect.h) - ly.max(box_rect.y);
                    if v_overlap > 0 && lx >= box_rect.x && (lx + lw) > (box_rect.x + box_rect.w) && (lx - (box_rect.x + box_rect.w)) <= 30 {
                        box_rect.w = (lx + lw + 4) - box_rect.x;
                    }
                }
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
                    let all_chars_in_existing = !meaningful_chars.is_empty() && meaningful_chars.iter().all(|&c| existing.text.contains(c));

                    let lines: Vec<&str> = cleaned.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
                    let has_substantial_lines = lines.iter().any(|l| l.chars().count() >= 2);
                    let all_lines_in_existing = has_substantial_lines && lines.iter().all(|l| {
                        let cjk_only: String = l.chars().filter(|c| CHINESE_RE.is_match(&c.to_string()) || c.is_alphanumeric()).collect();
                        if cjk_only.chars().count() <= 1 {
                            true
                        } else {
                            existing.text.contains(&cjk_only) || existing.text.contains(*l)
                        }
                    });

                    meaningful_chars.is_empty() || all_chars_in_existing || all_lines_in_existing
                } else {
                    false
                }
            };

            let is_reverse_suffix_echo = {
                let overlap_y_ratio = inter_y.max(0) as f32 / box_rect.h.min(existing.box_.h).max(1) as f32;
                if overlap_y_ratio >= 0.70 && inter_x > 0 {
                    let ex_meaningful: Vec<char> = existing.text
                        .chars()
                        .filter(|c| c.is_alphanumeric() || (!c.is_ascii_punctuation() && *c != '…' && *c != '·' && *c != '—' && *c != '～'))
                        .collect();
                    let all_ex_chars_in_cur = !ex_meaningful.is_empty() && ex_meaningful.iter().all(|&c| cleaned.contains(c));

                    let ex_lines: Vec<&str> = existing.text.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
                    let has_substantial_lines = ex_lines.iter().any(|l| l.chars().count() >= 2);
                    let all_ex_lines_in_cur = has_substantial_lines && ex_lines.iter().all(|l| {
                        let cjk_only: String = l.chars().filter(|c| CHINESE_RE.is_match(&c.to_string()) || c.is_alphanumeric()).collect();
                        if cjk_only.chars().count() <= 1 {
                            true
                        } else {
                            cleaned.contains(&cjk_only) || cleaned.contains(*l)
                        }
                    });

                    ex_meaningful.is_empty() || all_ex_chars_in_cur || all_ex_lines_in_cur
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

            let x_ratio_inter = inter_x.max(0) as f32 / box_rect.w.min(existing.box_.w).max(1) as f32;
            let y_ratio_inter = inter_y.max(0) as f32 / box_rect.h.min(existing.box_.h).max(1) as f32;
            let is_contained_subtext = is_subtext && x_ratio_inter >= 0.50 && y_ratio_inter >= 0.30;
            let is_same_bubble_vertical_chain = {
                let (top_txt, bot_txt) = if box_rect.y >= existing.box_.y {
                    (existing.text.trim(), cleaned.trim())
                } else {
                    (cleaned.trim(), existing.text.trim())
                };
                let top_lines = top_txt.lines().filter(|s| !s.trim().is_empty()).count();
                let bot_lines = bot_txt.lines().filter(|s| !s.trim().is_empty()).count();
                let top_has_term = top_txt.ends_with(['！', '!', '？', '?', '。', '…', '~', '～']);

                // Complete multi-line speech bubbles (>= 2 lines) or single utterances ending with terminal punct must not merge
                if top_has_term || top_lines >= 2 || bot_lines >= 2 {
                    false
                } else {
                    let v_gap = if box_rect.y >= existing.box_.y {
                        box_rect.y - (existing.box_.y + existing.box_.h)
                    } else {
                        existing.box_.y - (box_rect.y + box_rect.h)
                    };
                    let x_lo = box_rect.x.max(existing.box_.x);
                    let x_hi = (box_rect.x + box_rect.w).min(existing.box_.x + existing.box_.w);
                    let x_ol = x_hi - x_lo;
                    let min_w = box_rect.w.min(existing.box_.w);
                    let avg_h = (box_rect.h + existing.box_.h) / 2;
                    x_ol >= min_w * 3 / 5 && v_gap <= avg_h * 2 / 5 && v_gap >= -10 && (box_rect.w.max(existing.box_.w) <= 300)
                }
            };

            let is_overlapping_sliding_tile = {
                let cur_chars: Vec<char> = cleaned.chars().filter(|c| !c.is_whitespace()).collect();
                let ex_chars: Vec<char> = existing.text.chars().filter(|c| !c.is_whitespace()).collect();
                let cur_prefix: String = cur_chars.iter().take(4).collect();
                let ex_suffix: String = if ex_chars.len() >= 4 {
                    ex_chars[ex_chars.len() - 4..].iter().collect()
                } else {
                    ex_chars.iter().collect()
                };
                let cur_str: String = cur_chars.iter().collect();
                let ex_str: String = ex_chars.iter().collect();

                let has_shared_substring = (cur_chars.len() >= 3 && !cur_prefix.is_empty() && ex_str.contains(&cur_prefix))
                    || (ex_chars.len() >= 3 && !ex_suffix.is_empty() && cur_str.contains(&ex_suffix))
                    || (ex_chars.len() >= 3 && cur_str.contains(&ex_str))
                    || (cur_chars.len() >= 3 && ex_str.contains(&cur_str));
                let x_lo = box_rect.x.max(existing.box_.x);
                let x_hi = (box_rect.x + box_rect.w).min(existing.box_.x + existing.box_.w);
                let x_ol = x_hi - x_lo;
                let min_w = box_rect.w.min(existing.box_.w);
                let h_overlap_ratio = x_ol as f32 / min_w.max(1) as f32;
                let v_gap = if box_rect.y >= existing.box_.y {
                    box_rect.y - (existing.box_.y + existing.box_.h)
                } else {
                    existing.box_.y - (box_rect.y + box_rect.h)
                };
                has_shared_substring && h_overlap_ratio >= 0.45 && v_gap <= 40 && v_gap >= -80
            };

            let is_adjacent_vertical_bubble_split = {
                let top_has_bang_or_question = if box_rect.y >= existing.box_.y {
                    existing.text.trim().ends_with(['！', '!', '？', '?'])
                } else {
                    cleaned.trim().ends_with(['！', '!', '？', '?'])
                };
                if top_has_bang_or_question {
                    false
                } else {
                    let x_lo = box_rect.x.max(existing.box_.x);
                    let x_hi = (box_rect.x + box_rect.w).min(existing.box_.x + existing.box_.w);
                    let x_ol = x_hi - x_lo;
                    let min_w = box_rect.w.min(existing.box_.w);
                    let h_overlap_ratio = x_ol as f32 / min_w.max(1) as f32;
                    let v_gap = if box_rect.y >= existing.box_.y {
                        box_rect.y - (existing.box_.y + existing.box_.h)
                    } else {
                        existing.box_.y - (box_rect.y + box_rect.h)
                    };
                    h_overlap_ratio >= 0.70 && v_gap <= 12 && v_gap >= -50 && (box_rect.w.max(existing.box_.w) <= 300)
                }
            };

            if (existing.text == cleaned && iou >= 0.25)
                || iou >= 0.55
                || (is_subtext && (overlap_self >= 0.60 || overlap_ex >= 0.60))
                || is_contained_subtext
                || is_same_bubble_vertical_chain
                || is_overlapping_sliding_tile
                || is_adjacent_vertical_bubble_split
                || is_colliding
                || is_suffix_echo
                || is_reverse_suffix_echo
                || is_shared_bubble_fragment
            {
                let cur_chars = cleaned.chars().filter(|c| !c.is_whitespace()).count();
                let ex_chars = existing.text.chars().filter(|c| !c.is_whitespace()).count();
                if cur_chars > ex_chars || is_shared_bubble_fragment || is_same_bubble_vertical_chain || is_overlapping_sliding_tile || is_adjacent_vertical_bubble_split {
                    replace_idx = Some(idx);
                }
                is_dup_region = true;
                break;
            }
        }

        if let Some(r_idx) = replace_idx {
            let ex = &regions[r_idx];
            let mx = ex.box_.x.min(box_rect.x);
            let my = ex.box_.y.min(box_rect.y);
            let mx2 = (ex.box_.x + ex.box_.w).max(box_rect.x + box_rect.w);
            let my2 = (ex.box_.y + ex.box_.h).max(box_rect.y + box_rect.h);

            let pad_x = 25;
            let pad_y = 20;
            let crop_x = (mx - pad_x).max(0) as u32;
            let crop_y = (my - pad_y).max(0) as u32;
            let crop_w = ((mx2 - mx + pad_x * 2) as u32).min(page_w - crop_x);
            let crop_h = ((my2 - my + pad_y * 2) as u32).min(page_h - crop_y);

            let ex_clean = ex.text.trim();
            let cur_clean = cleaned.trim();
            let ex_compact: String = ex_clean.chars().filter(|c| !c.is_whitespace()).collect();
            let cur_compact: String = cur_clean.chars().filter(|c| !c.is_whitespace()).collect();

            let mut combined_lines: Vec<&str> = Vec::new();
            for l in ex_clean.lines().chain(cur_clean.lines()) {
                let tr = l.trim();
                if !tr.is_empty() {
                    let is_sub = combined_lines.iter().any(|existing| existing.contains(tr));
                    if !is_sub {
                        combined_lines.push(tr);
                    }
                }
            }

            let fallback_text = if cur_compact.contains(&ex_compact) || ex_compact.is_empty() {
                cleaned.clone()
            } else if ex_compact.contains(&cur_compact) || cur_compact.is_empty() {
                ex.text.clone()
            } else {
                combined_lines.join("\n")
            };

            let total_chars = if cur_compact.contains(&ex_compact) {
                cleaned.chars().count()
            } else if ex_compact.contains(&cur_compact) {
                ex.text.chars().count()
            } else {
                ex.text.chars().count() + cleaned.chars().count()
            };

            let mut unified_text = None;
            if crop_w >= 16 && crop_h >= 16 {
                let crop = img.crop_imm(crop_x, crop_y, crop_w, crop_h);
                if let Some(ref mut o) = ocr {
                    if let Ok(Some(res)) = o.recognize_crop_with_lang(&crop, source_lang) {
                        let clean_c = clean_stray_ocr_artifacts(&res.text);
                        if clean_c.chars().count() > total_chars || (clean_c.chars().count() >= total_chars && clean_c.contains('\n')) {
                            unified_text = Some(clean_c);
                        }
                    }
                }
            }

            let final_t = unified_text.unwrap_or(fallback_text);
            let unified_box = BoxRect { x: mx, y: my, w: mx2 - mx, h: my2 - my };
            let unified_poly = vec![
                [mx, my], [mx2, my], [mx2, my2], [mx, my2],
            ];

            regions[r_idx] = Region {
                id: regions[r_idx].id.clone(),
                box_: unified_box,
                polygon: unified_poly,
                text: final_t,
                confidence,
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

        let poly = vec![
            [box_rect.x, box_rect.y],
            [box_rect.x + box_rect.w, box_rect.y],
            [box_rect.x + box_rect.w, box_rect.y + box_rect.h],
            [box_rect.x, box_rect.y + box_rect.h],
        ];

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

    regions
}
