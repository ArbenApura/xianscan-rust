// -- CRATE / EXTERNAL IMPORTS -- //
use crate::ml::geometry::{box_iou_f32, box_to_xywh_f32};

// -- FUNCTIONS & ALGORITHMS -- //

/// Deduplicate overlapping bounding boxes.
pub fn deduplicate_boxes(
    boxes: &[Vec<[f32; 2]>],
    scores: &[f32],
    iou_thresh: f32,
) -> (Vec<Vec<[f32; 2]>>, Vec<f32>) {
    if boxes.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let mut indexed: Vec<(usize, &Vec<[f32; 2]>, f32)> = boxes
        .iter()
        .zip(scores.iter())
        .enumerate()
        .map(|(idx, (b, &s))| (idx, b, s))
        .collect();

    indexed.sort_by(|a, b| b.2.total_cmp(&a.2));

    let mut kept_boxes: Vec<Vec<[f32; 2]>> = Vec::new();
    let mut kept_scores: Vec<f32> = Vec::new();

    for &(_idx, box_pts, score) in &indexed {
        let (x0, y0, w, h) = box_to_xywh_f32(box_pts);
        let box_area = 1.0_f32.max(w * h);
        let mut suppressed = false;
        let mut replace_indices = Vec::new();

        for k in 0..kept_boxes.len() {
            let kbox = &kept_boxes[k];
            let (kx0, ky0, kw, kh) = box_to_xywh_f32(kbox);
            let karea = 1.0_f32.max(kw * kh);

            let iou = box_iou_f32(box_pts, kbox);
            let ix = 0.0_f32.max((x0 + w).min(kx0 + kw) - x0.max(kx0));
            let iy = 0.0_f32.max((y0 + h).min(ky0 + kh) - y0.max(ky0));
            let inter = ix * iy;
            let min_area = box_area.min(karea);
            let max_area = box_area.max(karea);
            let overlap_ratio = if min_area > 0.0 { inter / min_area } else { 0.0 };

            // CHECK IF CURRENT CANDIDATE BOX ENCLOSES KEPT SUB-BOX (MACRO-CONTAINER VS SLICE)
            let is_multi_row_container = h >= 1.20 * kh;
            let is_multi_col_container = kh >= kw && w >= 1.20 * kw && iy >= 0.65 * kh && iy >= 0.65 * h;
            let is_multi_line_container = is_multi_row_container || is_multi_col_container;
            if is_multi_line_container && box_area >= 1.15 * karea && inter >= 0.65 * karea && (ix >= 0.65 * kw) && (iy >= 0.65 * kh) {
                if score >= kept_scores[k] * 0.70 {
                    // CURRENT CANDIDATE IS A LARGER CONTAINER ENCLOSING THE SMALLER KEPT BOX WITH SUFFICIENT CONFIDENCE -> REPLACE
                    replace_indices.push(k);
                    continue;
                } else {
                    // CURRENT CANDIDATE IS A WEAKER MACRO-BOX OVER HIGHER CONFIDENCE SUB-BOXES -> SUPPRESS THE WEAKER MACRO-BOX
                    suppressed = true;
                    break;
                }
            }

            // CHECK IF KEPT BOX ALREADY ENCLOSES CURRENT CANDIDATE BOX
            let is_kbox_vert_container = kh >= 1.25 * h && (kw - w).abs() <= 40.0;
            let is_kbox_horiz_container = kw >= 1.25 * w && iy >= 0.70 * h && iy >= 0.70 * kh;
            let is_kbox_multi_col_container = h >= w && kw >= 1.25 * w && ix >= 0.70 * w && iy >= 0.65 * h;
            let is_kbox_container = is_kbox_vert_container || is_kbox_horiz_container || is_kbox_multi_col_container;
            if is_kbox_container && karea >= 1.25 * box_area && inter >= 0.70 * box_area && (ix >= 0.70 * w) && (iy >= 0.70 * h) {
                // EXCEPTION: IF KEPT BOX IS A GIANT COVER TITLE / BANNER (KW >= 350PX) AND CURRENT CANDIDATE IS A SMALL CHAPTER SUBTITLE (H <= 35PX),
                // DO NOT SUPPRESS THE DISTINCT CHAPTER SUBTITLE!
                let is_giant_banner_over_subtitle = kw >= 350.0 && h <= 35.0 && w <= 200.0;
                if !is_giant_banner_over_subtitle {
                    suppressed = true;
                    break;
                }
            }

            // STANDARD DUPLICATE / OVERLAP SUPPRESSION FOR SIMILAR-SIZED BOXES
            let x_subsumed = (ix >= 0.80 * w.min(kw)) && (iy >= 0.70 * h.min(kh)) && (max_area / min_area <= 2.0);
            if iou >= iou_thresh || overlap_ratio >= 0.70 || (overlap_ratio >= 0.60 && max_area / min_area <= 2.5) || x_subsumed {
                suppressed = true;
                break;
            }
        }

        if !suppressed {
            if !replace_indices.is_empty() {
                replace_indices.sort_unstable();
                for &idx in replace_indices.iter().rev() {
                    kept_boxes.remove(idx);
                    kept_scores.remove(idx);
                }
            }
            kept_boxes.push(box_pts.clone());
            kept_scores.push(score);
        }
    }

    (kept_boxes, kept_scores)
}

/// Cluster adjacent or overlapping onomatopoeia / free-text stroke boxes into unified candidate envelopes.
/// When stylised brush calligraphy or multi-fragment SFX strokes are detected as disjoint sub-boxes,
/// this groups contiguous stroke fragments within spatial proximity into a bounding polygon envelope.
pub fn cluster_adjacent_sfx_boxes(
    sfx_boxes: &[(crate::ml::schemas::BoxRect, f32)],
    max_gap_px: i32,
) -> Vec<(Vec<[f32; 2]>, f32)> {
    if sfx_boxes.is_empty() {
        return Vec::new();
    }

    let mut clusters: Vec<(Vec<crate::ml::schemas::BoxRect>, f32)> = Vec::new();

    for (b, score) in sfx_boxes {
        let mut merged_clusters = Vec::new();

        for (c_idx, (cluster_boxes, _)) in clusters.iter().enumerate() {
            let is_adjacent = cluster_boxes.iter().any(|cb| {
                let overlap_x = (b.x + b.w + max_gap_px).min(cb.x + cb.w + max_gap_px) - (b.x - max_gap_px).max(cb.x - max_gap_px);
                let overlap_y = (b.y + b.h + max_gap_px).min(cb.y + cb.h + max_gap_px) - (b.y - max_gap_px).max(cb.y - max_gap_px);
                overlap_x > 0 && overlap_y > 0
            });

            if is_adjacent {
                merged_clusters.push(c_idx);
            }
        }

        if merged_clusters.is_empty() {
            clusters.push((vec![b.clone()], *score));
        } else {
            let first = merged_clusters[0];
            clusters[first].0.push(b.clone());
            clusters[first].1 = clusters[first].1.max(*score);

            for &other in merged_clusters.iter().skip(1).rev() {
                let (other_boxes, other_score) = clusters.remove(other);
                clusters[first].0.extend(other_boxes);
                clusters[first].1 = clusters[first].1.max(other_score);
            }
        }
    }

    let mut result = Vec::new();
    for (c_boxes, score) in clusters {
        if c_boxes.len() >= 2 {
            // 1. COMPUTE ORIENTED BOUNDING POLYGON FROM CONSTITUENT SFX STROKE CORNERS
            let mut all_pts: Vec<[f32; 2]> = Vec::new();
            for b in &c_boxes {
                all_pts.push([b.x as f32, b.y as f32]);
                all_pts.push([(b.x + b.w) as f32, b.y as f32]);
                all_pts.push([(b.x + b.w) as f32, (b.y + b.h) as f32]);
                all_pts.push([b.x as f32, (b.y + b.h) as f32]);
            }
            let (mut mini_poly, _) = crate::ml::geometry::get_mini_boxes(&all_pts);

            // 2. FIT LINEAR PROGRESSION ANGLE ACROSS CHARACTER CENTERS IF SPREAD HORIZONTALLY
            let mut centers: Vec<(f32, f32)> = c_boxes
                .iter()
                .map(|b| (b.x as f32 + b.w as f32 / 2.0, b.y as f32 + b.h as f32 / 2.0))
                .collect();
            centers.sort_by(|a, b| a.0.total_cmp(&b.0));

            let n_pts = centers.len() as f32;
            let sum_x: f32 = centers.iter().map(|p| p.0).sum();
            let sum_y: f32 = centers.iter().map(|p| p.1).sum();
            let mean_x = sum_x / n_pts;
            let mean_y = sum_y / n_pts;

            let mut var_x = 0.0_f32;
            let mut cov_xy = 0.0_f32;
            for p in &centers {
                let dx = p.0 - mean_x;
                let dy = p.1 - mean_y;
                var_x += dx * dx;
                cov_xy += dx * dy;
            }

            let span_x = centers.last().unwrap().0 - centers.first().unwrap().0;
            if var_x > 100.0 && span_x >= 80.0 {
                let slope = cov_xy / var_x;
                let reg_angle_deg = slope.atan().to_degrees();
                if reg_angle_deg.abs() >= 1.5 && reg_angle_deg.abs() <= 35.0 {
                    // ROTATE THE ENVELOPE BOUNDING QUAD BY THE PROGRESSION ANGLE
                    let rad = reg_angle_deg.to_radians();
                    let (sin_a, cos_a) = (rad.sin(), rad.cos());

                    let mut min_u = f32::INFINITY;
                    let mut max_u = -f32::INFINITY;
                    let mut min_v = f32::INFINITY;
                    let mut max_v = -f32::INFINITY;

                    for p in &all_pts {
                        let u = (p[0] - mean_x) * cos_a + (p[1] - mean_y) * sin_a;
                        let v = -(p[0] - mean_x) * sin_a + (p[1] - mean_y) * cos_a;
                        min_u = min_u.min(u);
                        max_u = max_u.max(u);
                        min_v = min_v.min(v);
                        max_v = max_v.max(v);
                    }

                    let c0 = [mean_x + min_u * cos_a - min_v * sin_a, mean_y + min_u * sin_a + min_v * cos_a];
                    let c1 = [mean_x + max_u * cos_a - min_v * sin_a, mean_y + max_u * sin_a + min_v * cos_a];
                    let c2 = [mean_x + max_u * cos_a - max_v * sin_a, mean_y + max_u * sin_a + max_v * cos_a];
                    let c3 = [mean_x + min_u * cos_a - max_v * sin_a, mean_y + min_u * sin_a + max_v * cos_a];
                    mini_poly = vec![c0, c1, c2, c3];
                }
            }

            result.push((mini_poly, score));
        } else {
            let b = &c_boxes[0];
            let poly = vec![
                [b.x as f32, b.y as f32],
                [(b.x + b.w) as f32, b.y as f32],
                [(b.x + b.w) as f32, (b.y + b.h) as f32],
                [b.x as f32, (b.y + b.h) as f32],
            ];
            result.push((poly, score));
        }
    }

    result
}

/// Sort detected text regions in reading order (top-to-bottom bands; right-to-left for Japanese, left-to-right otherwise).
pub fn sort_regions_top_to_bottom(
    boxes: &[Vec<[f32; 2]>],
    _page_h: usize,
    row_tolerance: f32,
    source_lang: Option<&str>,
) -> Vec<usize> {
    if boxes.is_empty() {
        return Vec::new();
    }

    let is_r2l = source_lang
        .map(|l| {
            let p = l.split('-').next().unwrap_or(l).to_lowercase();
            p == "ja"
        })
        .unwrap_or(false);

    let mut centers = Vec::new();
    for b in boxes {
        let (x, y, w, h) = box_to_xywh_f32(b);
        centers.push((y + h / 2.0, x + w / 2.0, h));
    }

    let mut rows: Vec<Vec<usize>> = Vec::new();

    for (i, &(cy, _cx, _h)) in centers.iter().enumerate() {
        let mut placed = false;
        for row in &mut rows {
            let ys: Vec<f32> = row.iter().map(|&j| centers[j].0).collect();
            let hs: Vec<f32> = row.iter().map(|&j| centers[j].2).collect();
            let min_y = ys.iter().cloned().fold(f32::INFINITY, f32::min);
            let max_y = ys.iter().cloned().fold(-f32::INFINITY, f32::max);
            let max_h = hs.iter().cloned().fold(0.0_f32, f32::max);

            let top = min_y - max_h * row_tolerance;
            let bottom = max_y + max_h * row_tolerance;

            if cy >= top && cy <= bottom {
                row.push(i);
                placed = true;
                break;
            }
        }
        if !placed {
            rows.push(vec![i]);
        }
    }

    rows.sort_by(|a, b| {
        let min_ya = a.iter().map(|&j| centers[j].0).fold(f32::INFINITY, f32::min);
        let min_yb = b.iter().map(|&j| centers[j].0).fold(f32::INFINITY, f32::min);
        min_ya.total_cmp(&min_yb)
    });

    let mut order = Vec::new();
    for mut row in rows {
        if is_r2l {
            // RIGHT-TO-LEFT FOR JAPANESE MANGA (X DESCENDING)
            row.sort_by(|&a, &b| centers[b].1.total_cmp(&centers[a].1));
        } else {
            // LEFT-TO-RIGHT FOR WESTERN COMICS / MANHWA / MANHUA (X ASCENDING)
            row.sort_by(|&a, &b| centers[a].1.total_cmp(&centers[b].1));
        }
        order.extend(row);
    }

    order
}

/// Filter out orthogonal overlapping lines where a vertical line and horizontal line collide on the same text.
pub fn filter_orthogonal_line_conflicts(lines: Vec<crate::ml::ocr::OcrLine>) -> Vec<crate::ml::ocr::OcrLine> {
    if lines.len() <= 1 {
        return lines;
    }
    let mut keep = vec![true; lines.len()];
    for i in 0..lines.len() {
        if !keep[i] { continue; }
        let (ix, iy, iw, ih) = crate::ml::geometry::polygon_bounds(&lines[i].polygon);
        let i_vert = ih > iw * 2;
        let i_horiz = iw > ih * 2;
        for j in (i + 1)..lines.len() {
            if !keep[j] { continue; }
            let (jx, jy, jw, jh) = crate::ml::geometry::polygon_bounds(&lines[j].polygon);
            let j_vert = jh > jw * 2;
            let j_horiz = jw > jh * 2;
            if (i_vert && j_horiz) || (i_horiz && j_vert) {
                let inter_x = (ix + iw).min(jx + jw) - ix.max(jx);
                let inter_y = (iy + ih).min(jy + jh) - iy.max(jy);
                if inter_x > 0 && inter_y > 0 {
                    let inter_area = inter_x * inter_y;
                    let min_area = (iw * ih).min(jw * jh).max(1);
                    if inter_area as f32 / min_area as f32 >= 0.50 {
                        if lines[i].score >= lines[j].score {
                            keep[j] = false;
                        } else {
                            keep[i] = false;
                            break;
                        }
                    }
                }
            }
        }
    }
    lines.into_iter().enumerate().filter(|(idx, _)| keep[*idx]).map(|(_, l)| l).collect()
}
