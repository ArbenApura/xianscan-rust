// -- CRATE / EXTERNAL IMPORTS -- //
use image::{DynamicImage, GenericImageView};

// -- INTERNAL IMPORTS -- //
use crate::ml::schemas::BoxRect;

// -- FUNCTIONS & ALGORITHMS -- //

/// EXPAND BOX BY A UNIFORM / ISOTROPIC MARGIN PERCENTAGE CLAMPED TO CANVAS BOUNDS
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

/// DYNAMICALLY EXTRACTS THE EXACT OUTLINE BOUNDS OF A SLANTED MESSAGE / SPEECH BALLOON CONTAINER
pub fn extract_slanted_bubble_envelope(
    img: &DynamicImage,
    min_u: f32,
    max_u: f32,
    min_v: f32,
    max_v: f32,
    angle_deg: f32,
) -> Option<(f32, f32, f32, f32)> {
    if angle_deg.abs() < 1.0 || (max_u - min_u) < 40.0 || (max_v - min_v) < 40.0 {
        return None;
    }
    let (page_w, page_h) = img.dimensions();
    let rgb_img = img.to_rgb8();
    let angle_rad = angle_deg * (std::f32::consts::PI / 180.0);
    let cos_a = angle_rad.cos();
    let sin_a = angle_rad.sin();

    // Helper to sample pixel at (u, v)
    let get_rgb = |u: f32, v: f32| -> Option<[u8; 3]> {
        let x = (u * cos_a - v * sin_a).round() as i32;
        let y = (u * sin_a + v * cos_a).round() as i32;
        if x >= 0 && x < page_w as i32 && y >= 0 && y < page_h as i32 {
            let p = rgb_img.get_pixel(x as u32, y as u32);
            Some([p[0], p[1], p[2]])
        } else {
            None
        }
    };

    let is_bubble_interior = |rgb: [u8; 3]| -> bool {
        rgb[0] >= 235 && rgb[1] >= 235 && rgb[2] >= 235
    };

    let is_dark_border_or_bg = |rgb: [u8; 3]| -> bool {
        (rgb[0] < 150 && rgb[1] < 150 && rgb[2] < 150) || (rgb[0] < 225 || rgb[1] < 225 || rgb[2] < 225)
    };

    // Check if the center area is predominantly white
    let center_u = (min_u + max_u) / 2.0;
    let center_v = (min_v + max_v) / 2.0;
    let center_rgb = get_rgb(center_u, center_v)?;
    if !is_bubble_interior(center_rgb) {
        return None;
    }

    let max_pad = 20.0f32;

    // Scan Top (decreasing v)
    let mut top_stops = Vec::new();
    for frac in [0.35, 0.50, 0.65] {
        let u = min_u + (max_u - min_u) * frac;
        let mut stop_v = min_v;
        for step in 0..=24 {
            let v = min_v - step as f32;
            if let Some(rgb) = get_rgb(u, v) {
                if is_dark_border_or_bg(rgb) {
                    stop_v = v;
                    break;
                }
            } else {
                break;
            }
        }
        top_stops.push(stop_v);
    }
    top_stops.sort_by(|a, b| a.total_cmp(b));
    let refined_min_v = top_stops[1].max(min_v - max_pad);

    // Scan Bottom (increasing v)
    let mut bottom_stops = Vec::new();
    for frac in [0.35, 0.50, 0.65] {
        let u = min_u + (max_u - min_u) * frac;
        let mut stop_v = max_v;
        for step in 0..=24 {
            let v = max_v + step as f32;
            if let Some(rgb) = get_rgb(u, v) {
                if is_dark_border_or_bg(rgb) {
                    stop_v = v;
                    break;
                }
            } else {
                break;
            }
        }
        bottom_stops.push(stop_v);
    }
    bottom_stops.sort_by(|a, b| a.total_cmp(b));
    let refined_max_v = bottom_stops[1].min(max_v + max_pad);

    // Scan Left (decreasing u)
    let mut left_stops = Vec::new();
    for frac in [0.35, 0.50, 0.65] {
        let v = min_v + (max_v - min_v) * frac;
        let mut stop_u = min_u;
        for step in 0..=24 {
            let u = min_u - step as f32;
            if let Some(rgb) = get_rgb(u, v) {
                if is_dark_border_or_bg(rgb) {
                    stop_u = u;
                    break;
                }
            } else {
                break;
            }
        }
        left_stops.push(stop_u);
    }
    left_stops.sort_by(|a, b| a.total_cmp(b));
    let refined_min_u = left_stops[1].max(min_u - max_pad);

    // Scan Right (increasing u)
    let mut right_stops = Vec::new();
    for frac in [0.35, 0.50, 0.65] {
        let v = min_v + (max_v - min_v) * frac;
        let mut stop_u = max_u;
        for step in 0..=24 {
            let u = max_u + step as f32;
            if let Some(rgb) = get_rgb(u, v) {
                if is_dark_border_or_bg(rgb) {
                    stop_u = u;
                    break;
                }
            } else {
                break;
            }
        }
        right_stops.push(stop_u);
    }
    right_stops.sort_by(|a, b| a.total_cmp(b));
    let refined_max_u = right_stops[1].min(max_u + max_pad);

    if (refined_max_u - refined_min_u) >= (max_u - min_u) && (refined_max_v - refined_min_v) >= (max_v - min_v) {
        Some((refined_min_u, refined_max_u, refined_min_v, refined_max_v))
    } else {
        None
    }
}
