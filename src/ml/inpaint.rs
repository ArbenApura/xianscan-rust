use std::path::Path;
use anyhow::{Context, Result};
use image::{DynamicImage, GenericImageView, ImageBuffer, Luma, Rgb};
use ort::{session::Session, value::Tensor};

use super::geometry::{dilate_mask, fill_polygon};

pub struct LamaInpainter {
    session: Session,
}

impl LamaInpainter {
    pub fn new<P: AsRef<Path>>(model_path: P) -> Result<Self> {
        let model_bytes = std::fs::read(model_path.as_ref())
            .context("Failed to read LaMa ONNX inpainter model")?;
        Self::from_bytes(&model_bytes)
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        let session = Session::builder()
            .map_err(|e| anyhow::anyhow!("Session builder error: {}", e))?
            .with_intra_threads(num_cpus::get().min(4))
            .map_err(|e| anyhow::anyhow!("Session intra threads error: {}", e))?
            .commit_from_memory(bytes)
            .map_err(|e| anyhow::anyhow!("Commit from memory error: {}", e))?;
        Ok(Self { session })
    }

    /// Dispatches inpainting based on chosen strategy:
    /// - "patch": Localized 1:1 patch inpainting (Fastest · Recommended)
    /// - "scaled": Balanced 512x512 resolution (Fast · Standard)
    /// - "full": Full dynamic uncut canvas pass (Slowest · Full Canvas)
    pub fn inpaint(&mut self, img: &DynamicImage, mask: &ImageBuffer<Luma<u8>, Vec<u8>>, mode: &str) -> Result<DynamicImage> {
        let mut has_mask = false;
        for p in mask.pixels() {
            if p[0] > 0 {
                has_mask = true;
                break;
            }
        }
        if !has_mask {
            return Ok(img.clone());
        }

        match mode.to_lowercase().trim() {
            "scaled" | "balanced" => self.inpaint_scaled_mode(img, mask, 512),
            "full" | "dynamic" => self.inpaint_full_mode(img, mask),
            _ => self.inpaint_patch_mode(img, mask, 24),
        }
    }

/// Strategy 1: Localized patch inpainting (Fastest + native 1:1 sharpness)
    pub fn inpaint_patch_mode(&mut self, img: &DynamicImage, mask: &ImageBuffer<Luma<u8>, Vec<u8>>, pad: i32) -> Result<DynamicImage> {
        let (w, h) = img.dimensions();
        let components = find_mask_components(mask);
        if components.is_empty() {
            return Ok(img.clone());
        }

        let mut result = img.to_rgb8();

        for (bx, by, bw, bh) in components {
            let x0 = (bx as i32 - pad).max(0) as u32;
            let y0 = (by as i32 - pad).max(0) as u32;
            let x1 = ((bx + bw) as i32 + pad).min(w as i32) as u32;
            let y1 = ((by + bh) as i32 + pad).min(h as i32) as u32;

            let patch_w = x1 - x0;
            let patch_h = y1 - y0;
            if patch_w < 4 || patch_h < 4 {
                continue;
            }

            let patch_img = img.crop_imm(x0, y0, patch_w, patch_h);
            let patch_rgb = patch_img.to_rgb8();
            let mut patch_mask: ImageBuffer<Luma<u8>, Vec<u8>> = ImageBuffer::new(patch_w, patch_h);
            let mut patch_has_active = false;

            for py in 0..patch_h {
                for px in 0..patch_w {
                    let m = mask.get_pixel(x0 + px, y0 + py)[0];
                    if m > 0 {
                        patch_mask.put_pixel(px, py, Luma([255]));
                        patch_has_active = true;
                    }
                }
            }

            if !patch_has_active {
                continue;
            }

            // Solid-color / white bubble inpaint bypass (~70% of dialogue bubbles)
            if let Some(fill_color) = is_solid_background_patch(&patch_rgb, &patch_mask) {
                for py in 0..patch_h {
                    for px in 0..patch_w {
                        if patch_mask.get_pixel(px, py)[0] > 0 {
                            result.put_pixel(x0 + px, y0 + py, fill_color);
                        }
                    }
                }
                continue;
            }

            let inpainted_patch = self.inpaint_single_patch(&patch_img, &patch_mask)?;

            // Alpha-composite patch into result
            for py in 0..patch_h {
                for px in 0..patch_w {
                    let m = patch_mask.get_pixel(px, py)[0];
                    if m > 0 {
                        let inp_p = inpainted_patch.get_pixel(px, py);
                        result.put_pixel(x0 + px, y0 + py, Rgb([inp_p[0], inp_p[1], inp_p[2]]));
                    }
                }
            }
        }

        Ok(DynamicImage::ImageRgb8(result))
    }

    /// STRATEGY 2: Balanced 512x512 resolution (Fast · Standard)
    pub fn inpaint_scaled_mode(&mut self, img: &DynamicImage, mask: &ImageBuffer<Luma<u8>, Vec<u8>>, target_dim: u32) -> Result<DynamicImage> {
        let (orig_w, orig_h) = img.dimensions();

        let in_img = image::imageops::resize(
            &img.to_rgb8(),
            target_dim,
            target_dim,
            image::imageops::FilterType::Triangle,
        );

        let in_mask = image::imageops::resize(
            mask,
            target_dim,
            target_dim,
            image::imageops::FilterType::Nearest,
        );

        let inpainted_512 = self.inpaint_single_patch(&DynamicImage::ImageRgb8(in_img), &in_mask)?;

        let upscaled = image::imageops::resize(
            &inpainted_512.to_rgb8(),
            orig_w,
            orig_h,
            image::imageops::FilterType::CatmullRom,
        );

        let mut result = img.to_rgb8();
        for y in 0..orig_h {
            for x in 0..orig_w {
                if mask.get_pixel(x, y)[0] > 0 {
                    let p = upscaled.get_pixel(x, y);
                    result.put_pixel(x, y, Rgb([p[0], p[1], p[2]]));
                }
            }
        }

        Ok(DynamicImage::ImageRgb8(result))
    }

    /// STRATEGY 3: Full dynamic uncut canvas pass
    pub fn inpaint_full_mode(&mut self, img: &DynamicImage, mask: &ImageBuffer<Luma<u8>, Vec<u8>>) -> Result<DynamicImage> {
        let (w, h) = img.dimensions();
        let inpainted = self.inpaint_single_patch(img, mask)?;

        let mut result = img.to_rgb8();
        for y in 0..h {
            for x in 0..w {
                if mask.get_pixel(x, y)[0] > 0 {
                    let p = inpainted.get_pixel(x, y);
                    result.put_pixel(x, y, Rgb([p[0], p[1], p[2]]));
                }
            }
        }

        Ok(DynamicImage::ImageRgb8(result))
    }

    pub fn inpaint_single_patch(&mut self, img: &DynamicImage, mask: &ImageBuffer<Luma<u8>, Vec<u8>>) -> Result<DynamicImage> {
        let (w, h) = img.dimensions();

        // Modulo 8 padding
        let pad_w = (8 - (w % 8)) % 8;
        let pad_h = (8 - (h % 8)) % 8;
        let padded_w = (w + pad_w) as usize;
        let padded_h = (h + pad_h) as usize;

        let mut img_tensor = vec![0.0_f32; 1 * 3 * padded_h * padded_w];
        let mut mask_tensor = vec![0.0_f32; 1 * 1 * padded_h * padded_w];

        let stride_c = padded_h * padded_w;
        let stride_y = padded_w;

        for y in 0..h as usize {
            for x in 0..w as usize {
                let p = img.get_pixel(x as u32, y as u32);
                let r = p[0] as f32 / 255.0;
                let g = p[1] as f32 / 255.0;
                let b = p[2] as f32 / 255.0;

                img_tensor[0 * stride_c + y * stride_y + x] = r;
                img_tensor[1 * stride_c + y * stride_y + x] = g;
                img_tensor[2 * stride_c + y * stride_y + x] = b;

                let m = mask.get_pixel(x as u32, y as u32)[0];
                mask_tensor[y * stride_y + x] = if m > 0 { 1.0 } else { 0.0 };
            }
        }

        let input_img = Tensor::from_array(([1, 3, padded_h, padded_w], img_tensor))
            .map_err(|e| anyhow::anyhow!("Tensor create img error: {}", e))?;
        let input_mask = Tensor::from_array(([1, 1, padded_h, padded_w], mask_tensor))
            .map_err(|e| anyhow::anyhow!("Tensor create mask error: {}", e))?;

        let outputs = self.session.run(ort::inputs![input_img, input_mask])
            .map_err(|e| anyhow::anyhow!("LaMa run error: {}", e))?;

        let (_out_shape, out_slice) = outputs[0].try_extract_tensor::<f32>()
            .map_err(|e| anyhow::anyhow!("Extract LaMa output error: {}", e))?;

        let mut result_img: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::new(w, h);

        for y in 0..h as usize {
            for x in 0..w as usize {
                let r_val = (out_slice[0 * stride_c + y * stride_y + x] * 255.0).clamp(0.0, 255.0) as u8;
                let g_val = (out_slice[1 * stride_c + y * stride_y + x] * 255.0).clamp(0.0, 255.0) as u8;
                let b_val = (out_slice[2 * stride_c + y * stride_y + x] * 255.0).clamp(0.0, 255.0) as u8;

                result_img.put_pixel(x as u32, y as u32, Rgb([r_val, g_val, b_val]));
            }
        }

        Ok(DynamicImage::ImageRgb8(result_img))
    }
}

/// Extracts 8-connected component bounding boxes (cv2.connectedComponentsWithStats port)
fn find_mask_components(mask: &ImageBuffer<Luma<u8>, Vec<u8>>) -> Vec<(u32, u32, u32, u32)> {
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
