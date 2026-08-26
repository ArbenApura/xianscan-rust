// -- CRATE / EXTERNAL IMPORTS -- //
use image::{DynamicImage, GenericImageView, ImageBuffer, Rgb};

// -- FUNCTIONS & ALGORITHMS -- //

/// SLICE VERTICAL TEXT STRIPS AT PROJECTION VALLEYS AND TILE THEM UPRIGHT HORIZONTALLY
pub fn vertical_to_upright_horizontal_strip(crop: &DynamicImage) -> Option<DynamicImage> {
    let (w, h) = crop.dimensions();
    if w < 4 || h < 4 || (h as f32) < 1.3 * (w as f32) {
        return None;
    }

    let rgb = crop.to_rgb8();

    // 1. COMPUTE HORIZONTAL INK PROJECTION PROFILE
    let mut proj = vec![0_u32; h as usize];
    let mut total_lum = 0_u64;
    for y in 0..h {
        for x in 0..w {
            let p = rgb.get_pixel(x, y);
            let lum = (p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000;
            total_lum += lum as u64;
        }
    }
    let mean_lum = (total_lum / (w as u64 * h as u64).max(1)) as u32;
    let is_dark_bg = mean_lum < 128;

    for y in 0..h {
        let mut ink_count = 0;
        for x in 0..w {
            let p = rgb.get_pixel(x, y);
            let lum = (p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000;
            let is_ink = if is_dark_bg { lum >= 150 } else { lum <= 180 };
            if is_ink {
                ink_count += 1;
            }
        }
        proj[y as usize] = ink_count;
    }

    // 2. FIND CUT VALLEYS APPROXIMATELY EVERY W PIXELS
    let est_char_count = ((h as f32 / w.max(1) as f32).round() as usize).max(1);
    let ideal_h = (h as f32 / est_char_count as f32) as usize;
    if ideal_h < 4 {
        return None;
    }

    let mut cut_points = vec![0_u32];
    for k in 1..est_char_count {
        let expected_y = k * ideal_h;
        let search_start = (expected_y.saturating_sub(ideal_h / 3)).max(1);
        let search_end = (expected_y + ideal_h / 3).min(h as usize - 1);

        let mut min_ink = u32::MAX;
        let mut best_y = expected_y;
        for y in search_start..=search_end {
            if proj[y] < min_ink {
                min_ink = proj[y];
                best_y = y;
            }
        }
        cut_points.push(best_y as u32);
    }
    cut_points.push(h);

    // 3. ASSEMBLE UPRIGHT HORIZONTAL STRIP
    let num_slices = cut_points.len() - 1;
    let max_slice_h = (0..num_slices)
        .map(|i| cut_points[i + 1] - cut_points[i])
        .max()
        .unwrap_or(w)
        .max(w);
    let target_h = max_slice_h;
    let total_w = w * num_slices as u32;

    let bg_color = if is_dark_bg { Rgb([0, 0, 0]) } else { Rgb([255, 255, 255]) };
    let mut strip = ImageBuffer::from_pixel(total_w, target_h, bg_color);

    for i in 0..num_slices {
        let y0 = cut_points[i];
        let y1 = cut_points[i + 1];
        let slice_h = y1.saturating_sub(y0);
        if slice_h == 0 {
            continue;
        }
        let paste_x = i as u32 * w;
        let paste_y = (target_h - slice_h) / 2;

        for cy in 0..slice_h {
            for cx in 0..w {
                let p = rgb.get_pixel(cx, y0 + cy);
                strip.put_pixel(paste_x + cx, paste_y + cy, *p);
            }
        }
    }

    Some(DynamicImage::ImageRgb8(strip))
}

/// SLICE A HORIZONTAL MULTI-LINE PARAGRAPH INTO INDIVIDUAL HORIZONTAL ROW STRIPS VIA INK PROJECTION
pub fn horizontal_paragraph_to_line_strips(crop: &DynamicImage) -> Vec<(Vec<[i32; 2]>, DynamicImage)> {
    let (w, h) = crop.dimensions();
    if w < 16 || h < 24 {
        return Vec::new();
    }

    let rgb = crop.to_rgb8();

    // 1. COMPUTE HORIZONTAL INK PROJECTION PROFILE
    let mut total_lum = 0_u64;
    for y in 0..h {
        for x in 0..w {
            let p = rgb.get_pixel(x, y);
            let lum = (p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000;
            total_lum += lum as u64;
        }
    }
    let mean_lum = (total_lum / (w as u64 * h as u64).max(1)) as u32;
    let is_dark_bg = mean_lum < 128;

    let mut proj = vec![0_u32; h as usize];
    for y in 0..h {
        let mut ink_count = 0;
        for x in 0..w {
            let p = rgb.get_pixel(x, y);
            let lum = (p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000;
            let is_ink = if is_dark_bg { lum >= 150 } else { lum <= 180 };
            if is_ink {
                ink_count += 1;
            }
        }
        proj[y as usize] = ink_count;
    }

    // 2. DETECT CONTINUOUS TEXT BANDS
    let min_ink_threshold = if is_dark_bg {
        ((w as f32 * 0.02).round() as u32).max(1)
    } else {
        ((w as f32 * 0.04).round() as u32).max(2)
    };
    let min_band_h = if is_dark_bg { 7 } else { 10 };
    let mut in_band = false;
    let mut band_start = 0_u32;
    let mut raw_bands = Vec::new();

    for y in 0..h {
        let has_ink = proj[y as usize] >= min_ink_threshold;
        if has_ink && !in_band {
            in_band = true;
            band_start = y;
        } else if !has_ink && in_band {
            in_band = false;
            let band_h = y - band_start;
            if band_h >= min_band_h {
                raw_bands.push((band_start, y));
            }
        }
    }
    if in_band {
        let band_h = h - band_start;
        if band_h >= min_band_h {
            raw_bands.push((band_start, h));
        }
    }

    if raw_bands.is_empty() {
        return Vec::new();
    }

    // 3. SPLIT OVERSIZED BANDS (WHERE 2 ROWS TOUCHED) AT LOCAL PROJECTION MINIMA
    let median_h = {
        let mut hs: Vec<u32> = raw_bands.iter().map(|(y0, y1)| y1 - y0).collect();
        hs.sort_unstable();
        hs[hs.len() / 2]
    };

    let mut final_bands = Vec::new();
    for (y0, y1) in raw_bands {
        let bh = y1 - y0;
        if bh >= (median_h as f32 * 1.8) as u32 && bh >= 45 {
            // FIND VALLEY IN THE MIDDLE 50% OF THE BAND
            let search_start = y0 + bh / 4;
            let search_end = y1 - bh / 4;
            let mut min_ink = u32::MAX;
            let mut best_cut = y0 + bh / 2;
            for y in search_start..=search_end {
                if proj[y as usize] < min_ink {
                    min_ink = proj[y as usize];
                    best_cut = y;
                }
            }
            if best_cut - y0 >= 12 && y1 - best_cut >= 12 {
                final_bands.push((y0, best_cut));
                final_bands.push((best_cut, y1));
            } else {
                final_bands.push((y0, y1));
            }
        } else {
            final_bands.push((y0, y1));
        }
    }

    // 4. EXTRACT LINE STRIP CROPS WITH PADDING
    let mut line_strips = Vec::new();
    for (y0, y1) in final_bands {
        let pad_y = 4_u32;
        let crop_y0 = y0.saturating_sub(pad_y);
        let crop_y1 = (y1 + pad_y).min(h);
        let crop_h = crop_y1 - crop_y0;

        if crop_h >= 8 && w >= 8 {
            let strip_img = crop.crop_imm(0, crop_y0, w, crop_h);
            let poly = vec![
                [0, y0 as i32],
                [w as i32, y0 as i32],
                [w as i32, y1 as i32],
                [0, y1 as i32],
            ];
            line_strips.push((poly, strip_img));
        }
    }

    line_strips
}
