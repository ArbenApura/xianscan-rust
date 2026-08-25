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
