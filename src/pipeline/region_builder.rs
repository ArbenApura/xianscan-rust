// -- CRATE / EXTERNAL IMPORTS -- //
use image::{DynamicImage, GenericImageView};

// -- INTERNAL IMPORTS -- //
use crate::ml::geometry::{
    box_iou, box_iou_pts, calculate_box_angle, calculate_box_angle_i32,
    line_center_inside_box, polygon_bounds,
};
use crate::ml::ocr::{OcrLine, RapidOcr};
use crate::ml::schemas::{BoxRect, Region, RegionKind};

// -- FUNCTIONS & ALGORITHMS -- //

fn polygon_thickness(poly: &[[i32; 2]]) -> f32 {
    if poly.len() >= 4 {
        let dx01 = (poly[1][0] - poly[0][0]) as f32;
        let dy01 = (poly[1][1] - poly[0][1]) as f32;
        let len01 = (dx01 * dx01 + dy01 * dy01).sqrt();

        let dx12 = (poly[2][0] - poly[1][0]) as f32;
        let dy12 = (poly[2][1] - poly[1][1]) as f32;
        let len12 = (dx12 * dx12 + dy12 * dy12).sqrt();

        len01.min(len12).max(10.0)
    } else {
        let (_, _, _, lh) = polygon_bounds(poly);
        lh as f32
    }
}

fn cluster_lines_into_utterances<'a>(
    lines: &[&'a OcrLine],
    is_cjk: bool,
    is_sfx: bool,
    is_vertical: bool,
    sin_a: f32,
    cos_a: f32,
) -> Vec<Vec<&'a OcrLine>> {
    if lines.len() <= 1 || !is_cjk || is_sfx || is_vertical || sin_a.abs() > 0.05 {
        return vec![lines.to_vec()];
    }

    let mut sorted_lines: Vec<&'a OcrLine> = lines.to_vec();
    sorted_lines.sort_by(|a, b| {
        let (ax, ay, aw, ah) = polygon_bounds(&a.polygon);
        let (bx, by, bw, bh) = polygon_bounds(&b.polygon);
        let a_my = -(ax + aw / 2) as f32 * sin_a + (ay + ah / 2) as f32 * cos_a;
        let b_my = -(bx + bw / 2) as f32 * sin_a + (by + bh / 2) as f32 * cos_a;
        a_my.total_cmp(&b_my)
    });

    let mut rows: Vec<Vec<&'a OcrLine>> = Vec::new();
    for l in sorted_lines {
        let (lx, ly, lw, _) = polygon_bounds(&l.polygon);
        let l_th = polygon_thickness(&l.polygon);
        let l_rot_y = -(lx + lw / 2) as f32 * sin_a + (ly + l_th as i32 / 2) as f32 * cos_a;
        let mut placed = false;
        for row in rows.iter_mut() {
            let (rx, ry, rw, _) = polygon_bounds(&row[0].polygon);
            let r_th = polygon_thickness(&row[0].polygon);
            let r_rot_y = -(rx + rw / 2) as f32 * sin_a + (ry + r_th as i32 / 2) as f32 * cos_a;
            let threshold = (l_th.min(r_th) * 0.45).max(5.0);
            if (l_rot_y - r_rot_y).abs() <= threshold {
                row.push(l);
                placed = true;
                break;
            }
        }
        if !placed {
            rows.push(vec![l]);
        }
    }

    // 1. Check for side-by-side adjacent bubble columns in CJK dialogue (e.g. Page 103930: '这傻子非得尿裤子上不可！' vs '哈哈！')
    let mut has_side_by_side = false;
    for r in &rows {
        if r.len() >= 2 {
            let mut sorted_r = r.clone();
            sorted_r.sort_by_key(|s| polygon_bounds(&s.polygon).0);
            for i in 0..sorted_r.len() - 1 {
                let (ax, _, aw, _) = polygon_bounds(&sorted_r[i].polygon);
                let (bx, _, _, _) = polygon_bounds(&sorted_r[i + 1].polygon);
                if bx - (ax + aw) >= 20 {
                    has_side_by_side = true;
                    break;
                }
            }
        }
    }

    if has_side_by_side {
        let mut clusters: Vec<Vec<&'a OcrLine>> = Vec::new();
        for &l in lines {
            let (lx, ly, lw, lh) = polygon_bounds(&l.polygon);
            let mut merged_indices: Vec<usize> = Vec::new();
            for (c_idx, cluster) in clusters.iter().enumerate() {
                let connects = cluster.iter().any(|c_line| {
                    let (cx, cy, cw, ch) = polygon_bounds(&c_line.polygon);
                    let overlap_x = (lx + lw).min(cx + cw) - lx.max(cx);
                    let min_w = lw.min(cw);
                    let vert_gap = if ly >= cy + ch { ly - (cy + ch) } else if cy >= ly + lh { cy - (ly + lh) } else { 0 };
                    let horiz_overlap_ratio = overlap_x as f32 / min_w.max(1) as f32;
                    horiz_overlap_ratio >= 0.35 && vert_gap <= (lh.max(ch) as f32 * 1.5) as i32
                });
                if connects {
                    merged_indices.push(c_idx);
                }
            }

            if merged_indices.is_empty() {
                clusters.push(vec![l]);
            } else {
                let first = merged_indices[0];
                clusters[first].push(l);
                for &other in merged_indices.iter().skip(1).rev() {
                    let other_lines = clusters.remove(other);
                    clusters[first].extend(other_lines);
                }
            }
        }
        if clusters.len() >= 2 {
            return clusters;
        }
    }

    // 2. Check for vertical paragraph gaps and sentence boundaries between rows
    let mut paragraph_clusters: Vec<Vec<&'a OcrLine>> = Vec::new();
    let mut current_cluster: Vec<&'a OcrLine> = Vec::new();

    for (r_idx, row) in rows.iter().enumerate() {
        if r_idx > 0 {
            let prev_row = &rows[r_idx - 1];
            let prev_max_y = prev_row.iter().map(|l| {
                let (_, ly, _, lh) = polygon_bounds(&l.polygon);
                (ly + lh) as f32
            }).fold(f32::MIN, f32::max);

            let curr_min_y = row.iter().map(|l| {
                let (_, ly, _, _) = polygon_bounds(&l.polygon);
                ly as f32
            }).fold(f32::MAX, f32::min);

            let prev_row_text = prev_row.iter().map(|l| l.text.trim()).collect::<Vec<_>>().join("");
            let ends_with_punct = prev_row_text.ends_with('！')
                || prev_row_text.ends_with('!')
                || prev_row_text.ends_with('？')
                || prev_row_text.ends_with('?')
                || prev_row_text.ends_with('。')
                || prev_row_text.ends_with('…')
                || prev_row_text.ends_with("..");

            let vert_gap = curr_min_y - prev_max_y;
            // A paragraph break occurs if:
            // 1. Vertical gap is >= 35px
            // 2. Previous row ends with strong punctuation and vertical gap >= 18px
            let should_split = vert_gap >= 35.0 || (ends_with_punct && vert_gap >= 18.0);

            if should_split && !current_cluster.is_empty() {
                paragraph_clusters.push(current_cluster);
                current_cluster = Vec::new();
            }
        }

        current_cluster.extend(row.iter().copied());
    }

    if !current_cluster.is_empty() {
        paragraph_clusters.push(current_cluster);
    }

    if paragraph_clusters.is_empty() {
        vec![lines.to_vec()]
    } else {
        paragraph_clusters
    }
}

fn format_lines_cluster(
    lines: &[&OcrLine],
    is_cjk: bool,
    is_container_vert: bool,
    sin_a: f32,
    cos_a: f32,
) -> String {
    if is_container_vert {
        let mut sorted: Vec<&OcrLine> = lines.to_vec();
        sorted.sort_by(|a, b| {
            let (ax, ay, _, _) = polygon_bounds(&a.polygon);
            let (bx, by, _, _) = polygon_bounds(&b.polygon);
            bx.cmp(&ax).then_with(|| ay.cmp(&by))
        });
        sorted.iter().map(|l| l.text.trim()).collect::<Vec<_>>().join("\n")
    } else {
        let mut sorted_lines: Vec<&OcrLine> = lines.to_vec();
        sorted_lines.sort_by(|a, b| {
            let (ax, ay, aw, ah) = polygon_bounds(&a.polygon);
            let (bx, by, bw, bh) = polygon_bounds(&b.polygon);
            let a_my = -(ax + aw / 2) as f32 * sin_a + (ay + ah / 2) as f32 * cos_a;
            let b_my = -(bx + bw / 2) as f32 * sin_a + (by + bh / 2) as f32 * cos_a;
            a_my.total_cmp(&b_my)
        });

        let mut rows: Vec<Vec<&OcrLine>> = Vec::new();
        for l in sorted_lines {
            let (lx, ly, lw, _) = polygon_bounds(&l.polygon);
            let l_th = polygon_thickness(&l.polygon);
            let l_rot_y = -(lx + lw / 2) as f32 * sin_a + (ly + l_th as i32 / 2) as f32 * cos_a;
            let mut placed = false;
            for row in rows.iter_mut() {
                let (rx, ry, rw, _) = polygon_bounds(&row[0].polygon);
                let r_th = polygon_thickness(&row[0].polygon);
                let r_rot_y = -(rx + rw / 2) as f32 * sin_a + (ry + r_th as i32 / 2) as f32 * cos_a;
                let threshold = (l_th.min(r_th) * 0.45).max(5.0);
                if (l_rot_y - r_rot_y).abs() <= threshold {
                    row.push(l);
                    placed = true;
                    break;
                }
            }
            if !placed {
                rows.push(vec![l]);
            }
        }

        rows.sort_by(|a, b| {
            let (ax, ay, aw, ah) = polygon_bounds(&a[0].polygon);
            let (bx, by, bw, bh) = polygon_bounds(&b[0].polygon);
            let a_my = -(ax + aw / 2) as f32 * sin_a + (ay + ah / 2) as f32 * cos_a;
            let b_my = -(bx + bw / 2) as f32 * sin_a + (by + bh / 2) as f32 * cos_a;
            a_my.total_cmp(&b_my)
        });

        let mut row_strings: Vec<String> = Vec::new();
        for mut row in rows {
            row.sort_by(|a, b| {
                let (ax, ay, aw, ah) = polygon_bounds(&a.polygon);
                let (bx, by, bw, bh) = polygon_bounds(&b.polygon);
                let a_mx = (ax + aw / 2) as f32 * cos_a + (ay + ah / 2) as f32 * sin_a;
                let b_mx = (bx + bw / 2) as f32 * cos_a + (by + bh / 2) as f32 * sin_a;
                a_mx.total_cmp(&b_mx)
            });
            if is_cjk {
                row_strings.push(row.iter().map(|s| s.text.trim()).collect::<Vec<_>>().join(""));
            } else {
                row_strings.push(row.iter().map(|s| s.text.trim()).collect::<Vec<_>>().join(" "));
            }
        }
        row_strings.join("\n")
    }
}

// EXPAND BOX BY A UNIFORM / ISOTROPIC MARGIN PERCENTAGE CLAMPED TO CANVAS BOUNDS
pub fn expand_box(b: &BoxRect, pad_pct: f32, page_w: u32, page_h: u32) -> BoxRect {
    // UNIFORM / ISOTROPIC EXPANSION:
    // BASE PADDING ON THE DIAGONAL / GEOMETRIC SCALE OF THE TEXT REGION SO WIDE BANNERS AND TALL STRIPS
    // EXPAND WITH EQUAL MARGINS ON ALL 4 SIDES (LEFT, RIGHT, TOP, BOTTOM) INSTEAD OF ASPECT RATIO DISTORTION.
    let ref_dim = (b.w.min(b.h) as f32).max((b.w.max(b.h) as f32) * 0.4);
    let uniform_pad = (ref_dim * pad_pct * 1.5).round().max(1.0) as i32;

    let sx = (b.x - uniform_pad).max(0);
    let sy = (b.y - uniform_pad).max(0);
    let sw = (b.w + uniform_pad * 2).min(page_w as i32 - sx);
    let sh = (b.h + uniform_pad * 2).min(page_h as i32 - sy);
    BoxRect {
        x: sx,
        y: sy,
        w: sw.max(1),
        h: sh.max(1),
    }
}

/// COMPUTES COLOR SATURATION & CHROMATIC VARIANCE FOR A GIVEN REGION ON THE PAGE IMAGE.
/// WHITE/MONOCHROME SPEECH BUBBLE BACKGROUNDS HAVE LOW CHROMATIC VARIANCE (< 15.0).
/// HIGHLY COLORFUL ARTWORK, SOUND EFFECTS, AND DETAILED ILLUSTRATIONS HAVE HIGH VARIANCE (> 22.0).
pub fn compute_chromatic_color_variance(img: &DynamicImage, rect: &BoxRect) -> f32 {
    let (pw, ph) = img.dimensions();
    let rx = (rect.x.max(0) as u32).min(pw.saturating_sub(1));
    let ry = (rect.y.max(0) as u32).min(ph.saturating_sub(1));
    let rw = (rect.w.max(1) as u32).min(pw - rx);
    let rh = (rect.h.max(1) as u32).min(ph - ry);

    if rw < 2 || rh < 2 {
        return 0.0;
    }

    let rgb_img = img.to_rgb8();
    let step_x = (rw / 32).max(1);
    let step_y = (rh / 32).max(1);

    let mut sat_sum = 0.0f32;
    let mut sat_sq_sum = 0.0f32;
    let mut count = 0usize;

    for y in (ry..(ry + rh)).step_by(step_y as usize) {
        for x in (rx..(rx + rw)).step_by(step_x as usize) {
            let p = rgb_img.get_pixel(x, y);
            let rf = p[0] as f32;
            let gf = p[1] as f32;
            let bf = p[2] as f32;

            let max_c = rf.max(gf).max(bf);
            let min_c = rf.min(gf).min(bf);
            let delta = max_c - min_c;

            let sat = if max_c > 0.0 { (delta / max_c) * 255.0 } else { 0.0 };
            sat_sum += sat;
            sat_sq_sum += sat * sat;
            count += 1;
        }
    }

    if count == 0 {
        return 0.0;
    }

    let mean_sat = sat_sum / count as f32;
    let variance = (sat_sq_sum / count as f32) - (mean_sat * mean_sat);
    let std_dev = variance.max(0.0).sqrt();

    // COMBINED CHROMATIC ENERGY = MEAN SATURATION * 0.5 + SATURATION STD_DEV * 0.5
    mean_sat * 0.5 + std_dev * 0.5
}

/// BUILD FINAL REGIONS FROM DETECTED CONTAINERS AND OCR LINES (PURE 2-STAGE NEURAL PIPELINE)
pub fn build_regions(
    ocr: &mut Option<RapidOcr>,
    img: &DynamicImage,
    dedup_boxes: &[Vec<[f32; 2]>],
    order: &[usize],
    split_lines: &[OcrLine],
    bubbles: &[BoxRect],
    text_free_boxes: &[(BoxRect, f32)],
    page_w: u32,
    page_h: u32,
    is_cjk: bool,
    _is_latin: bool,
    source_lang: Option<&str>,
    inpaint_padding_pct: Option<f32>,
    typeset_padding_pct: Option<f32>,
) -> Vec<Region> {
    let inpaint_pct = inpaint_padding_pct.unwrap_or(0.06);
    let typeset_pct = typeset_padding_pct.unwrap_or(0.12);
    let mut regions: Vec<Region> = Vec::new();

    for &idx in order {
        let box_pts = &dedup_boxes[idx];
        let (bx, by, bw, bh) = crate::ml::geometry::box_to_xywh_f32(box_pts);
        let sx = bx.max(0.0) as i32;
        let sy = by.max(0.0) as i32;
        let sw = (bw.max(1.0) as i32).min(page_w as i32 - sx);
        let sh = (bh.max(1.0) as i32).min(page_h as i32 - sy);

        let box_rect = BoxRect {
            x: sx,
            y: sy,
            w: sw,
            h: sh,
        };

        // CONTAINER & BUBBLE ASSOCIATION (REQUIRES >= 75% OF TEXT BOX INSIDE BUBBLE)
        let (bx, by, bw, bh) = (box_rect.x, box_rect.y, box_rect.w, box_rect.h);
        let box_area = (bw * bh).max(1);

        let matched_bubble = bubbles.iter().find(|b| {
            let inter_x = (bx + bw).min(b.x + b.w) - bx.max(b.x);
            let inter_y = (by + bh).min(b.y + b.h) - by.max(b.y);
            if inter_x > 0 && inter_y > 0 {
                let inter_area = inter_x * inter_y;
                let coverage = inter_area as f32 / box_area as f32;
                coverage >= 0.75
            } else {
                false
            }
        });

        let mid_x = box_rect.x + box_rect.w / 2;
        let mid_y = box_rect.y + box_rect.h / 2;

        let is_detector_sfx = text_free_boxes.iter().any(|(tf, _)| {
            let iou = box_iou(tf, &box_rect);
            let contains = mid_x >= tf.x && mid_x <= tf.x + tf.w && mid_y >= tf.y && mid_y <= tf.y + tf.h;
            iou >= 0.30 || contains
        });

        // CHROMATIC VARIANCE GATE: FOR TEXT OUTSIDE SPEECH BUBBLES, MEASURE BACKGROUND COLOR VARIANCE
        // IF HIGH COLOR SATURATION / VARIANCE (> 22.0), IT IS AN ARTWORK SOUND EFFECT OR HANDWRITTEN CALLIGRAPHY.
        let is_chromatic_art_bg = matched_bubble.is_none() && compute_chromatic_color_variance(img, &box_rect) >= 22.0;

        let is_sfx = is_detector_sfx || is_chromatic_art_bg;

        let mut kind = if matched_bubble.is_some() {
            RegionKind::DialogueBubble
        } else if is_sfx {
            RegionKind::SoundEffect
        } else {
            RegionKind::FreeText
        };

        // MATCH OCR LINES WHOSE CENTER SITS INSIDE THIS CANDIDATE BOX
        let matched: Vec<&OcrLine> = split_lines
            .iter()
            .filter(|l| {
                let (lx, ly, lw, lh) = polygon_bounds(&l.polygon);
                // AN OCR LINE THAT IS SIGNIFICANTLY WIDER THAN THE CONTAINER BOX (LW >= 1.45 * BOX_RECT.W)
                // IS A CROSS-CONTAINER SPANNED LINE AND SHOULD NOT BE MATCHED TO THIS SUB-CONTAINER.
                if lw >= (box_rect.w as f32 * 1.45) as i32 && box_rect.w >= 40 && !is_sfx {
                    return false;
                }
                if line_center_inside_box(&l.polygon, &box_rect) {
                    return true;
                }
                let l_rect = BoxRect { x: lx, y: ly, w: lw, h: lh };
                let iou = box_iou(&box_rect, &l_rect);
                let inter_x = (box_rect.x + box_rect.w).min(lx + lw) - box_rect.x.max(lx);
                let inter_y = (box_rect.y + box_rect.h).min(ly + lh) - box_rect.y.max(ly);
                let inter_area = inter_x.max(0) * inter_y.max(0);
                let l_area = (lw * lh).max(1);
                let coverage = inter_area as f32 / l_area as f32;

                iou >= 0.25 || coverage >= 0.40
            })
            .collect();

        let mut is_container_vert = box_rect.h > (box_rect.w as f32 * 1.3) as i32;
        let mut angle_deg = 0.0f32;

        if !matched.is_empty() {
            // DETERMINE DOMINANT TEXT ORIENTATION INSIDE THIS CONTAINER (HORIZONTAL VS VERTICAL TBRL)
            let mut h_area = 0i64;
            let mut v_area = 0i64;
            let mut h_count = 0usize;
            let mut v_count = 0usize;

            for &m in &matched {
                let (_, _, lw, lh) = polygon_bounds(&m.polygon);
                let area = (lw * lh) as i64;
                if lh > (lw as f32 * 1.25) as i32 {
                    v_count += 1;
                    v_area += area;
                } else {
                    h_count += 1;
                    h_area += area;
                }
            }

            is_container_vert = if v_count > 0 && h_count > 0 {
                // WHEN BOTH HORIZONTAL AND VERTICAL DETECTIONS COEXIST, SELECT DOMINANT PARAGRAPH ORIENTATION
                v_area > (h_area as f32 * 1.30) as i64 && v_count > h_count
            } else {
                v_count > h_count
            };

            // PRUNE PERPENDICULAR PHANTOM SLICES THAT CONFLICT WITH DOMINANT ORIENTATION
            let mut orientation_filtered: Vec<&OcrLine> = if h_count > 0 && v_count > 0 {
                matched.iter().copied().filter(|m| {
                    let (_, _, lw, lh) = polygon_bounds(&m.polygon);
                    let is_line_vert = lh > (lw as f32 * 1.25) as i32;
                    is_line_vert == is_container_vert
                }).collect()
            } else {
                matched.clone()
            };

            // IN SFX / SHORT BOXES, SUPPRESS LOW-CONFIDENCE BACKGROUND NOISE LINES IF HIGH-CONFIDENCE LINE EXISTS
            let max_score = orientation_filtered.iter().map(|l| l.score).fold(0.0f32, f32::max);
            if max_score >= 0.70 && (is_sfx || (box_rect.w <= 150 && box_rect.h <= 150)) {
                orientation_filtered.retain(|l| l.score >= 0.62 || l.score >= max_score * 0.90);
            }

            // DEDUPLICATE IDENTICAL OR SUBSTRING-ECHO LINES INSIDE THE SAME CONTAINER
            let mut filtered_matched: Vec<&OcrLine> = Vec::new();
            for &m in &orientation_filtered {
                let clean_m = m.text.trim();
                if clean_m.is_empty() {
                    continue;
                }
                // SUPPRESS INDIVIDUAL WATERMARK LINES INSIDE CONTAINER (E.G. COLLIDING BANNER WATERMARKS)
                if crate::ml::detect::is_watermark_line(clean_m) {
                    continue;
                }
                let (mx, my, mw, mh) = polygon_bounds(&m.polygon);
                let mut is_dup = false;
                for existing in &filtered_matched {
                    let clean_o = existing.text.trim();
                    let (ox, oy, ow, oh) = polygon_bounds(&existing.polygon);
                    let iou = box_iou_pts(&m.polygon, &existing.polygon);
                    let is_exact = clean_m == clean_o;
                    let is_sub = clean_o.contains(clean_m) && clean_o.chars().count() > clean_m.chars().count();
                    let overlap_x = (mx + mw).min(ox + ow) - mx.max(ox);
                    let overlap_y = (my + mh).min(oy + oh) - my.max(oy);
                    let overlap_area = overlap_x.max(0) * overlap_y.max(0);
                    let m_area = (mw * mh).max(1);
                    let overlap_ratio_m = overlap_area as f32 / m_area as f32;

                    if (iou >= 0.50 || overlap_ratio_m >= 0.70) && (is_exact || is_sub) {
                        is_dup = true;
                        break;
                    }
                }
                if !is_dup {
                    // ALSO PRUNE SHORTER SUBSTRING LINES ALREADY IN FILTERED_MATCHED IF M IS MORE COMPLETE
                    filtered_matched.retain(|existing| {
                        let clean_o = existing.text.trim();
                        let iou = box_iou_pts(&m.polygon, &existing.polygon);
                        let is_existing_sub = clean_m.contains(clean_o) && clean_m.chars().count() > clean_o.chars().count();
                        !(iou >= 0.50 && is_existing_sub)
                    });
                    filtered_matched.push(m);
                }
            }

            let clusters = cluster_lines_into_utterances(&filtered_matched, is_cjk, is_sfx, is_container_vert, 0.0, 1.0);

            for cluster_lines in clusters {
                if cluster_lines.is_empty() {
                    continue;
                }
                let box_angle = calculate_box_angle(box_pts);
                let line_angles: Vec<f32> = cluster_lines
                    .iter()
                    .filter_map(|l| {
                        let (_, _, lw, lh) = polygon_bounds(&l.polygon);
                        if lw >= 40 || lh >= 40 {
                            let a = calculate_box_angle_i32(&l.polygon);
                            if a != 0.0 { Some(a) } else { None }
                        } else {
                            None
                        }
                    })
                    .collect();

                angle_deg = if box_angle.abs() >= 1.5 {
                    box_angle
                } else if !line_angles.is_empty() {
                    let mut sorted = line_angles;
                    sorted.sort_by(|a, b| a.total_cmp(b));
                    let median_a = sorted[sorted.len() / 2];
                    if matched_bubble.is_some() && median_a.abs() < 5.0 {
                        0.0
                    } else {
                        median_a
                    }
                } else {
                    0.0
                };

                let alpha_rad = angle_deg * (std::f32::consts::PI / 180.0);
                let cos_a = alpha_rad.cos();
                let sin_a = alpha_rad.sin();

                let mut active_line_polys: Vec<Vec<[i32; 2]>> = cluster_lines.iter().map(|l| l.polygon.clone()).collect();
                let mut combined_text = format_lines_cluster(&cluster_lines, is_cjk, is_container_vert, sin_a, cos_a);
                let mut avg_score = cluster_lines.iter().map(|l| l.score).sum::<f32>() / cluster_lines.len() as f32;

                // COMPUTE TIGHT BOUNDS OF THIS CLUSTER
                let mut c_min_x = i32::MAX;
                let mut c_min_y = i32::MAX;
                let mut c_max_x = i32::MIN;
                let mut c_max_y = i32::MIN;
                for l in &cluster_lines {
                    let (lx, ly, lw, lh) = polygon_bounds(&l.polygon);
                    c_min_x = c_min_x.min(lx);
                    c_min_y = c_min_y.min(ly);
                    c_max_x = c_max_x.max(lx + lw);
                    c_max_y = c_max_y.max(ly + lh);
                }
                let cluster_rect = BoxRect {
                    x: c_min_x.max(0),
                    y: c_min_y.max(0),
                    w: (c_max_x - c_min_x).max(1),
                    h: (c_max_y - c_min_y).max(1),
                };

                // IF FULL-PAGE OCR MISSED CHARACTERS IN A BUBBLE OR WIDE/TALL CANDIDATE CONTAINER (E.G. TRAILING ELLIPSIS), ATTEMPT CROP RECOGNITION REFINEMENT
                // TRUST HIGH-CONFIDENCE MULTI-LINE FULL-PAGE DETECTIONS (>= 3 LINES, CONF >= 0.65) UNLESS CANDIDATE CONTAINER EXTENDS SIGNIFICANTLY BEYOND CLUSTER RECT
                let container_w = box_rect.w;
                let container_h = box_rect.h;
                let is_container_wider = container_w >= cluster_rect.w + 25 || (container_w as f32) >= (cluster_rect.w as f32 * 1.30);
                let is_container_taller = container_h >= cluster_rect.h + 25 || (container_h as f32) >= (cluster_rect.h as f32 * 1.30);
                let full_page_is_complete = cluster_lines.len() >= 2 && avg_score >= 0.65 && !is_container_wider && !is_container_taller;
                let can_refine_crop = (matched_bubble.is_some() || is_container_wider || is_container_taller) && (cluster_rect.w >= 16 || box_rect.w >= 16) && (cluster_rect.h >= 16 || box_rect.h >= 16) && !full_page_is_complete;

                if can_refine_crop {
                    // Restrict crop target to the cluster bounds (plus small padding) to prevent capturing surrounding dialogue across different speech bubbles
                    let target_rect = if matched_bubble.is_some() && cluster_lines.len() <= 2 {
                        BoxRect {
                            x: cluster_rect.x.min(box_rect.x),
                            y: cluster_rect.y.min(box_rect.y),
                            w: (cluster_rect.x + cluster_rect.w).max(box_rect.x + box_rect.w) - cluster_rect.x.min(box_rect.x),
                            h: (cluster_rect.y + cluster_rect.h).max(box_rect.y + box_rect.h) - cluster_rect.y.min(box_rect.y),
                        }
                    } else {
                        cluster_rect.clone()
                    };
                    let pad = 6;
                    let crop_x = (target_rect.x - pad).max(0) as u32;
                    let crop_y = (target_rect.y - pad).max(0) as u32;
                    let crop_w = ((target_rect.w + pad * 2) as u32).min(page_w - crop_x);
                    let crop_h = ((target_rect.h + pad * 2) as u32).min(page_h - crop_y);
                    if crop_w >= 16 && crop_h >= 16 {
                        if let Some(ref mut o) = ocr {
                            let crop = img.crop_imm(crop_x, crop_y, crop_w, crop_h);
                            if let Ok(Some(res)) = o.recognize_crop_with_lang(&crop, source_lang) {
                                let valid_crop_lines: Vec<_> = if is_cjk {
                                    res.lines
                                        .iter()
                                        .filter(|(_, text, score)| {
                                            let t = text.trim();
                                            if t.is_empty() {
                                                return false;
                                            }
                                            if crate::ml::detect::is_watermark_line(t) {
                                                return false;
                                            }
                                            if crate::ml::detect::is_standalone_alphanumeric_without_cjk(t) && t.chars().count() <= 5 && *score < 0.85 {
                                                return false;
                                            }
                                            true
                                        })
                                        .cloned()
                                        .collect()
                                } else {
                                    res.lines
                                        .iter()
                                        .filter(|(_, text, _)| !crate::ml::detect::is_watermark_line(text.trim()))
                                        .cloned()
                                        .collect()
                                };

                                let clean_crop_text = if !valid_crop_lines.is_empty() {
                                    valid_crop_lines.iter().map(|(_, t, _)| t.clone()).collect::<Vec<_>>().join("\n")
                                } else {
                                    res.text.trim().to_string()
                                };

                                let crop_cjk_count = clean_crop_text.chars().filter(|c| crate::ml::detect::has_cjk_characters(&c.to_string())).count();
                                let combined_cjk_count = combined_text.chars().filter(|c| crate::ml::detect::has_cjk_characters(&c.to_string())).count();
                                let has_more_ellipsis = (clean_crop_text.contains('…') && !combined_text.contains('…')) || (clean_crop_text.contains("..") && !combined_text.contains(".."));

                                // If the crop result merged lines across multiple separate dialogue sentences (e.g. crop_cjk_count is more than 1.5x combined_cjk_count), do not replace.
                                let is_excessive_expansion = combined_cjk_count >= 3 && crop_cjk_count >= (combined_cjk_count * 3 / 2);

                                let is_improved = if is_cjk {
                                    !is_excessive_expansion && (
                                        crop_cjk_count > combined_cjk_count
                                            || has_more_ellipsis
                                            || (crop_cjk_count == combined_cjk_count && res.score > avg_score + 0.02)
                                            || (res.score >= 0.70 && avg_score < 0.60)
                                    )
                                } else {
                                    let crop_chars = clean_crop_text.chars().filter(|c| !c.is_whitespace()).count();
                                    let combined_chars = combined_text.chars().filter(|c| !c.is_whitespace()).count();
                                    !is_excessive_expansion && (crop_chars > combined_chars || has_more_ellipsis || (crop_chars == combined_chars && res.score > avg_score + 0.02) || (res.score >= 0.70 && avg_score < 0.60))
                                };

                                if is_improved && !clean_crop_text.is_empty() {
                                    combined_text = clean_crop_text;
                                    avg_score = res.score;
                                    if !valid_crop_lines.is_empty() {
                                        active_line_polys.clear();
                                        for (line_poly, _, _) in &valid_crop_lines {
                                            let page_poly: Vec<[i32; 2]> = line_poly
                                                .iter()
                                                .map(|p| [(p[0] + crop_x as i32).max(0), (p[1] + crop_y as i32).max(0)])
                                                .collect();
                                            active_line_polys.push(page_poly);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                let cleaned = combined_text.trim().to_string();
                if cleaned.is_empty() && !is_sfx {
                    continue;
                }

                // 1. DROP GIANT ARTWORK HALLUCINATIONS (W >= 60% PAGE_W, H >= 120PX, SCORE < 0.75)
                if cluster_rect.w >= (page_w as f32 * 0.60) as i32 && cluster_rect.h >= 120 && avg_score < 0.75 {
                    continue;
                }

                // 2. DROP HIGH-TILT NON-DIALOGUE WITH LOW RECOGNITION CONFIDENCE (THETA >= 12.0 DEG, SCORE < 0.65)
                if matched_bubble.is_none() && angle_deg.abs() >= 12.0 && avg_score < 0.65 && !is_sfx {
                    continue;
                }

                if !cleaned.is_empty() {
                    // 3. DROP STANDALONE REPEATED NOISE STROKES
                    if crate::ml::detect::is_standalone_noise_stroke(&cleaned) {
                        continue;
                    }
                    if is_cjk && crate::ml::detect::is_standalone_alphanumeric_without_cjk(&cleaned) && matched_bubble.is_none() {
                        continue;
                    }
                    if crate::ml::detect::is_pure_watermark_region(&cleaned) {
                        continue;
                    }
                    if is_cjk && (cluster_rect.y + cluster_rect.h >= page_h as i32 - 50) && cleaned.chars().count() == 1 && (cleaned == "动" || cleaned == "初" || cleaned == "腾" || cleaned == "漫" || cleaned == "漫客" || cleaned == "客") {
                        continue;
                    }
                    // Suppress low-confidence isolated single-character artwork artifacts (e.g. blush mark '红', motion blur slice '会', or partial title '记', conf < 0.75 outside bubbles), but preserve genuine high-confidence SoundEffects
                    if cleaned.chars().count() == 1 && matched_bubble.is_none() && (!is_sfx || avg_score < 0.60) && (avg_score < 0.75 || compute_chromatic_color_variance(img, &cluster_rect) >= 15.0) {
                        continue;
                    }
                }

                // 4. CHROMATIC VARIANCE GATE FOR FREE-FLOATING TEXT:
                // IF TEXT IS OUTSIDE SPEECH BUBBLES AND OCR SCORE < 0.70 WITH HIGH CHROMATIC ARTWORK VARIANCE,
                // CLASSIFY AS SOUNDEFFECT TO PROTECT FROM INPAINT ERASING.
                if matched_bubble.is_none() && avg_score < 0.70 && compute_chromatic_color_variance(img, &cluster_rect) >= 18.0 {
                    kind = RegionKind::SoundEffect;
                }

                let vertical = is_container_vert;
                let angle = angle_deg;

                let final_box_rect = if !active_line_polys.is_empty() {
                    let mut min_x = i32::MAX;
                    let mut min_y = i32::MAX;
                    let mut max_x = i32::MIN;
                    let mut max_y = i32::MIN;
                    for poly in &active_line_polys {
                        for p in poly {
                            min_x = min_x.min(p[0]);
                            min_y = min_y.min(p[1]);
                            max_x = max_x.max(p[0]);
                            max_y = max_y.max(p[1]);
                        }
                    }

                    // IF DETECTOR CONTAINER EXTENDS FURTHER TO THE RIGHT (E.G. TRAILING ELLIPSIS / PUNCTUATION ENCLOSURE)
                    // EXPAND MAX_X TO COVER THE DETECTOR-VERIFIED BOUNDARY
                    if (box_rect.x + box_rect.w) > max_x && (box_rect.x + box_rect.w - max_x) <= 30 && min_x >= box_rect.x - 10 {
                        max_x = max_x.max(box_rect.x + box_rect.w);
                    }

                    let fx = min_x.max(0);
                    let fy = min_y.max(0);
                    let fw = (max_x - min_x).max(1).min(page_w as i32 - fx);
                    let fh = (max_y - min_y).max(1).min(page_h as i32 - fy);

                    if is_sfx && (box_rect.h >= fh + 20 || box_rect.w >= fw + 20) {
                        let ux = fx.min(box_rect.x);
                        let uy = fy.min(box_rect.y);
                        let uw = (fx + fw).max(box_rect.x + box_rect.w) - ux;
                        let uh = (fy + fh).max(box_rect.y + box_rect.h) - uy;
                        BoxRect { x: ux, y: uy, w: uw, h: uh }
                    } else {
                        BoxRect { x: fx, y: fy, w: fw, h: fh }
                    }
                } else {
                    cluster_rect
                };

                let inpaint_box = Some(expand_box(&final_box_rect, inpaint_pct, page_w, page_h));
                let typeset_box = Some(expand_box(&final_box_rect, typeset_pct, page_w, page_h));

                let text_polygon = if angle.abs() >= 1.5 && box_pts.len() == 4 && calculate_box_angle(box_pts).abs() >= 1.5 {
                    box_pts.iter().map(|p| [p[0].round() as i32, p[1].round() as i32]).collect()
                } else if angle.abs() >= 1.5 {
                    let cx = final_box_rect.x as f32 + final_box_rect.w as f32 / 2.0;
                    let cy = final_box_rect.y as f32 + final_box_rect.h as f32 / 2.0;
                    let hw = final_box_rect.w as f32 / 2.0;
                    let hh = final_box_rect.h as f32 / 2.0;
                    let corners = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)];
                    corners
                        .iter()
                        .map(|&(lx, ly)| {
                            let rx = cx + lx * cos_a - ly * sin_a;
                            let ry = cy + lx * sin_a + ly * cos_a;
                            [rx.round() as i32, ry.round() as i32]
                        })
                        .collect()
                } else {
                    vec![
                        [final_box_rect.x, final_box_rect.y],
                        [final_box_rect.x + final_box_rect.w, final_box_rect.y],
                        [final_box_rect.x + final_box_rect.w, final_box_rect.y + final_box_rect.h],
                        [final_box_rect.x, final_box_rect.y + final_box_rect.h],
                    ]
                };

                let bubble_box = matched_bubble.cloned();
                let bubble_polygon = bubble_box.as_ref().map(|b| vec![
                    [b.x, b.y],
                    [b.x + b.w, b.y],
                    [b.x + b.w, b.y + b.h],
                    [b.x, b.y + b.h],
                ]);

                let centroid = if let Some(ref bb) = bubble_box {
                    Some(crate::ml::schemas::Point2D {
                        x: bb.x as f32 + bb.w as f32 / 2.0,
                        y: bb.y as f32 + bb.h as f32 / 2.0,
                    })
                } else {
                    Some(crate::ml::schemas::Point2D {
                        x: final_box_rect.x as f32 + final_box_rect.w as f32 / 2.0,
                        y: final_box_rect.y as f32 + final_box_rect.h as f32 / 2.0,
                    })
                };

                regions.push(Region {
                    id: format!("r{}", regions.len()),
                    box_: final_box_rect,
                    polygon: text_polygon,
                    inpaint_box,
                    typeset_box,
                    text: cleaned,
                    confidence: avg_score,
                    vertical,
                    angle,
                    bubble_box,
                    bubble_polygon,
                    centroid,
                    kind,
                    is_title: false,
                    is_subtitle: false,
                });
            }
        } else {
            // Fallback: RapidOCR missed this detector box -> run targeted isolated recognition crop
            let pad = 8;
            let crop_x = (box_rect.x - pad).max(0) as u32;
            let crop_y = (box_rect.y - pad).max(0) as u32;
            let crop_w = ((box_rect.w + pad * 2) as u32).min(page_w - crop_x);
            let crop_h = ((box_rect.h + pad * 2) as u32).min(page_h - crop_y);

            let mut isolated_text = String::new();
            let mut isolated_score = 0.80;

            if crop_w >= 16 && crop_h >= 16 {
                if let Some(ref mut o) = ocr {
                    let crop = img.crop_imm(crop_x, crop_y, crop_w, crop_h);
                    if let Ok(Some(res)) = o.recognize_crop_with_lang(&crop, source_lang) {
                        isolated_text = res.text.trim().to_string();
                        isolated_score = res.score;
                    }
                    if isolated_text.is_empty() {
                        if let Ok(Some(res)) = o.recognize_line_with_lang(&crop, source_lang) {
                            isolated_text = res.text.trim().to_string();
                            isolated_score = res.score;
                        }
                    }
                }
            }

            let cleaned = isolated_text.trim().to_string();
            if cleaned.is_empty() && !is_sfx {
                continue;
            }

            // 1. DROP GIANT ARTWORK HALLUCINATIONS (W >= 60% PAGE_W, H >= 120PX, SCORE < 0.75)
            if box_rect.w >= (page_w as f32 * 0.60) as i32 && box_rect.h >= 120 && isolated_score < 0.75 {
                continue;
            }

            // 2. DROP HIGH-TILT NON-DIALOGUE WITH LOW RECOGNITION CONFIDENCE (THETA >= 12.0 DEG, SCORE < 0.65)
            if matched_bubble.is_none() && angle_deg.abs() >= 12.0 && isolated_score < 0.65 && !is_sfx {
                continue;
            }

            if !cleaned.is_empty() {
                // 3. DROP STANDALONE REPEATED NOISE STROKES
                if crate::ml::detect::is_standalone_noise_stroke(&cleaned) {
                    continue;
                }
                if is_cjk && crate::ml::detect::is_standalone_alphanumeric_without_cjk(&cleaned) && matched_bubble.is_none() {
                    continue;
                }
                if crate::ml::detect::is_pure_watermark_region(&cleaned) {
                    continue;
                }
                // Suppress low-confidence isolated single-character fallback artwork artifacts (e.g. blush mark '红', or partial title '记', conf < 0.75 outside bubbles)
                if cleaned.chars().count() == 1 && matched_bubble.is_none() && (!is_sfx || isolated_score < 0.50) && (isolated_score < 0.75 || compute_chromatic_color_variance(img, &box_rect) >= 15.0) {
                    continue;
                }
            }

            // 4. CHROMATIC VARIANCE GATE FOR FREE-FLOATING TEXT:
            // IF TEXT IS OUTSIDE SPEECH BUBBLES AND OCR SCORE < 0.70 WITH HIGH CHROMATIC ARTWORK VARIANCE,
            // CLASSIFY AS SOUNDEFFECT TO PROTECT FROM INPAINT ERASING.
            if matched_bubble.is_none() && isolated_score < 0.70 && compute_chromatic_color_variance(img, &box_rect) >= 18.0 {
                kind = RegionKind::SoundEffect;
            }

            let final_box_rect = box_rect;
            let inpaint_box = Some(expand_box(&final_box_rect, inpaint_pct, page_w, page_h));
            let typeset_box = Some(expand_box(&final_box_rect, typeset_pct, page_w, page_h));

            let text_polygon = vec![
                [final_box_rect.x, final_box_rect.y],
                [final_box_rect.x + final_box_rect.w, final_box_rect.y],
                [final_box_rect.x + final_box_rect.w, final_box_rect.y + final_box_rect.h],
                [final_box_rect.x, final_box_rect.y + final_box_rect.h],
            ];

            let bubble_box = matched_bubble.cloned();
            let bubble_polygon = bubble_box.as_ref().map(|b| vec![
                [b.x, b.y],
                [b.x + b.w, b.y],
                [b.x + b.w, b.y + b.h],
                [b.x, b.y + b.h],
            ]);

            let centroid = if let Some(ref bb) = bubble_box {
                Some(crate::ml::schemas::Point2D {
                    x: bb.x as f32 + bb.w as f32 / 2.0,
                    y: bb.y as f32 + bb.h as f32 / 2.0,
                })
            } else {
                Some(crate::ml::schemas::Point2D {
                    x: final_box_rect.x as f32 + final_box_rect.w as f32 / 2.0,
                    y: final_box_rect.y as f32 + final_box_rect.h as f32 / 2.0,
                })
            };

            regions.push(Region {
                id: format!("r{}", regions.len()),
                box_: final_box_rect,
                polygon: text_polygon,
                inpaint_box,
                typeset_box,
                text: cleaned,
                confidence: isolated_score,
                vertical: is_container_vert,
                angle: angle_deg,
                bubble_box,
                bubble_polygon,
                centroid,
                kind,
                is_title: false,
                is_subtitle: false,
            });
        }
    }

    regions
}

// -- TESTS -- //

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_expand_box_geometry() {
        let base = BoxRect { x: 100, y: 100, w: 200, h: 100 };
        let page_w = 1000;
        let page_h = 1000;

        // UNIFORM / ISOTROPIC INPAINT EXPANSION (EQUAL PADDING ON ALL 4 SIDES)
        // ref_dim = 100.max(200*0.4) = 100 -> uniform_pad = (100 * 0.06 * 1.5) = 9px
        let inpaint = expand_box(&base, 0.06, page_w, page_h);
        assert_eq!(inpaint.x, 91);
        assert_eq!(inpaint.y, 91);
        assert_eq!(inpaint.w, 218);
        assert_eq!(inpaint.h, 118);

        // UNIFORM / ISOTROPIC TYPESET EXPANSION (EQUAL PADDING ON ALL 4 SIDES)
        // ref_dim = 100.max(200*0.4) = 100 -> uniform_pad = (100 * 0.12 * 1.5) = 18px
        let typeset = expand_box(&base, 0.12, page_w, page_h);
        assert_eq!(typeset.x, 82);
        assert_eq!(typeset.y, 82);
        assert_eq!(typeset.w, 236);
        assert_eq!(typeset.h, 136);
    }

    #[test]
    fn test_expand_box_clamping_to_boundaries() {
        let edge_box = BoxRect { x: 5, y: 5, w: 50, h: 50 };
        let page_w = 52;
        let page_h = 52;

        let expanded = expand_box(&edge_box, 0.20, page_w, page_h);
        assert_eq!(expanded.x, 0);
        assert_eq!(expanded.y, 0);
        assert_eq!(expanded.w, 52);
        assert_eq!(expanded.h, 52);
    }

    #[test]
    fn test_noise_strokes_filtering() {
        assert!(crate::ml::detect::is_standalone_noise_stroke(""));
        assert!(crate::ml::detect::is_standalone_noise_stroke("000"));
        assert!(crate::ml::detect::is_standalone_noise_stroke("ooo"));
        assert!(crate::ml::detect::is_standalone_noise_stroke("一"));
        assert!(crate::ml::detect::is_standalone_noise_stroke("丨"));
        assert!(crate::ml::detect::is_standalone_noise_stroke("1"));
        assert!(crate::ml::detect::is_standalone_noise_stroke("I"));
        assert!(crate::ml::detect::is_standalone_noise_stroke("l"));
        assert!(crate::ml::detect::is_standalone_noise_stroke("|"));
        assert!(crate::ml::detect::is_standalone_noise_stroke("••"));

        // Valid dialogue text must not be flagged as noise stroke
        assert!(!crate::ml::detect::is_standalone_noise_stroke("你好"));
        assert!(!crate::ml::detect::is_standalone_noise_stroke("Hello world"));
        assert!(!crate::ml::detect::is_standalone_noise_stroke("我是主角！"));
    }

    #[test]
    fn test_chromatic_variance_calculation() {
        // Monochrome / White bubble mock image (variance should be 0.0)
        let white_img = DynamicImage::ImageRgb8(image::RgbImage::from_pixel(100, 100, image::Rgb([255, 255, 255])));
        let rect = BoxRect { x: 10, y: 10, w: 80, h: 80 };
        let var_white = compute_chromatic_color_variance(&white_img, &rect);
        assert!(var_white < 5.0);

        // Highly saturated colorful image (variance should be high)
        let mut color_img = image::RgbImage::new(100, 100);
        for y in 0..100 {
            for x in 0..100 {
                if (x + y) % 2 == 0 {
                    color_img.put_pixel(x, y, image::Rgb([255, 0, 50]));
                } else {
                    color_img.put_pixel(x, y, image::Rgb([0, 220, 255]));
                }
            }
        }
        let var_color = compute_chromatic_color_variance(&DynamicImage::ImageRgb8(color_img), &rect);
        assert!(var_color > 50.0);
    }
}
