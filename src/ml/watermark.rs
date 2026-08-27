use image::{DynamicImage, GenericImageView, ImageBuffer, Rgb};
use super::schemas::BoxRect;
use super::detect::{is_watermark_line, is_pure_watermark_region};

pub struct WatermarkRemover;

impl Default for WatermarkRemover {
    fn default() -> Self {
        Self::new()
    }
}

impl WatermarkRemover {
    pub fn new() -> Self {
        Self
    }

    /// Converts RGB pixel to HSV (H in [0, 180], S in [0, 255], V in [0, 255] matching OpenCV HSV).
    #[inline]
    fn rgb_to_hsv(r: u8, g: u8, b: u8) -> (u8, u8, u8) {
        let rf = r as f32;
        let gf = g as f32;
        let bf = b as f32;

        let max_c = rf.max(gf).max(bf);
        let min_c = rf.min(gf).min(bf);
        let delta = max_c - min_c;

        let v = max_c as u8;
        let s = if max_c > 0.0 {
            ((delta / max_c) * 255.0) as u8
        } else {
            0
        };

        let mut h = if delta > 0.0 {
            if (max_c - rf).abs() < 1e-4 {
                60.0 * ((gf - bf) / delta)
            } else if (max_c - gf).abs() < 1e-4 {
                60.0 * (2.0 + (bf - rf) / delta)
            } else {
                60.0 * (4.0 + (rf - gf) / delta)
            }
        } else {
            0.0
        };

        if h < 0.0 {
            h += 360.0;
        }
        // OpenCV scales H to [0, 180]
        let h_cv = ((h / 2.0).round().clamp(0.0, 180.0)) as u8;
        (h_cv, s, v)
    }

    /// Generates a binary mask for chromatic watermarks / logo overlays colliding with white speech bubbles.
    /// Strictly executed on raw img_bgr / img_rgb.
    pub fn create_bubble_watermark_mask(
        &self,
        img: &DynamicImage,
        bubble_thresh: u8,
        min_sat: u8,
        min_val: u8,
        min_color_diff: u8,
    ) -> ImageBuffer<image::Luma<u8>, Vec<u8>> {
        let (w, h) = img.dimensions();
        let page_area = (w * h) as usize;
        let mut mask_buf = ImageBuffer::new(w, h);

        if w < 10 || h < 10 {
            return mask_buf;
        }

        // 1. Identify white speech bubble candidates (gray >= bubble_thresh && sat <= 35)
        let mut bright_mask = vec![false; (w * h) as usize];
        let rgb_img = img.to_rgb8();

        for y in 0..h {
            for x in 0..w {
                let p = rgb_img.get_pixel(x, y);
                let gray = (p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000;
                let (_h_val, s_val, _v_val) = Self::rgb_to_hsv(p[0], p[1], p[2]);

                if gray as u8 >= bubble_thresh && s_val <= 35 {
                    bright_mask[(y * w + x) as usize] = true;
                }
            }
        }

        // Find connected bubble components and fill convex hull
        let mut visited = vec![false; (w * h) as usize];
        let mut bubble_mask = vec![0_u8; (w * h) as usize];

        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) as usize;
                if bright_mask[idx] && !visited[idx] {
                    let mut queue = std::collections::VecDeque::new();
                    let mut comp = Vec::new();
                    queue.push_back((x, y));
                    visited[idx] = true;

                    while let Some((cx, cy)) = queue.pop_front() {
                        comp.push([cx as f32, cy as f32]);
                        for (dx, dy) in [(0, 1), (1, 0), (0, -1), (-1, 0)] {
                            let nx = cx as isize + dx;
                            let ny = cy as isize + dy;
                            if nx >= 0 && nx < w as isize && ny >= 0 && ny < h as isize {
                                let nidx = (ny as usize) * (w as usize) + (nx as usize);
                                if bright_mask[nidx] && !visited[nidx] {
                                    visited[nidx] = true;
                                    queue.push_back((nx as u32, ny as u32));
                                }
                            }
                        }
                    }

                    let area = comp.len();
                    if area >= 400 && area <= 120_000.max((page_area as f32 * 0.50) as usize) {
                        let hull = super::geometry::convex_hull(&comp);
                        let i32_hull: Vec<[i32; 2]> = hull.iter().map(|p| [p[0] as i32, p[1] as i32]).collect();
                        super::geometry::fill_polygon(&mut bubble_mask, w as usize, h as usize, &i32_hull, 255);
                    }
                }
            }
        }

        // Morphological dilation / close to connect bubble regions
        let bubble_candidates = super::geometry::dilate_mask(&bubble_mask, w as usize, h as usize, 17);

        // 2. Detect chromatic watermark pixels (red, brown, blue, cyan, purple)
        let mut chromatic_mask = vec![false; (w * h) as usize];

        for y in 0..h {
            for x in 0..w {
                let p = rgb_img.get_pixel(x, y);
                let (h_val, s_val, v_val) = Self::rgb_to_hsv(p[0], p[1], p[2]);
                let max_c = p[0].max(p[1]).max(p[2]);
                let min_c = p[0].min(p[1]).min(p[2]);
                let color_diff = max_c - min_c;

                let red_wm = !(15..=165).contains(&h_val) && s_val >= min_sat && v_val >= min_val;
                let brown_wm = (15..=45).contains(&h_val) && s_val >= min_sat && v_val >= min_val;
                let blue_wm = (85..=135).contains(&h_val) && s_val >= min_sat && v_val >= min_val;
                let other_chromatic = (s_val >= 25.max(min_sat) || color_diff >= 20.max(min_color_diff)) && v_val >= 75.max(min_val);

                if red_wm || brown_wm || blue_wm || other_chromatic {
                    chromatic_mask[(y * w + x) as usize] = true;
                }
            }
        }

        // Colliding pixels
        let mut colliding = vec![false; (w * h) as usize];
        for i in 0..(w * h) as usize {
            colliding[i] = chromatic_mask[i] && bubble_candidates[i] > 0;
        }

        // Filter connected components for watermark text strokes
        let mut visited_coll = vec![false; (w * h) as usize];
        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) as usize;
                if colliding[idx] && !visited_coll[idx] {
                    let mut queue = std::collections::VecDeque::new();
                    let mut comp = Vec::new();
                    queue.push_back((x, y));
                    visited_coll[idx] = true;

                    let mut min_cx = x;
                    let mut max_cx = x;
                    let mut min_cy = y;
                    let mut max_cy = y;

                    while let Some((cx, cy)) = queue.pop_front() {
                        comp.push((cx, cy));
                        min_cx = min_cx.min(cx);
                        max_cx = max_cx.max(cx);
                        min_cy = min_cy.min(cy);
                        max_cy = max_cy.max(cy);

                        for (dx, dy) in [(0, 1), (1, 0), (0, -1), (-1, 0), (1, 1), (-1, 1), (1, -1), (-1, -1)] {
                            let nx = cx as isize + dx;
                            let ny = cy as isize + dy;
                            if nx >= 0 && nx < w as isize && ny >= 0 && ny < h as isize {
                                let nidx = (ny as usize) * (w as usize) + (nx as usize);
                                if colliding[nidx] && !visited_coll[nidx] {
                                    visited_coll[nidx] = true;
                                    queue.push_back((nx as u32, ny as u32));
                                }
                            }
                        }
                    }

                    let area = comp.len();
                    let cw = max_cx - min_cx + 1;
                    let ch = max_cy - min_cy + 1;

                    if (6..=15000).contains(&area) && (cw <= 500 || ch <= 200) {
                        for (cx, cy) in comp {
                            let p = rgb_img.get_pixel(cx, cy);
                            let max_c = p[0].max(p[1]).max(p[2]);
                            let min_c = p[0].min(p[1]).min(p[2]);
                            let color_diff = max_c - min_c;
                            let is_black_text = max_c < 75 && color_diff < 15;

                            if !is_black_text {
                                mask_buf.put_pixel(cx, cy, image::Luma([255]));
                            }
                        }
                    }
                }
            }
        }

        mask_buf
    }

    /// Fast local context/Telea inpainting for watermark pixels inside speech bubbles.
    pub fn inpaint_colliding_watermarks(&self, img: &DynamicImage, mask: &ImageBuffer<image::Luma<u8>, Vec<u8>>) -> DynamicImage {
        let (w, h) = img.dimensions();
        let mut out_rgb = img.to_rgb8();

        for y in 0..h {
            for x in 0..w {
                if mask.get_pixel(x, y)[0] > 0 {
                    // Average surrounding unmasked pixels in radius 3
                    let mut r_sum = 0_u32;
                    let mut g_sum = 0_u32;
                    let mut b_sum = 0_u32;
                    let mut count = 0_u32;

                    let rad = 3_i32;
                    let y0 = (y as i32 - rad).max(0) as u32;
                    let y1 = (y as i32 + rad).min(h as i32 - 1) as u32;
                    let x0 = (x as i32 - rad).max(0) as u32;
                    let x1 = (x as i32 + rad).min(w as i32 - 1) as u32;

                    for ny in y0..=y1 {
                        for nx in x0..=x1 {
                            if mask.get_pixel(nx, ny)[0] == 0 {
                                let p = img.get_pixel(nx, ny);
                                r_sum += p[0] as u32;
                                g_sum += p[1] as u32;
                                b_sum += p[2] as u32;
                                count += 1;
                            }
                        }
                    }

                    if count > 0 {
                        out_rgb.put_pixel(
                            x,
                            y,
                            Rgb([(r_sum / count) as u8, (g_sum / count) as u8, (b_sum / count) as u8]),
                        );
                    } else {
                        out_rgb.put_pixel(x, y, Rgb([255, 255, 255]));
                    }
                }
            }
        }

        DynamicImage::ImageRgb8(out_rgb)
    }

    /// Clean chromatic watermark noise within a single crop ROI.
    pub fn clean_bubble_crop(&self, crop: &DynamicImage) -> DynamicImage {
        let (w, h) = crop.dimensions();
        if w < 4 || h < 4 {
            return crop.clone();
        }

        let rgb = crop.to_rgb8();
        let mut white_count = 0;
        for y in 0..h {
            for x in 0..w {
                let p = rgb.get_pixel(x, y);
                let gray = (p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000;
                if gray >= 195 {
                    white_count += 1;
                }
            }
        }

        if (white_count as f32 / (w * h) as f32) >= 0.30 {
            let mut mask: ImageBuffer<image::Luma<u8>, Vec<u8>> = ImageBuffer::new(w, h);
            let mut active_count = 0;

            for y in 0..h {
                for x in 0..w {
                    let p = rgb.get_pixel(x, y);
                    let (h_val, s_val, v_val) = Self::rgb_to_hsv(p[0], p[1], p[2]);
                    let max_c = p[0].max(p[1]).max(p[2]);
                    let min_c = p[0].min(p[1]).min(p[2]);
                    let color_diff = max_c - min_c;

                    let red_wm = !(15..=165).contains(&h_val) && s_val >= 30 && v_val >= 80;
                    let brown_wm = (15..=45).contains(&h_val) && s_val >= 30 && v_val >= 80;
                    let blue_wm = (85..=135).contains(&h_val) && s_val >= 30 && v_val >= 80;

                    if (red_wm || brown_wm || blue_wm) && !(max_c < 75 && color_diff < 15) {
                        mask.put_pixel(x, y, image::Luma([255]));
                        active_count += 1;
                    }
                }
            }

            if active_count >= 10 {
                return self.inpaint_colliding_watermarks(crop, &mask);
            }
        }

        crop.clone()
    }
}

pub fn is_likely_watermark(rect: &BoxRect, text: &str, img_w: u32, img_h: u32) -> bool {
    if is_watermark_line(text) || is_pure_watermark_region(text) {
        return true;
    }

    // Border suppression: tiny text strips sitting in the outer 3% margins
    let margin_x = (img_w as f32 * 0.03) as i32;
    let margin_y = (img_h as f32 * 0.03) as i32;

    let is_at_extreme_edge = rect.x < margin_x
        || (rect.x + rect.w) > (img_w as i32 - margin_x)
        || rect.y < margin_y
        || (rect.y + rect.h) > (img_h as i32 - margin_y);

    if is_at_extreme_edge && (rect.w < 80 || rect.h < 25) {
        return true;
    }

    // Large platform logo stamp suppression: wide box sitting at the bottom 15% of the page.
    // Platform watermarks (e.g. ACloudMerge "儿云数据", "ACloudMerge.com") are rendered as
    // large decorative logos that span >35% of the page width and sit near the bottom edge.
    // Genuine dialogue boxes inside panels never span this proportion of the canvas from the
    // bottom margin.
    let bottom_15pct = (img_h as f32 * 0.85) as i32;
    let wide_threshold = (img_w as f32 * 0.35) as i32;
    if rect.y >= bottom_15pct && rect.w >= wide_threshold {
        return true;
    }

    false
}

