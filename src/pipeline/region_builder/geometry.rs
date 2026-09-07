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
    let uniform_pad = if pad_pct <= 0.001 {
        0
    } else {
        (ref_dim * pad_pct * 1.5).round().max(1.0) as i32
    };

    // CLAMP EACH EDGE INDEPENDENTLY SO A BOX NEAR THE PAGE BOUNDARY DOES NOT
    // OVER-EXPAND ON THE OPPOSITE SIDE WHEN ONE SIDE IS CLIPPED.
    let left = (b.x - uniform_pad).max(0);
    let right = (b.x + b.w + uniform_pad).min(page_w as i32);
    let top = (b.y - uniform_pad).max(0);
    let bottom = (b.y + b.h + uniform_pad).min(page_h as i32);
    BoxRect {
        x: left,
        y: top,
        w: (right - left).max(1),
        h: (bottom - top).max(1),
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

/// EXTRACTS THE CARRIER CHAMBER OF A SPEECH BALLOON USING MORPHOLOGICAL OPENING.
/// SEVERS NARROW TAIL PROTRUSIONS (THICKNESS < 25PX) FROM THE WIDE BALLOON BODY.
pub fn extract_carrier_box_from_image(img: &DynamicImage, b: &BoxRect, t: &BoxRect) -> BoxRect {
    let (pw, ph) = img.dimensions();
    if b.w < 20 || b.h < 20 || pw == 0 || ph == 0 {
        return b.clone();
    }

    let pad = 6i32;
    let min_x = (b.x - pad).clamp(0, pw as i32) as u32;
    let min_y = (b.y - pad).clamp(0, ph as i32) as u32;
    let max_x = (b.x + b.w + pad).clamp(0, pw as i32) as u32;
    let max_y = (b.y + b.h + pad).clamp(0, ph as i32) as u32;

    if max_x <= min_x || max_y <= min_y {
        return b.clone();
    }

    let patch_w = (max_x - min_x) as usize;
    let patch_h = (max_y - min_y) as usize;
    if patch_w < 10 || patch_h < 10 {
        return b.clone();
    }

    let patch_rgb = img.crop_imm(min_x, min_y, patch_w as u32, patch_h as u32).to_rgb8();

    // 1. BUILD BINARY MASK OF BUBBLE INTERIOR
    let mut mask = vec![false; patch_w * patch_h];
    for py in 0..patch_h {
        let gy = min_y as i32 + py as i32;
        for px in 0..patch_w {
            let gx = min_x as i32 + px as i32;
            let p = patch_rgb.get_pixel(px as u32, py as u32);

            // Inside text box is always considered interior
            let in_text = gx >= t.x && gx < (t.x + t.w) && gy >= t.y && gy < (t.y + t.h);

            // Light/white bubble interior
            let is_light = p[0] >= 200 && p[1] >= 200 && p[2] >= 200;

            if in_text || is_light {
                mask[py * patch_w + px] = true;
            }
        }
    }

    // FILL SMALL ENCLOSED DARK HOLES (PUNCTUATION DOTS, UNCAPTURED STROKES, ELLIPSIS DOTS):
    // ANY ISOLATED DARK COMPONENT COMPLETELY ENCLOSED BY WHITE INTERIOR THAT IS SMALL (W <= 16 && H <= 16)
    // IS CAVITY INK AND MUST NOT BISECT THE BUBBLE MASK INTO DISCONNECTED HALVES.
    // LARGER BACKGROUND NOTCHES (SUCH AS INDENTATIONS BETWEEN THOUGHT LOBES) MUST NOT BE FILLED.
    let mut visited_dark = vec![false; patch_w * patch_h];
    for py in 1..(patch_h.saturating_sub(1)) {
        let row_offset = py * patch_w;
        for px in 1..(patch_w.saturating_sub(1)) {
            let offset = row_offset + px;
            if mask[offset] || visited_dark[offset] {
                continue;
            }
            let mut comp = Vec::new();
            let mut q = std::collections::VecDeque::new();
            let mut touches_border = false;
            let mut min_cx = px;
            let mut max_cx = px;
            let mut min_cy = py;
            let mut max_cy = py;

            visited_dark[offset] = true;
            q.push_back((px, py));
            while let Some((cx, cy)) = q.pop_front() {
                comp.push((cx, cy));
                min_cx = min_cx.min(cx);
                max_cx = max_cx.max(cx);
                min_cy = min_cy.min(cy);
                max_cy = max_cy.max(cy);
                for (dx, dy) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
                    let nx = cx as i32 + dx;
                    let ny = cy as i32 + dy;
                    if nx < 0 || nx >= patch_w as i32 || ny < 0 || ny >= patch_h as i32 {
                        touches_border = true;
                        continue;
                    }
                    let ux = nx as usize;
                    let uy = ny as usize;
                    let n_idx = uy * patch_w + ux;
                    if !mask[n_idx] && !visited_dark[n_idx] {
                        visited_dark[n_idx] = true;
                        q.push_back((ux, uy));
                    }
                }
            }

            let comp_w = max_cx - min_cx + 1;
            let comp_h = max_cy - min_cy + 1;
            if !touches_border && comp_w <= 16 && comp_h <= 16 && comp.len() <= 200 {
                for &(cx, cy) in &comp {
                    mask[cy * patch_w + cx] = true;
                }
            }
        }
    }

    // PRECOMPUTE HORIZONTAL RUN-LENGTH TO LEFT AND RIGHT TO AVOID O(R^2) INNER NESTED LOOPS
    let mut left_true = vec![0i32; patch_w * patch_h];
    let mut right_true = vec![0i32; patch_w * patch_h];
    for py in 0..patch_h {
        let row_offset = py * patch_w;
        let mut cur = 0i32;
        for px in 0..patch_w {
            if mask[row_offset + px] {
                left_true[row_offset + px] = cur;
                cur += 1;
            } else {
                left_true[row_offset + px] = 0;
                cur = 0;
            }
        }
        cur = 0;
        for px in (0..patch_w).rev() {
            if mask[row_offset + px] {
                right_true[row_offset + px] = cur;
                cur += 1;
            } else {
                right_true[row_offset + px] = 0;
                cur = 0;
            }
        }
    }

    // 2. MULTI-SCALE MORPHOLOGICAL EROSION
    // SPEECH BUBBLES USE R=14 FOR NARROW TAILS; WIDER THOUGHT BUBBLE LOBES AND LARGE BALLOONS
    // BENEFIT FROM LARGER KERNELS (UP TO R=23) TO SEVER BULBOUS TAIL ATTACHMENTS.
    let text_cx = ((t.x + t.w / 2 - min_x as i32) as usize).clamp(0, patch_w - 1);
    let text_cy = ((t.y + t.h / 2 - min_y as i32) as usize).clamp(0, patch_h - 1);

    let min_dim = b.w.min(b.h);
    let r_target = ((min_dim as f32 * 0.12).round() as i32).clamp(14, 28);
    let mut candidate_radii: Vec<i32> = if min_dim >= 180 {
        vec![r_target.max(26), 22, 18, 14]
    } else if min_dim >= 60 {
        vec![r_target.max(20), 18, 14]
    } else {
        vec![14]
    };
    candidate_radii.dedup();

    let mut best_carrier: Option<BoxRect> = None;

    for r_erode in candidate_radii {
        let r_sq = r_erode * r_erode;
        let mut dx_max_table = Vec::with_capacity((2 * r_erode + 1) as usize);
        for dy in -r_erode..=r_erode {
            let rem = r_sq - dy * dy;
            let dx_max = (rem as f32).sqrt().floor() as i32;
            dx_max_table.push(dx_max);
        }

        let mut eroded = vec![false; patch_w * patch_h];

        for py in r_erode as usize..(patch_h.saturating_sub(r_erode as usize)) {
            let row_offset = py * patch_w;
            for px in r_erode as usize..(patch_w.saturating_sub(r_erode as usize)) {
                let offset = row_offset + px;
                if !mask[offset] || left_true[offset] < r_erode || right_true[offset] < r_erode {
                    continue;
                }
                let mut fits = true;
                for (idx, &dx_max) in dx_max_table.iter().enumerate() {
                    let dy = idx as i32 - r_erode;
                    let ny = (py as i32 + dy) as usize;
                    let check_offset = ny * patch_w + px;
                    if !mask[check_offset] || left_true[check_offset] < dx_max || right_true[check_offset] < dx_max {
                        fits = false;
                        break;
                    }
                }
                if fits {
                    eroded[offset] = true;
                }
            }
        }

        // 3. FIND CONNECTED COMPONENT IN ERODED MASK CONTAINING OR NEAREST TO TEXT CENTER
        let mut seed = None;
        if eroded[text_cy * patch_w + text_cx] {
            seed = Some((text_cx, text_cy));
        } else {
            let mut min_dist = i32::MAX;
            let max_allowed_dist = (r_erode * 2).pow(2);
            for py in 0..patch_h {
                for px in 0..patch_w {
                    if eroded[py * patch_w + px] {
                        let d = (px as i32 - text_cx as i32).pow(2) + (py as i32 - text_cy as i32).pow(2);
                        if d < min_dist {
                            min_dist = d;
                            seed = Some((px, py));
                        }
                    }
                }
            }
            if min_dist > max_allowed_dist {
                seed = None;
            }
        }

        let (seed_x, seed_y) = match seed {
            Some(s) => s,
            None => continue,
        };

        // FLOOD FILL ON ERODED COMPONENT
        let mut visited = vec![false; patch_w * patch_h];
        let mut queue = std::collections::VecDeque::new();
        let mut component = Vec::new();

        queue.push_back((seed_x, seed_y));
        visited[seed_y * patch_w + seed_x] = true;

        while let Some((cx, cy)) = queue.pop_front() {
            component.push((cx, cy));
            for (dx, dy) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
                let nx = cx as i32 + dx;
                let ny = cy as i32 + dy;
                if nx >= 0 && nx < patch_w as i32 && ny >= 0 && ny < patch_h as i32 {
                    let ux = nx as usize;
                    let uy = ny as usize;
                    let idx = uy * patch_w + ux;
                    if eroded[idx] && !visited[idx] {
                        visited[idx] = true;
                        queue.push_back((ux, uy));
                    }
                }
            }
        }

        if component.is_empty() {
            continue;
        }

        // 4. DILATE CONNECTED COMPONENT BY R_ERODE TO RESTORE CARRIER CONTOUR (MASK BOUNDED)
        let mut reconstructed = vec![false; patch_w * patch_h];
        for &(cx, cy) in &component {
            reconstructed[cy * patch_w + cx] = true;
        }

        for &(cx, cy) in &component {
            let is_boundary = cx == 0 || cx + 1 >= patch_w || cy == 0 || cy + 1 >= patch_h
                || !visited[cy * patch_w + (cx - 1)]
                || !visited[cy * patch_w + (cx + 1)]
                || !visited[(cy - 1) * patch_w + cx]
                || !visited[(cy + 1) * patch_w + cx];

            if !is_boundary {
                continue;
            }

            for (idx, &dx_max) in dx_max_table.iter().enumerate() {
                let dy = idx as i32 - r_erode;
                let ny = cy as i32 + dy;
                if ny >= 0 && ny < patch_h as i32 {
                    let min_nx = (cx as i32 - dx_max).max(0) as usize;
                    let max_nx = (cx as i32 + dx_max).min(patch_w as i32 - 1) as usize;
                    let row_start = ny as usize * patch_w;
                    for ux in min_nx..=max_nx {
                        if mask[row_start + ux] {
                            reconstructed[row_start + ux] = true;
                        }
                    }
                }
            }
        }

        // 5. EXTRACT BOUNDING BOX OF RECONSTRUCTED CARRIER
        // FILTER OUT NARROW PROTRUSION TIPS (< 22% OF CHAMBER SPAN) THAT EXPANDED DURING DILATION
        let mut raw_min_px = patch_w;
        let mut raw_max_px = 0;
        let mut raw_min_py = patch_h;
        let mut raw_max_py = 0;

        for py in 0..patch_h {
            for px in 0..patch_w {
                if reconstructed[py * patch_w + px] {
                    raw_min_px = raw_min_px.min(px);
                    raw_max_px = raw_max_px.max(px);
                    raw_min_py = raw_min_py.min(py);
                    raw_max_py = raw_max_py.max(py);
                }
            }
        }

        if raw_min_px > raw_max_px || raw_min_py > raw_max_py {
            continue;
        }

        let raw_w = raw_max_px - raw_min_px + 1;
        let raw_h = raw_max_py - raw_min_py + 1;
        let min_row_w = 4.min(raw_w);
        let min_col_h = 4.min(raw_h);

        let mut min_py = raw_min_py;
        while min_py <= raw_max_py {
            let row_w = (raw_min_px..=raw_max_px)
                .filter(|&px| reconstructed[min_py * patch_w + px])
                .count();
            if row_w >= min_row_w {
                break;
            }
            min_py += 1;
        }

        let mut max_py = raw_max_py;
        while max_py >= min_py {
            let row_w = (raw_min_px..=raw_max_px)
                .filter(|&px| reconstructed[max_py * patch_w + px])
                .count();
            if row_w >= min_row_w {
                break;
            }
            max_py = max_py.saturating_sub(1);
        }

        let mut min_px = raw_min_px;
        while min_px <= raw_max_px {
            let col_h = (raw_min_py..=raw_max_py)
                .filter(|&py| reconstructed[py * patch_w + min_px])
                .count();
            if col_h >= min_col_h {
                break;
            }
            min_px += 1;
        }

        let mut max_px = raw_max_px;
        while max_px >= min_px {
            let col_h = (raw_min_py..=raw_max_py)
                .filter(|&py| reconstructed[py * patch_w + max_px])
                .count();
            if col_h >= min_col_h {
                break;
            }
            max_px = max_px.saturating_sub(1);
        }

        if min_px > max_px || min_py > max_py {
            continue;
        }

        let carrier_x = min_x as i32 + min_px as i32;
        let carrier_y = min_y as i32 + min_py as i32;
        let carrier_w = (max_px - min_px + 1) as i32;
        let carrier_h = (max_py - min_py + 1) as i32;

        let candidate = BoxRect {
            x: carrier_x.max(b.x),
            y: carrier_y.max(b.y),
            w: carrier_w.min(b.w).max(t.w),
            h: carrier_h.min(b.h).max(t.h),
        };

        // VALIDITY CHECK: CARRIER MUST COMFORTABLY ACCOMMODATE THE TEXT
        let encloses_text = candidate.x <= t.x
            && (candidate.x + candidate.w) >= (t.x + t.w)
            && candidate.y <= t.y
            && (candidate.y + candidate.h) >= (t.y + t.h);

        if encloses_text {
            let max_trim = (candidate.x - b.x).abs()
                .max((candidate.y - b.y).abs())
                .max(((b.x + b.w) - (candidate.x + candidate.w)).abs())
                .max(((b.y + b.h) - (candidate.y + candidate.h)).abs());
            let total_trim = (b.w - candidate.w).max(0) + (b.h - candidate.h).max(0);

            // IF A GENUINE TAIL CUT WAS ACHIEVED AT THIS RADIUS, ADOPT IT IMMEDIATELY
            if max_trim >= 14 || total_trim >= 18 {
                return candidate;
            }

            if best_carrier.is_none() {
                best_carrier = Some(candidate);
            }
        }
    }

    best_carrier.unwrap_or_else(|| b.clone())
}
