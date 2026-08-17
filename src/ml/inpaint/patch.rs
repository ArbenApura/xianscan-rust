use image::{ImageBuffer, Luma, Rgb};
use crate::ml::geometry::{dilate_mask, fill_polygon};

/// Extracts 8-connected component bounding boxes (cv2.connectedComponentsWithStats port)
pub fn find_mask_components(mask: &ImageBuffer<Luma<u8>, Vec<u8>>) -> Vec<(u32, u32, u32, u32)> {
    let (w, h) = mask.dimensions();
    let raw = mask.as_raw();
    let mut visited = vec![false; (w * h) as usize];
    let mut components = Vec::new();

    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) as usize;
            if raw[idx] > 0 && !visited[idx] {
                let mut min_x = x;
                let mut max_x = x;
                let mut min_y = y;
                let mut max_y = y;

                let mut queue = std::collections::VecDeque::new();
                queue.push_back((x, y));
                visited[idx] = true;

                while let Some((cx, cy)) = queue.pop_front() {
                    min_x = min_x.min(cx);
                    max_x = max_x.max(cx);
                    min_y = min_y.min(cy);
                    max_y = max_y.max(cy);

                    for (dx, dy) in [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)] {
                        let nx = cx as isize + dx;
                        let ny = cy as isize + dy;
                        if nx >= 0 && nx < w as isize && ny >= 0 && ny < h as isize {
                            let n_idx = (ny as usize) * (w as usize) + (nx as usize);
                            if raw[n_idx] > 0 && !visited[n_idx] {
                                visited[n_idx] = true;
                                queue.push_back((nx as u32, ny as u32));
                            }
                        }
                    }
                }

                let bw = max_x - min_x + 1;
                let bh = max_y - min_y + 1;
                components.push((min_x, min_y, bw, bh));
            }
        }
    }

    components
}

/// Builds binary mask with precise polygon scanline rasterization + dilation (build_mask port).
pub fn build_mask(height: u32, width: u32, polygons: &[Vec<[i32; 2]>], dilate_px: i32) -> ImageBuffer<Luma<u8>, Vec<u8>> {
    let mut raw_mask = vec![0_u8; (width * height) as usize];

    for poly in polygons {
        fill_polygon(&mut raw_mask, width as usize, height as usize, poly, 255);
    }

    let dilated = if dilate_px > 0 {
        dilate_mask(&raw_mask, width as usize, height as usize, dilate_px)
    } else {
        raw_mask
    };

    ImageBuffer::from_raw(width, height, dilated).unwrap_or_else(|| ImageBuffer::new(width, height))
}

/// Evaluates whether the unmasked perimeter and background around a patch mask is a flat/solid color (e.g. white comic speech bubble).
pub fn is_solid_background_patch(
    patch_rgb: &ImageBuffer<Rgb<u8>, Vec<u8>>,
    patch_mask: &ImageBuffer<Luma<u8>, Vec<u8>>,
) -> Option<Rgb<u8>> {
    let (w, h) = patch_rgb.dimensions();
    let raw_rgb = patch_rgb.as_raw();
    let raw_mask = patch_mask.as_raw();

    let mut r_sum = 0.0_f64;
    let mut g_sum = 0.0_f64;
    let mut b_sum = 0.0_f64;
    let mut count = 0_usize;

    // Collect unmasked background pixels
    for i in 0..(w * h) as usize {
        if raw_mask[i] == 0 {
            let r = raw_rgb[i * 3] as f64;
            let g = raw_rgb[i * 3 + 1] as f64;
            let b = raw_rgb[i * 3 + 2] as f64;
            r_sum += r;
            g_sum += g;
            b_sum += b;
            count += 1;
        }
    }

    if count < 8 {
        return None;
    }

    let mean_r = r_sum / count as f64;
    let mean_g = g_sum / count as f64;
    let mean_b = b_sum / count as f64;

    // Calculate variance
    let mut var_sum = 0.0_f64;
    for i in 0..(w * h) as usize {
        if raw_mask[i] == 0 {
            let r = raw_rgb[i * 3] as f64;
            let g = raw_rgb[i * 3 + 1] as f64;
            let b = raw_rgb[i * 3 + 2] as f64;
            let dr = r - mean_r;
            let dg = g - mean_g;
            let db = b - mean_b;
            var_sum += (dr * dr + dg * dg + db * db) / 3.0;
        }
    }

    let std_dev = (var_sum / count as f64).sqrt();

    // Comic speech bubbles are typically white/near-white (mean > 230) with low std_dev (< 10.0)
    // or solid flat color with very low std_dev (< 4.0)
    let is_white_bubble = mean_r >= 230.0 && mean_g >= 230.0 && mean_b >= 230.0 && std_dev < 10.0;
    let is_solid_flat = std_dev < 4.0;

    if is_white_bubble || is_solid_flat {
        Some(Rgb([
            mean_r.round().clamp(0.0, 255.0) as u8,
            mean_g.round().clamp(0.0, 255.0) as u8,
            mean_b.round().clamp(0.0, 255.0) as u8,
        ]))
    } else {
        None
    }
}
