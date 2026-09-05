// -- CRATE / EXTERNAL IMPORTS -- //
use image::{ImageBuffer, Rgb};

// -- INTERNAL IMPORTS -- //
use crate::ml::schemas::BoxRect;

// -- CONSTANTS -- //
// MINIMUM LUMINANCE FOR A WHITE BUBBLE FLOOR TO BE ELIGIBLE FOR CAVITY CLEANING
const WHITE_BUBBLE_MIN_LUM: u16 = 220;
// MAXIMUM CHROMATIC SATURATION ALLOWED FOR A MONOCHROME WHITE BUBBLE FLOOR
const WHITE_BUBBLE_MAX_SAT: f32 = 14.0;

// -- FUNCTIONS & ALGORITHMS -- //

/// CALCULATES LUMINANCE AND CHROMATIC SATURATION FOR AN RGB PIXEL
#[inline]
pub fn pixel_lum_and_sat(p: &Rgb<u8>) -> (u16, f32) {
    let lum = (p[0] as u16 + p[1] as u16 + p[2] as u16) / 3;
    let max_c = p[0].max(p[1]).max(p[2]) as f32;
    let min_c = p[0].min(p[1]).min(p[2]) as f32;
    let sat = if max_c > 0.0 { ((max_c - min_c) / max_c) * 255.0 } else { 0.0 };
    (lum, sat)
}

/// SAMPLES AND VALIDATES THE WHITE BUBBLE BACKGROUND COLOR FROM INTERIOR SEEDS
pub fn validate_white_bubble_background(
    img: &ImageBuffer<Rgb<u8>, Vec<u8>>,
    bubble_box: &BoxRect,
    seeds: &[[i32; 2]],
) -> Option<Rgb<u8>> {
    let (page_w, page_h) = img.dimensions();
    if bubble_box.w < 12 || bubble_box.h < 12 {
        return None;
    }

    // GATHER CANDIDATE SEED COORDINATES
    let candidate_seeds: Vec<(u32, u32)> = if !seeds.is_empty() {
        seeds
            .iter()
            .map(|s| {
                (
                    s[0].clamp(0, page_w as i32 - 1) as u32,
                    s[1].clamp(0, page_h as i32 - 1) as u32,
                )
            })
            .collect()
    } else {
        let cx = (bubble_box.x + bubble_box.w / 2).clamp(0, page_w as i32 - 1) as u32;
        let cy = (bubble_box.y + bubble_box.h / 2).clamp(0, page_h as i32 - 1) as u32;
        vec![(cx, cy)]
    };

    // SAMPLE 7x7 PATCH AROUND SEEDS TO FIND PREDOMINANT BACKGROUND
    let mut best_color = None;

    for (sx, sy) in candidate_seeds {
        let x0 = sx.saturating_sub(3);
        let y0 = sy.saturating_sub(3);
        let x1 = (sx + 4).min(page_w);
        let y1 = (sy + 4).min(page_h);

        let mut r_samples = Vec::new();
        let mut g_samples = Vec::new();
        let mut b_samples = Vec::new();

        for py in y0..y1 {
            for px in x0..x1 {
                let p = img.get_pixel(px, py);
                let (lum, sat) = pixel_lum_and_sat(p);
                // EXCLUDE DARK TEXT GLYPHS WHEN SAMPLING THE FLOOR
                if lum >= 180 && sat <= 20.0 {
                    r_samples.push(p[0]);
                    g_samples.push(p[1]);
                    b_samples.push(p[2]);
                }
            }
        }

        if r_samples.len() >= 8 {
            r_samples.sort_unstable();
            g_samples.sort_unstable();
            b_samples.sort_unstable();
            let mid = r_samples.len() / 2;
            let med_p = Rgb([r_samples[mid], g_samples[mid], b_samples[mid]]);
            let (lum, sat) = pixel_lum_and_sat(&med_p);
            if lum >= WHITE_BUBBLE_MIN_LUM && sat <= WHITE_BUBBLE_MAX_SAT {
                best_color = Some(med_p);
                break;
            }
        }
    }

    best_color
}

/// CLEANS A WHITE DIALOGUE BUBBLE'S INTERIOR VIA OUTSIDE-IN SHRINKWRAP
///
/// TRACES THE BUBBLE'S OUTER DRAWN STROKE FROM THE OUTSIDE INWARD, PRESERVING
/// ALL BORDER GRAPHICS, SPIKES, AND CURVATURE WHILE COMPLETELY WIPING
/// INPAINTING DUST, RESIDUAL MARKS, AND AGGREGATOR WATERMARKS INSIDE THE CAVITY.
pub fn clean_white_bubble_shrinkwrap(
    img: &mut ImageBuffer<Rgb<u8>, Vec<u8>>,
    bubble_box: &BoxRect,
    seeds: &[[i32; 2]],
    clean_boxes: &[BoxRect],
) -> bool {
    let (page_w, page_h) = img.dimensions();

    // 1. VALIDATE THAT BUBBLE INTERIOR IS WHITE BEFORE ALTERING PIXELS
    let fill_color = match validate_white_bubble_background(img, bubble_box, seeds) {
        Some(c) => c,
        None => return false,
    };

    // 2. EXTRACT CROP WITH 6PX EXTERIOR PADDING MARGIN
    let pad = 6i32;
    let bx0 = (bubble_box.x - pad).clamp(0, page_w as i32) as u32;
    let by0 = (bubble_box.y - pad).clamp(0, page_h as i32) as u32;
    let bx1 = (bubble_box.x + bubble_box.w + pad).clamp(0, page_w as i32) as u32;
    let by1 = (bubble_box.y + bubble_box.h + pad).clamp(0, page_h as i32) as u32;

    if bx1 <= bx0 || by1 <= by0 {
        return false;
    }

    let cw = (bx1 - bx0) as usize;
    let ch = (by1 - by0) as usize;
    if cw < 12 || ch < 12 {
        return false;
    }

    // 3. FLOOD FILL THE WHITE FLOOR FROM INTERIOR SEEDS
    let total = cw * ch;
    let mut white_floor = vec![false; total];
    let mut queue = std::collections::VecDeque::with_capacity(total.min(8192));

    let seed_coords: Vec<[i32; 2]> = if !seeds.is_empty() {
        seeds.to_vec()
    } else {
        vec![[bubble_box.x + bubble_box.w / 2, bubble_box.y + bubble_box.h / 2]]
    };

    for s in &seed_coords {
        let sx = s[0];
        let sy = s[1];
        if sx >= bx0 as i32 && sx < bx1 as i32 && sy >= by0 as i32 && sy < by1 as i32 {
            let lx = (sx - bx0 as i32) as usize;
            let ly = (sy - by0 as i32) as usize;

            // SEARCH 5x5 WINDOW AROUND SEED FOR THE BEST LIGHT FLOOR STARTING PIXEL
            let mut best_pt = None;
            let mut best_score = -1.0f32;
            for dy in -2i32..=2 {
                for dx in -2i32..=2 {
                    let cx = lx as i32 + dx;
                    let cy = ly as i32 + dy;
                    if cx >= 0 && cx < cw as i32 && cy >= 0 && cy < ch as i32 {
                        let gx = bx0 + cx as u32;
                        let gy = by0 + cy as u32;
                        let p = img.get_pixel(gx, gy);
                        let (lum, sat) = pixel_lum_and_sat(p);
                        if lum >= 210 && sat <= WHITE_BUBBLE_MAX_SAT {
                            let score = lum as f32 - sat * 2.0;
                            if score > best_score {
                                best_score = score;
                                best_pt = Some((cx as u32, cy as u32));
                            }
                        }
                    }
                }
            }

            if let Some((start_x, start_y)) = best_pt {
                let idx = (start_y as usize) * cw + (start_x as usize);
                if !white_floor[idx] {
                    white_floor[idx] = true;
                    queue.push_back((start_x, start_y));
                }
            } else {
                let idx = ly * cw + lx;
                if !white_floor[idx] {
                    white_floor[idx] = true;
                    queue.push_back((lx as u32, ly as u32));
                }
            }
        }
    }

    // BUBBLE BOX BOUNDS WITHIN THE CROPPED COORDINATE FRAME
    let b_min_x = (bubble_box.x.clamp(0, page_w as i32) as u32).saturating_sub(bx0) as usize;
    let b_min_y = (bubble_box.y.clamp(0, page_h as i32) as u32).saturating_sub(by0) as usize;
    let b_max_x = ((bubble_box.x + bubble_box.w).clamp(0, page_w as i32) as u32).saturating_sub(bx0) as usize;
    let b_max_y = ((bubble_box.y + bubble_box.h).clamp(0, page_h as i32) as u32).saturating_sub(by0) as usize;

    // EXPAND WHITE FLOOR ACROSS ALL LIGHT INTERIOR PIXELS (LUM >= 210, SAT <= WHITE_BUBBLE_MAX_SAT)
    // CLAMPED TO BUBBLE BOUNDS TO PREVENT LEAKING THROUGH DISCONTINUOUS BORDER GAPS INTO EXTERIOR GUTTERS
    while let Some((cx, cy)) = queue.pop_front() {
        for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
            let nx = cx as i32 + dx;
            let ny = cy as i32 + dy;
            if nx >= b_min_x as i32 && nx < b_max_x.min(cw) as i32 && ny >= b_min_y as i32 && ny < b_max_y.min(ch) as i32 {
                let unx = nx as usize;
                let uny = ny as usize;
                let idx = uny * cw + unx;
                if !white_floor[idx] {
                    let gx = bx0 + unx as u32;
                    let gy = by0 + uny as u32;
                    let p = img.get_pixel(gx, gy);
                    let (lum, sat) = pixel_lum_and_sat(p);

                    // INTERIOR FLOOR PIXEL: HIGH LUMINANCE AND MONOCHROME SATURATION MATCHING FILL_COLOR
                    let dr = (p[0] as i32 - fill_color[0] as i32).abs();
                    let dg = (p[1] as i32 - fill_color[1] as i32).abs();
                    let db = (p[2] as i32 - fill_color[2] as i32).abs();
                    let max_diff = dr.max(dg).max(db);

                    if lum >= 210 && sat <= WHITE_BUBBLE_MAX_SAT && max_diff <= 35 {
                        white_floor[idx] = true;
                        queue.push_back((unx as u32, uny as u32));
                    }
                }
            }
        }
    }



    // MORPHOLOGICAL CLOSING ON WHITE_FLOOR (RADIUS 2PX)
    // BRIDGES NARROW 1-2PX ANTI-ALIASED GAPS BETWEEN TEXT CHARACTERS AND THE BORDER STROKE
    // SO THAT HOLE-FILLING DOES NOT LEAK ALONG STROKE BRIDGES INTO CHARACTERS NEAR EDGES.
    let close_rad = 2i32;
    let mut dilated_floor = white_floor.clone();
    for cy in 0..ch {
        for cx in 0..cw {
            let idx = cy * cw + cx;
            if white_floor[idx] {
                for dy in -close_rad..=close_rad {
                    let ny = cy as i32 + dy;
                    if ny >= 0 && ny < ch as i32 {
                        for dx in -close_rad..=close_rad {
                            if dx * dx + dy * dy <= close_rad * close_rad {
                                let nx = cx as i32 + dx;
                                if nx >= 0 && nx < cw as i32 {
                                    let gx = bx0 + nx as u32;
                                    let gy = by0 + ny as u32;
                                    let (lum, _) = pixel_lum_and_sat(img.get_pixel(gx, gy));
                                    // NEVER BRIDGE FLOOR ACROSS SOLID DARK INK LINES (PANEL BORDERS OR HEAVY STROKES)
                                    if lum >= 110 {
                                        dilated_floor[(ny as usize) * cw + (nx as usize)] = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let mut closed_floor = dilated_floor.clone();
    for cy in 0..ch {
        for cx in 0..cw {
            let idx = cy * cw + cx;
            if !dilated_floor[idx] {
                for dy in -close_rad..=close_rad {
                    let ny = cy as i32 + dy;
                    if ny >= 0 && ny < ch as i32 {
                        for dx in -close_rad..=close_rad {
                            if dx * dx + dy * dy <= close_rad * close_rad {
                                let nx = cx as i32 + dx;
                                if nx >= 0 && nx < cw as i32 {
                                    closed_floor[(ny as usize) * cw + (nx as usize)] = false;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    let barrier_floor = closed_floor;

    // 4. TOPOLOGICAL HOLE FILLING: ANY PIXEL THAT CANNOT REACH THE CROP BORDER
    // WITHOUT CROSSING BARRIER_FLOOR IS AN INTERIOR HOLE (TEXT GLYPHS, WATERMARKS).
    let mut can_reach_edge = vec![false; total];
    let mut edge_queue = std::collections::VecDeque::with_capacity(total.min(4096));

    // SEED OUTER BOUNDARY OF CROP (TOP, BOTTOM, LEFT, RIGHT)
    for cx in 0..cw {
        let top = cx;
        if !barrier_floor[top] && !can_reach_edge[top] {
            can_reach_edge[top] = true;
            edge_queue.push_back((cx as u32, 0u32));
        }
        let bot = (ch - 1) * cw + cx;
        if !barrier_floor[bot] && !can_reach_edge[bot] {
            can_reach_edge[bot] = true;
            edge_queue.push_back((cx as u32, (ch - 1) as u32));
        }
    }

    for cy in 0..ch {
        let left = cy * cw;
        if !barrier_floor[left] && !can_reach_edge[left] {
            can_reach_edge[left] = true;
            edge_queue.push_back((0u32, cy as u32));
        }
        let right = cy * cw + (cw - 1);
        if !barrier_floor[right] && !can_reach_edge[right] {
            can_reach_edge[right] = true;
            edge_queue.push_back(((cw - 1) as u32, cy as u32));
        }
    }

    while let Some((cx, cy)) = edge_queue.pop_front() {
        for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
            let nx = cx as i32 + dx;
            let ny = cy as i32 + dy;
            if nx >= 0 && nx < cw as i32 && ny >= 0 && ny < ch as i32 {
                let unx = nx as usize;
                let uny = ny as usize;
                let idx = uny * cw + unx;
                if !barrier_floor[idx] && !can_reach_edge[idx] {
                    can_reach_edge[idx] = true;
                    edge_queue.push_back((nx as u32, ny as u32));
                }
            }
        }
    }

    // 5. IDENTIFY OUTER STROKE BORDER: DARK PIXELS (LUM < 195) THAT TOUCH THE OUTSIDE WORLD
    // FLOOD FILL INWARD ALONG CONNECTED BORDER ARTWORK (STROKES, SPEEDLINES, SHADING TEXTURES)
    // PRESERVES ALL INWARD-RADIATING GRAPHICS WHILE STOPPING AT THE WHITE FLOOR (LUM >= 205)
    let mut protected_stroke = vec![false; total];
    let mut stroke_queue = std::collections::VecDeque::new();

    for cy in 0..ch {
        for cx in 0..cw {
            let idx = cy * cw + cx;
            if !can_reach_edge[idx] {
                let gx = bx0 + cx as u32;
                let gy = by0 + cy as u32;
                let p = img.get_pixel(gx, gy);
                let (lum, _) = pixel_lum_and_sat(p);

                if lum < 195 {
                    let mut touches_outside = false;
                    for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                        let nx = cx as i32 + dx;
                        let ny = cy as i32 + dy;
                        if nx < 0 || nx >= cw as i32 || ny < 0 || ny >= ch as i32 {
                            touches_outside = true;
                            break;
                        } else {
                            let n_idx = (ny as usize) * cw + (nx as usize);
                            if can_reach_edge[n_idx] {
                                touches_outside = true;
                                break;
                            }
                        }
                    }
                    if touches_outside {
                        protected_stroke[idx] = true;
                        stroke_queue.push_back((cx as u32, cy as u32));
                    }
                }
            }
        }
    }

    // PROTECT UNCLEANED DARK STROKES (PRESERVED ARTWORK, UNTRANSLATED ELLIPSES, SYMBOLS)
    // ANY DARK PIXEL (LUM < 195) THAT IS NOT WITHIN VICINITY OF THE REQUESTED CLEAN BOXES IS PRESERVED
    if !clean_boxes.is_empty() {
        let clean_pad = 12i32;
        for cy in 0..ch {
            for cx in 0..cw {
                let idx = cy * cw + cx;
                if !can_reach_edge[idx] && !protected_stroke[idx] {
                    let gx = bx0 + cx as u32;
                    let gy = by0 + cy as u32;
                    let p = img.get_pixel(gx, gy);
                    let (lum, _) = pixel_lum_and_sat(p);

                    if lum < 195 {
                        let is_near_clean_box = clean_boxes.iter().any(|cb| {
                            let gx_i = gx as i32;
                            let gy_i = gy as i32;
                            gx_i >= cb.x - clean_pad
                                && gx_i <= cb.x + cb.w + clean_pad
                                && gy_i >= cb.y - clean_pad
                                && gy_i <= cb.y + cb.h + clean_pad
                        });

                        if !is_near_clean_box {
                            protected_stroke[idx] = true;
                            stroke_queue.push_back((cx as u32, cy as u32));
                        }
                    }
                }
            }
        }
    }

    while let Some((cx, cy)) = stroke_queue.pop_front() {
        for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1), (-1, -1), (1, -1), (-1, 1), (1, 1)] {
            let nx = cx as i32 + dx;
            let ny = cy as i32 + dy;
            if nx >= 0 && nx < cw as i32 && ny >= 0 && ny < ch as i32 {
                let unx = nx as usize;
                let uny = ny as usize;
                let n_idx = uny * cw + unx;
                if !protected_stroke[n_idx] && !can_reach_edge[n_idx] {
                    let gx = bx0 + nx as u32;
                    let gy = by0 + ny as u32;
                    let p = img.get_pixel(gx, gy);
                    let (lum, sat) = pixel_lum_and_sat(p);
                    if lum < 205 && sat <= 30.0 {
                        protected_stroke[n_idx] = true;
                        stroke_queue.push_back((nx as u32, ny as u32));
                    }
                }
            }
        }
    }

    // ALSO EXPAND BY 1PX TO PRESERVE SUBTLE ANTI-ALIASING EDGES
    let mut expanded_protection = protected_stroke.clone();
    for cy in 0..ch {
        for cx in 0..cw {
            let idx = cy * cw + cx;
            if protected_stroke[idx] {
                for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                    let nx = cx as i32 + dx;
                    let ny = cy as i32 + dy;
                    if nx >= 0 && nx < cw as i32 && ny >= 0 && ny < ch as i32 {
                        let n_idx = (ny as usize) * cw + (nx as usize);
                        expanded_protection[n_idx] = true;
                    }
                }
            }
        }
    }
    let protected_stroke = expanded_protection;

    // 6. ASSEMBLE CANDIDATE CAVITY FILL MASK WITHIN BUBBLE BOUNDS
    let b_min_x = (bubble_box.x.clamp(0, page_w as i32) as u32).saturating_sub(bx0) as usize;
    let b_min_y = (bubble_box.y.clamp(0, page_h as i32) as u32).saturating_sub(by0) as usize;
    let b_max_x = ((bubble_box.x + bubble_box.w).clamp(0, page_w as i32) as u32).saturating_sub(bx0) as usize;
    let b_max_y = ((bubble_box.y + bubble_box.h).clamp(0, page_h as i32) as u32).saturating_sub(by0) as usize;

    let mut cavity = vec![false; total];
    let mut total_cavity_count = 0usize;
    let mut white_floor_count = 0usize;
    let mut white_lums = Vec::new();
    let mut white_sats = Vec::new();
    let mut white_lum_sum = 0.0f64;
    let mut white_sat_sum = 0.0f32;

    for cy in b_min_y..b_max_y.min(ch) {
        for cx in b_min_x..b_max_x.min(cw) {
            let idx = cy * cw + cx;
            if !can_reach_edge[idx] && !protected_stroke[idx] {
                cavity[idx] = true;
                total_cavity_count += 1;

                let gx = bx0 + cx as u32;
                let gy = by0 + cy as u32;
                let (lum, sat) = pixel_lum_and_sat(img.get_pixel(gx, gy));
                if lum >= 180 {
                    white_floor_count += 1;
                    white_lums.push(lum);
                    white_sats.push(sat);
                    white_lum_sum += lum as f64;
                    white_sat_sum += sat;
                }
            }
        }
    }

    if total_cavity_count == 0 || white_floor_count == 0 {
        return false;
    }

    // THE CAVITY MUST BE DOMINATED BY SOLID WHITE FLOOR (>= 80% OF CAVITY PIXELS)
    // RESIDUAL INK STROKES, TEXT REMNANTS, AND SMUDGES OCCUPY ONLY A MINORITY (<20%) OF THE CAVITY.
    let white_ratio = white_floor_count as f32 / total_cavity_count as f32;
    if white_ratio < 0.80 {
        return false;
    }

    white_sats.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let cav_p90_sat = if !white_sats.is_empty() { white_sats[(white_sats.len() * 9) / 10] } else { 0.0 };
    let cav_mean_sat = white_sat_sum / white_floor_count as f32;

    white_lums.sort_unstable();
    let cav_mean_lum = white_lum_sum / white_floor_count as f64;
    let cav_p10_lum = if !white_lums.is_empty() { white_lums[(white_lums.len() * 1) / 10] } else { 0 };
    let cav_p90_lum = if !white_lums.is_empty() { white_lums[(white_lums.len() * 9) / 10] } else { 0 };
    let lum_spread = cav_p90_lum.saturating_sub(cav_p10_lum);

    // REJECT SEMI-TRANSPARENT OR ARTISTIC BUBBLE CAVITIES
    // SOLID WHITE DIALOGUE BUBBLE FLOORS EXHIBIT HIGH UNIFORM LUMINANCE (SPREAD <= 12, MEAN LUM >= 246)
    // AND NEGLIGIBLE COLOR SATURATION (MEAN SAT <= 4.5, P90 SAT <= 8.0).
    // BUBBLES WITH BACKGROUND ARTWORK BLEED-THROUGH HAVE HIGH LUMINANCE SPREAD OR SATURATION,
    // AND MUST BE PRESERVED AS NEURAL INPAINTED ARTWORK INSTEAD OF BEING OVERWRITTEN WITH SOLID WHITE.
    if lum_spread > 12 || cav_mean_sat > 4.5 || cav_p90_sat > 8.0 || cav_mean_lum < 246.0 {
        return false;
    }

    // 7. COMPUTE EUCLIDEAN DISTANCE MAP FROM EVERY CAVITY PIXEL TO NEAREST NON-CAVITY EDGE
    // FAST TWO-PASS 8-NEIGHBOR DISTANCE TRANSFORM (<0.2MS PER BUBBLE)
    let mut dist = vec![0.0f32; total];
    for idx in 0..total {
        if cavity[idx] {
            dist[idx] = 1e6f32;
        }
    }

    // FORWARD PASS: TOP-LEFT TO BOTTOM-RIGHT
    for cy in 0..ch {
        for cx in 0..cw {
            let idx = cy * cw + cx;
            if dist[idx] > 0.0 {
                let mut d = dist[idx];
                if cx > 0 {
                    d = d.min(dist[idx - 1] + 1.0);
                }
                if cy > 0 {
                    d = d.min(dist[idx - cw] + 1.0);
                    if cx > 0 {
                        d = d.min(dist[idx - cw - 1] + 1.4142);
                    }
                    if cx + 1 < cw {
                        d = d.min(dist[idx - cw + 1] + 1.4142);
                    }
                }
                dist[idx] = d;
            }
        }
    }

    // BACKWARD PASS: BOTTOM-RIGHT TO TOP-LEFT
    for cy in (0..ch).rev() {
        for cx in (0..cw).rev() {
            let idx = cy * cw + cx;
            if dist[idx] > 0.0 {
                let mut d = dist[idx];
                if cx + 1 < cw {
                    d = d.min(dist[idx + 1] + 1.0);
                }
                if cy + 1 < ch {
                    d = d.min(dist[idx + cw] + 1.0);
                    if cx + 1 < cw {
                        d = d.min(dist[idx + cw + 1] + 1.4142);
                    }
                    if cx > 0 {
                        d = d.min(dist[idx + cw - 1] + 1.4142);
                    }
                }
                dist[idx] = d;
            }
        }
    }

    // 8. ANTI-ALIASED ALPHA COMPOSITING
    // FEATHER RADIUS 2.5PX BLENDS SMOOTHLY INTO STROKES AND TEXTURES
    // HERMITE SMOOTHSTEP ENSURES C1 CONTINUITY WITH ZERO VISIBLE HARD CONTOURS
    let feather_radius = 2.5f32;
    let mut painted_count = 0usize;

    for cy in b_min_y..b_max_y.min(ch) {
        let gy = by0 + cy as u32;
        for cx in b_min_x..b_max_x.min(cw) {
            let idx = cy * cw + cx;
            if cavity[idx] {
                let d = dist[idx];
                let alpha = if d >= feather_radius {
                    1.0f32
                } else {
                    let t = (d / feather_radius).clamp(0.0, 1.0);
                    3.0 * t * t - 2.0 * t * t * t
                };

                let gx = bx0 + cx as u32;
                if alpha >= 0.999 {
                    img.put_pixel(gx, gy, fill_color);
                } else if alpha > 0.001 {
                    let orig = img.get_pixel(gx, gy);
                    let r = (alpha * fill_color[0] as f32 + (1.0 - alpha) * orig[0] as f32).round() as u8;
                    let g = (alpha * fill_color[1] as f32 + (1.0 - alpha) * orig[1] as f32).round() as u8;
                    let b = (alpha * fill_color[2] as f32 + (1.0 - alpha) * orig[2] as f32).round() as u8;
                    img.put_pixel(gx, gy, Rgb([r, g, b]));
                }
                painted_count += 1;
            }
        }
    }

    painted_count > 0
}
