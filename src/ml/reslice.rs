// -- CRATE / EXTERNAL IMPORTS -- //
use image::{DynamicImage, GenericImageView, ImageBuffer, Rgb};

// -- INTERNAL IMPORTS -- //
use super::detect::ComicTextDetector;
use super::geometry::polygon_bounds;
use super::ocr::RapidOcr;

// -- FUNCTIONS & ALGORITHMS -- //

/// MERGE OVERLAPPING EXCLUSION INTERVALS INTO CONTIGUOUS RANGES
pub fn merge_intervals(mut intervals: Vec<(i32, i32)>) -> Vec<(i32, i32)> {
    if intervals.is_empty() {
        return Vec::new();
    }
    intervals.sort_by_key(|k| k.0);
    let mut merged = Vec::new();
    let mut current = intervals[0];

    for next in intervals.into_iter().skip(1) {
        if next.0 <= current.1 {
            current.1 = current.1.max(next.1);
        } else {
            merged.push(current);
            current = next;
        }
    }
    merged.push(current);
    merged
}

/// CHECK IF A GIVEN VERTICAL PIXEL COORDINATE OVERLAPS ANY FORBIDDEN ZONE
pub fn is_point_forbidden(y: i32, intervals: &[(i32, i32)]) -> bool {
    intervals.iter().any(|&(start, end)| y >= start && y <= end)
}

/// DETECT DIALOGUE BUBBLES AND TEXT REGIONS IN A CANDIDATE CUT WINDOW
pub fn detect_forbidden_zones_in_window(
    canvas: &DynamicImage,
    window_top: u32,
    window_bottom: u32,
    safety_margin: i32,
    mut detector: Option<&mut ComicTextDetector>,
    mut ocr: Option<&mut RapidOcr>,
) -> Vec<(i32, i32)> {
    let (_w, total_h) = canvas.dimensions();
    let y_min = (window_top as i32 - safety_margin).max(0) as u32;
    let y_max = (window_bottom as i32 + safety_margin).min(total_h as i32) as u32;
    let h = y_max.saturating_sub(y_min);
    if h < 32 {
        return Vec::new();
    }

    let tile = canvas.crop_imm(0, y_min, canvas.width(), h);
    let mut raw_intervals: Vec<(i32, i32)> = Vec::new();

    // 1. FAST COMIC TEXT DETECTOR (RT-DETR / DBNET) — FINDS BOTH BUBBLES AND TEXT POLYGONS IN ~15MS
    if let Some(ref mut det) = detector {
        if let Ok(res) = det.detect(&tile) {
            for box_poly in &res.boxes {
                let (_, by, _, bh) = polygon_bounds(box_poly);
                let z_min = (by + y_min as i32 - safety_margin).max(0);
                let z_max = (by + bh + y_min as i32 + safety_margin).min(total_h as i32);
                raw_intervals.push((z_min, z_max));
            }
            for bubble in &res.bubbles {
                let z_min = (bubble.y + y_min as i32 - safety_margin).max(0);
                let z_max = (bubble.y + bubble.h + y_min as i32 + safety_margin).min(total_h as i32);
                raw_intervals.push((z_min, z_max));
            }
            for (tb, _) in &res.text_bubbles {
                let z_min = (tb.y + y_min as i32 - safety_margin).max(0);
                let z_max = (tb.y + tb.h + y_min as i32 + safety_margin).min(total_h as i32);
                raw_intervals.push((z_min, z_max));
            }
            for (tf, _) in &res.text_free {
                let z_min = (tf.y + y_min as i32 - safety_margin).max(0);
                let z_max = (tf.y + tf.h + y_min as i32 + safety_margin).min(total_h as i32);
                raw_intervals.push((z_min, z_max));
            }
            return merge_intervals(raw_intervals);
        }
    }

    // 2. RAPIDOCR DETECTOR (FALLBACK ONLY WHEN DETECTOR IS ABSENT)
    if let Some(ref mut o) = ocr {
        if let Ok(lines) = o.detect_and_recognize_tiled(&tile, false) {
            for line in &lines {
                let (_, by, _, bh) = polygon_bounds(&line.polygon);
                let z_min = (by + y_min as i32 - safety_margin).max(0);
                let z_max = (by + bh + y_min as i32 + safety_margin).min(total_h as i32);
                raw_intervals.push((z_min, z_max));
            }
        }
    }

    merge_intervals(raw_intervals)
}

/// DETECT DIALOGUE BUBBLES AND TEXT REGIONS ACROSS ENTIRE CANVAS
pub fn find_forbidden_text_zones(
    canvas: &DynamicImage,
    safety_margin: i32,
    mut detector: Option<&mut ComicTextDetector>,
    mut ocr: Option<&mut RapidOcr>,
) -> Vec<(i32, i32)> {
    let (_w, total_h) = canvas.dimensions();
    let mut raw_intervals: Vec<(i32, i32)> = Vec::new();

    let tile_height = 2000_u32;
    let tile_step = 1400_u32;
    let mut y_top = 0_u32;

    while y_top < total_h {
        let y_bottom = (y_top + tile_height).min(total_h);
        let cur_tile_h = y_bottom - y_top;

        if cur_tile_h >= 32 {
            let zones = detect_forbidden_zones_in_window(
                canvas,
                y_top,
                y_bottom,
                safety_margin,
                detector.as_deref_mut(),
                ocr.as_deref_mut(),
            );
            raw_intervals.extend(zones);
        }

        if y_bottom >= total_h {
            break;
        }
        y_top += tile_step;
    }

    merge_intervals(raw_intervals)
}

/// SEARCH CONTINUOUS CANVAS FOR OPTIMAL CUT POINTS AVOIDING ART & FORBIDDEN TEXT
pub fn find_optimal_cut_points(
    canvas: &DynamicImage,
    target_height: u32,
    min_height: u32,
    max_height: u32,
    forbidden_zones: &[(i32, i32)],
) -> Vec<u32> {
    let (w, total_h) = canvas.dimensions();
    if total_h <= max_height {
        return vec![total_h];
    }

    let rgb = canvas.to_rgb8();
    let mut row_variances = vec![0.0_f32; total_h as usize];
    let mut max_col_var = vec![0.0_f32; total_h as usize];
    let mut row_means = vec![0.0_f32; total_h as usize];
    let mut row_edge_energy = vec![0.0_f32; total_h as usize];

    let w_third = (w / 3).max(1);

    for y in 0..total_h {
        let mut sum_g = 0.0_f32;
        let mut sum_sq_g = 0.0_f32;

        let mut c1_sum = 0.0_f32;
        let mut c1_sq = 0.0_f32;
        let mut c2_sum = 0.0_f32;
        let mut c2_sq = 0.0_f32;
        let mut c3_sum = 0.0_f32;
        let mut c3_sq = 0.0_f32;

        for x in 0..w {
            let p = rgb.get_pixel(x, y);
            let gray = p[0] as f32 * 0.299 + p[1] as f32 * 0.587 + p[2] as f32 * 0.114;
            sum_g += gray;
            sum_sq_g += gray * gray;

            if x < w_third {
                c1_sum += gray;
                c1_sq += gray * gray;
            } else if x < 2 * w_third {
                c2_sum += gray;
                c2_sq += gray * gray;
            } else {
                c3_sum += gray;
                c3_sq += gray * gray;
            }
        }

        let mean = sum_g / w as f32;
        row_means[y as usize] = mean;
        row_variances[y as usize] = (sum_sq_g / w as f32) - (mean * mean);

        let c1_m = c1_sum / w_third as f32;
        let c1_v = (c1_sq / w_third as f32) - (c1_m * c1_m);

        let c2_m = c2_sum / w_third as f32;
        let c2_v = (c2_sq / w_third as f32) - (c2_m * c2_m);

        let c3_cnt = (w - 2 * w_third).max(1) as f32;
        let c3_m = c3_sum / c3_cnt;
        let c3_v = (c3_sq / c3_cnt) - (c3_m * c3_m);

        max_col_var[y as usize] = c1_v.max(c2_v).max(c3_v);
    }

    // ROW-TO-ROW VERTICAL DIFFS & EDGE ENERGY
    let mut row_diffs = vec![0.0_f32; total_h as usize];
    for y in 1..total_h as usize {
        row_diffs[y] = (row_means[y] - row_means[y - 1]).abs();
        row_edge_energy[y] = (row_means[y] - row_means[y - 1]).abs();
    }

    let mut cut_points = Vec::new();
    let mut current_y = 0_u32;

    while current_y < total_h {
        let remaining = total_h - current_y;
        if remaining <= max_height {
            cut_points.push(total_h);
            break;
        }

        let search_start = (current_y + min_height).min(total_h - 1);
        let search_end = (current_y + max_height).min(total_h - 1);
        let ideal_cut = (current_y + target_height) as f32;

        // 1ST PASS: SOLID GUTTER BANDS (ROW_VAR < 12.0 && MAX_COL_VAR < 15.0 && EDGE < 8.0)
        let mut gutter_candidates = Vec::new();
        for y in search_start..=search_end {
            if !is_point_forbidden(y as i32, forbidden_zones) {
                let yi = y as usize;
                if row_variances[yi] < 12.0 && max_col_var[yi] < 15.0 && row_edge_energy[yi] < 8.0 {
                    gutter_candidates.push(y);
                }
            }
        }

        let mut best_y = None;

        if !gutter_candidates.is_empty() {
            let mut bands: Vec<Vec<u32>> = Vec::new();
            let mut curr_band = vec![gutter_candidates[0]];

            for &gy in gutter_candidates.iter().skip(1) {
                if gy == *curr_band.last().unwrap() + 1 {
                    curr_band.push(gy);
                } else {
                    bands.push(curr_band);
                    curr_band = vec![gy];
                }
            }
            bands.push(curr_band);

            let mut best_band_score = -f32::INFINITY;
            for band in bands {
                let mid_y = band[band.len() / 2];
                let band_len = band.len() as f32;
                let dist_penalty = (mid_y as f32 - ideal_cut).abs() * 0.05;
                let band_score = (band_len * 2.5) - dist_penalty;
                if band_score > best_band_score {
                    best_band_score = band_score;
                    best_y = Some(mid_y);
                }
            }
        }

        // 2ND PASS: LOWEST VISUAL ENERGY ROW OUTSIDE FORBIDDEN TEXT
        if best_y.is_none() {
            let mut best_score = -f32::INFINITY;
            for y in search_start..=search_end {
                if !is_point_forbidden(y as i32, forbidden_zones) {
                    let yi = y as usize;
                    let var_val = row_variances[yi];
                    let diff_val = row_diffs[yi];
                    let edge_val = row_edge_energy[yi];
                    let dist = (y as f32 - ideal_cut).abs();

                    let flatness = -(var_val * 0.1 + diff_val * 2.0 + edge_val * 1.5);
                    let score = flatness - (dist * 0.02);
                    if score > best_score {
                        best_score = score;
                        best_y = Some(y);
                    }
                }
            }
        }

        // 3RD PASS: EXPAND SEARCH OUTWARDS TO FIND ANY NON-FORBIDDEN ROW BEFORE DEFAULTING
        let selected_y = best_y.unwrap_or_else(|| {
            let mut fallback_y = None;
            for offset in 1..=600 {
                if search_start >= offset + current_y + 100 {
                    let y = search_start - offset;
                    if !is_point_forbidden(y as i32, forbidden_zones) {
                        fallback_y = Some(y);
                        break;
                    }
                }
                if search_end + offset < total_h {
                    let y = search_end + offset;
                    if !is_point_forbidden(y as i32, forbidden_zones) {
                        fallback_y = Some(y);
                        break;
                    }
                }
            }
            fallback_y.unwrap_or_else(|| (current_y + target_height).min(search_end).max(search_start))
        });

        cut_points.push(selected_y);
        current_y = selected_y;
    }

    cut_points
}

/// SEARCH CONTINUOUS CANVAS FOR OPTIMAL CUT POINTS WITH FAST ON-DEMAND WINDOW TEXT DETECTION
pub fn find_optimal_cut_points_with_detectors(
    canvas: &DynamicImage,
    target_height: u32,
    min_height: u32,
    max_height: u32,
    mut detector: Option<&mut ComicTextDetector>,
    mut ocr: Option<&mut RapidOcr>,
) -> Vec<u32> {
    let (w, total_h) = canvas.dimensions();
    if total_h <= max_height {
        return vec![total_h];
    }

    let rgb = canvas.to_rgb8();
    let mut row_variances = vec![0.0_f32; total_h as usize];
    let mut max_col_var = vec![0.0_f32; total_h as usize];
    let mut row_means = vec![0.0_f32; total_h as usize];
    let mut row_edge_energy = vec![0.0_f32; total_h as usize];

    let w_third = (w / 3).max(1);

    for y in 0..total_h {
        let mut sum_g = 0.0_f32;
        let mut sum_sq_g = 0.0_f32;

        let mut c1_sum = 0.0_f32;
        let mut c1_sq = 0.0_f32;
        let mut c2_sum = 0.0_f32;
        let mut c2_sq = 0.0_f32;
        let mut c3_sum = 0.0_f32;
        let mut c3_sq = 0.0_f32;

        for x in 0..w {
            let p = rgb.get_pixel(x, y);
            let gray = p[0] as f32 * 0.299 + p[1] as f32 * 0.587 + p[2] as f32 * 0.114;
            sum_g += gray;
            sum_sq_g += gray * gray;

            if x < w_third {
                c1_sum += gray;
                c1_sq += gray * gray;
            } else if x < 2 * w_third {
                c2_sum += gray;
                c2_sq += gray * gray;
            } else {
                c3_sum += gray;
                c3_sq += gray * gray;
            }
        }

        let mean = sum_g / w as f32;
        row_means[y as usize] = mean;
        row_variances[y as usize] = (sum_sq_g / w as f32) - (mean * mean);

        let c1_m = c1_sum / w_third as f32;
        let c1_v = (c1_sq / w_third as f32) - (c1_m * c1_m);

        let c2_m = c2_sum / w_third as f32;
        let c2_v = (c2_sq / w_third as f32) - (c2_m * c2_m);

        let c3_cnt = (w - 2 * w_third).max(1) as f32;
        let c3_m = c3_sum / c3_cnt;
        let c3_v = (c3_sq / c3_cnt) - (c3_m * c3_m);

        max_col_var[y as usize] = c1_v.max(c2_v).max(c3_v);
    }

    // ROW-TO-ROW VERTICAL DIFFS & EDGE ENERGY
    let mut row_diffs = vec![0.0_f32; total_h as usize];
    for y in 1..total_h as usize {
        row_diffs[y] = (row_means[y] - row_means[y - 1]).abs();
        row_edge_energy[y] = (row_means[y] - row_means[y - 1]).abs();
    }

    let mut cut_points = Vec::new();
    let mut current_y = 0_u32;

    while current_y < total_h {
        let remaining = total_h - current_y;
        if remaining <= max_height {
            cut_points.push(total_h);
            break;
        }

        let search_start = (current_y + min_height).min(total_h - 1);
        let search_end = (current_y + max_height).min(total_h - 1);
        let ideal_cut = (current_y + target_height) as f32;

        // DYNAMICALLY DETECT FORBIDDEN DIALOGUE ZONES ONLY IN THE CURRENT CANDIDATE CUT WINDOW
        let forbidden_zones = if detector.is_some() || ocr.is_some() {
            detect_forbidden_zones_in_window(
                canvas,
                search_start,
                search_end,
                30,
                detector.as_deref_mut(),
                ocr.as_deref_mut(),
            )
        } else {
            Vec::new()
        };

        // 1ST PASS: SOLID GUTTER BANDS (ROW_VAR < 12.0 && MAX_COL_VAR < 15.0 && EDGE < 8.0)
        let mut gutter_candidates = Vec::new();
        for y in search_start..=search_end {
            if !is_point_forbidden(y as i32, &forbidden_zones) {
                let yi = y as usize;
                if row_variances[yi] < 12.0 && max_col_var[yi] < 15.0 && row_edge_energy[yi] < 8.0 {
                    gutter_candidates.push(y);
                }
            }
        }

        let mut best_y = None;

        if !gutter_candidates.is_empty() {
            let mut bands: Vec<Vec<u32>> = Vec::new();
            let mut curr_band = vec![gutter_candidates[0]];

            for &gy in gutter_candidates.iter().skip(1) {
                if gy == *curr_band.last().unwrap() + 1 {
                    curr_band.push(gy);
                } else {
                    bands.push(curr_band);
                    curr_band = vec![gy];
                }
            }
            bands.push(curr_band);

            let mut best_band_score = -f32::INFINITY;
            for band in bands {
                let mid_y = band[band.len() / 2];
                let band_len = band.len() as f32;
                let dist_penalty = (mid_y as f32 - ideal_cut).abs() * 0.05;
                let band_score = (band_len * 2.5) - dist_penalty;
                if band_score > best_band_score {
                    best_band_score = band_score;
                    best_y = Some(mid_y);
                }
            }
        }

        // 2ND PASS: LOWEST VISUAL ENERGY ROW OUTSIDE FORBIDDEN TEXT
        if best_y.is_none() {
            let mut best_score = -f32::INFINITY;
            for y in search_start..=search_end {
                if !is_point_forbidden(y as i32, &forbidden_zones) {
                    let yi = y as usize;
                    let var_val = row_variances[yi];
                    let diff_val = row_diffs[yi];
                    let edge_val = row_edge_energy[yi];
                    let dist = (y as f32 - ideal_cut).abs();

                    let flatness = -(var_val * 0.1 + diff_val * 2.0 + edge_val * 1.5);
                    let score = flatness - (dist * 0.02);
                    if score > best_score {
                        best_score = score;
                        best_y = Some(y);
                    }
                }
            }
        }

        // 3RD PASS: EXPAND SEARCH OUTWARDS TO FIND ANY NON-FORBIDDEN ROW BEFORE DEFAULTING
        let selected_y = best_y.unwrap_or_else(|| {
            let mut fallback_y = None;
            for offset in 1..=600 {
                if search_start >= offset + current_y + 100 {
                    let y = search_start - offset;
                    if !is_point_forbidden(y as i32, &forbidden_zones) {
                        fallback_y = Some(y);
                        break;
                    }
                }
                if search_end + offset < total_h {
                    let y = search_end + offset;
                    if !is_point_forbidden(y as i32, &forbidden_zones) {
                        fallback_y = Some(y);
                        break;
                    }
                }
            }
            fallback_y.unwrap_or_else(|| (current_y + target_height).min(search_end).max(search_start))
        });

        cut_points.push(selected_y);
        current_y = selected_y;
    }

    cut_points
}

/// STITCH MULTIPLE VERTICAL IMAGE STRIPS INTO A SINGLE UNIFIED CANVAS
pub fn stitch_images_vertically(images: &[DynamicImage]) -> DynamicImage {
    if images.is_empty() {
        return DynamicImage::new_rgb8(0, 0);
    }
    if images.len() == 1 {
        return images[0].clone();
    }

    let max_w = images.iter().map(|img| img.width()).max().unwrap_or(0);
    let mut total_h = 0;

    let mut resized_images = Vec::new();
    for img in images {
        let (w, h) = img.dimensions();
        if w != max_w {
            let new_h = (h as f32 * (max_w as f32 / w as f32)).round() as u32;
            let rgb_img = img.to_rgb8();
            let resized = image::imageops::resize(&rgb_img, max_w, new_h, image::imageops::FilterType::Triangle);
            total_h += new_h;
            resized_images.push(DynamicImage::ImageRgb8(resized));
        } else {
            total_h += h;
            resized_images.push(img.clone());
        }
    }

    let mut canvas: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::new(max_w, total_h);
    let mut curr_y = 0;

    for img in &resized_images {
        let (w, h) = img.dimensions();
        for y in 0..h {
            for x in 0..w {
                let p = img.get_pixel(x, y);
                canvas.put_pixel(x, curr_y + y, Rgb([p[0], p[1], p[2]]));
            }
        }
        curr_y += h;
    }

    DynamicImage::ImageRgb8(canvas)
}

/// SMART RESLICE CHAPTER WITH DIALOGUE BUBBLE & TEXT PROTECTION
pub fn smart_reslice_chapter(
    images: &[DynamicImage],
    target_height: u32,
    min_height: u32,
    max_height: u32,
    detector: Option<&mut ComicTextDetector>,
    ocr: Option<&mut RapidOcr>,
) -> Vec<DynamicImage> {
    if images.is_empty() {
        return Vec::new();
    }

    let stitched = stitch_images_vertically(images);
    let (w, total_h) = stitched.dimensions();
    if total_h <= max_height {
        return vec![stitched];
    }

    let cut_points = find_optimal_cut_points_with_detectors(
        &stitched,
        target_height,
        min_height,
        max_height,
        detector,
        ocr,
    );

    let mut pages = Vec::new();
    let mut prev_y = 0_u32;

    for cut_y in cut_points {
        if cut_y <= prev_y {
            continue;
        }
        let slice_h = cut_y - prev_y;
        if slice_h > 0 {
            let slice = stitched.crop_imm(0, prev_y, w, slice_h);
            pages.push(slice);
        }
        prev_y = cut_y;
    }

    pages
}
