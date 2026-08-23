use std::path::Path;
use anyhow::{Context, Result};
use image::{DynamicImage, GenericImageView, ImageBuffer, Luma, Rgb};
use ort::{session::Session, value::Tensor};
use rayon::prelude::*;

use super::patch::{find_mask_components, is_solid_background_patch};

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
        let session = crate::ml::device::create_session_from_memory(bytes, "lama_inpaint")?;
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

        // ONE FULL-PAGE RGB COPY REUSED FOR RESIZE SOURCE + RESULT (WAS TWO COPIES).
        let page_rgb = img.to_rgb8();

        let in_img = image::imageops::resize(
            &page_rgb,
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

        let mut result = page_rgb;
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

        let mut img_tensor = vec![0.0_f32; 3 * padded_h * padded_w];
        let mut mask_tensor = vec![0.0_f32; padded_h * padded_w];

        let stride_c = padded_h * padded_w;
        let stride_y = padded_w;

        let rgb_img = img.to_rgb8();
        let raw_rgb = rgb_img.as_raw();
        let raw_mask = mask.as_raw();

        // FILL THE THREE IMAGE CHANNELS IN PARALLEL WITHOUT DYNAMIC TRAIT DISPATCH
        img_tensor.par_chunks_mut(stride_c).enumerate().for_each(|(c, plane)| {
            for y in 0..h as usize {
                let row_offset = y * stride_y;
                let raw_row_offset = y * (w as usize) * 3;
                for x in 0..w as usize {
                    plane[row_offset + x] = raw_rgb[raw_row_offset + x * 3 + c] as f32 / 255.0;
                }
            }
        });

        // FILL MASK TENSOR IN PARALLEL ACROSS ROWS
        mask_tensor.par_chunks_mut(stride_y).enumerate().take(h as usize).for_each(|(y, row_slice)| {
            let mask_row_offset = y * (w as usize);
            for x in 0..w as usize {
                row_slice[x] = if raw_mask[mask_row_offset + x] > 0 { 1.0 } else { 0.0 };
            }
        });

        let input_img = Tensor::from_array(([1, 3, padded_h, padded_w], img_tensor))
            .map_err(|e| anyhow::anyhow!("Tensor create img error: {}", e))?;
        let input_mask = Tensor::from_array(([1, 1, padded_h, padded_w], mask_tensor))
            .map_err(|e| anyhow::anyhow!("Tensor create mask error: {}", e))?;

        let outputs = self.session.run(ort::inputs![input_img, input_mask])
            .map_err(|e| anyhow::anyhow!("LaMa run error: {}", e))?;

        let (_out_shape, out_slice) = outputs[0].try_extract_tensor::<f32>()
            .map_err(|e| anyhow::anyhow!("Extract LaMa output error: {}", e))?;

        let mut raw_out = vec![0_u8; (w * h * 3) as usize];
        for y in 0..h as usize {
            let row_offset = y * stride_y;
            let raw_row_offset = y * (w as usize) * 3;
            for x in 0..w as usize {
                let base_idx = row_offset + x;
                raw_out[raw_row_offset + x * 3] = (out_slice[base_idx] * 255.0).clamp(0.0, 255.0) as u8;
                raw_out[raw_row_offset + x * 3 + 1] = (out_slice[stride_c + base_idx] * 255.0).clamp(0.0, 255.0) as u8;
                raw_out[raw_row_offset + x * 3 + 2] = (out_slice[2 * stride_c + base_idx] * 255.0).clamp(0.0, 255.0) as u8;
            }
        }

        let result_img = ImageBuffer::from_raw(w, h, raw_out)
            .ok_or_else(|| anyhow::anyhow!("Failed to construct inpainted ImageBuffer"))?;

        Ok(DynamicImage::ImageRgb8(result_img))
    }
}
