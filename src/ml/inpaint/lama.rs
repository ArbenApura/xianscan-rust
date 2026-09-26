use std::path::Path;
use anyhow::{Context, Result};
use image::{DynamicImage, GenericImageView, ImageBuffer, Luma, Rgb};
use ort::{session::Session, value::Tensor};
use rayon::prelude::*;

use super::plan::{crop_mask, plan_inpaint, InpaintMode};

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
    /// - "scaled": Balanced resolution, 512 px on the long side of square-ish tiles (Fast · Standard)
    /// - "full": Full canvas pass, split into overlapping bands above the pixel budget (Slowest · Full Canvas)
    /// EVERY MODE IS PLANNED UNDER ONE PER-PASS PIXEL BUDGET (FEAT-004 PHASE 6, super::plan).
    pub fn inpaint(&mut self, img: &DynamicImage, mask: &ImageBuffer<Luma<u8>, Vec<u8>>, mode: &str) -> Result<DynamicImage> {
        self.inpaint_planned(img, mask, InpaintMode::parse(mode))
    }

    /// Strategy 1: Localized patch inpainting (Fastest + native 1:1 sharpness)
    pub fn inpaint_patch_mode(&mut self, img: &DynamicImage, mask: &ImageBuffer<Luma<u8>, Vec<u8>>, pad: i32) -> Result<DynamicImage> {
        self.inpaint_planned(img, mask, InpaintMode::Patch { pad })
    }

    /// STRATEGY 2: Balanced resolution (Fast · Standard); ASPECT IS KEPT, `target_dim` IS THE LONG SIDE OF EACH PASS
    pub fn inpaint_scaled_mode(&mut self, img: &DynamicImage, mask: &ImageBuffer<Luma<u8>, Vec<u8>>, target_dim: u32) -> Result<DynamicImage> {
        self.inpaint_planned(img, mask, InpaintMode::Scaled { target: target_dim })
    }

    /// STRATEGY 3: Full canvas pass (BANDED ABOVE THE PIXEL BUDGET)
    pub fn inpaint_full_mode(&mut self, img: &DynamicImage, mask: &ImageBuffer<Luma<u8>, Vec<u8>>) -> Result<DynamicImage> {
        self.inpaint_planned(img, mask, InpaintMode::Full)
    }

    fn inpaint_planned(&mut self, img: &DynamicImage, mask: &ImageBuffer<Luma<u8>, Vec<u8>>, mode: InpaintMode) -> Result<DynamicImage> {
        let (w, h) = img.dimensions();
        if mask.dimensions() != (w, h) {
            anyhow::bail!("mask size {}x{} does not match image size {}x{}", mask.width(), mask.height(), w, h);
        }
        if !mask.pixels().any(|p| p[0] > 0) {
            return Ok(img.clone());
        }
        let passes = plan_inpaint(w, h, mask, mode);
        if passes.is_empty() {
            return Ok(img.clone());
        }

        // THE ONE FULL-PAGE BUFFER: THE RESULT. EVERY PASS READS ITS OWN SMALL CROP.
        let mut result = img.to_rgb8();
        for pass in passes {
            let (x, y, pw, ph) = pass.src;
            let src_img = img.crop_imm(x, y, pw, ph);
            let src_mask = crop_mask(mask, pass.src);
            let out = if pass.scale == 1.0 {
                self.inpaint_single_patch(&src_img, &src_mask)?.to_rgb8()
            } else {
                let sw = ((pw as f32 * pass.scale).round() as u32).max(1);
                let sh = ((ph as f32 * pass.scale).round() as u32).max(1);
                let small = image::imageops::resize(&src_img.to_rgb8(), sw, sh, image::imageops::FilterType::Triangle);
                let small_mask = image::imageops::resize(&src_mask, sw, sh, image::imageops::FilterType::Nearest);
                let inpainted = self.inpaint_single_patch(&DynamicImage::ImageRgb8(small), &small_mask)?;
                image::imageops::resize(&inpainted.to_rgb8(), pw, ph, image::imageops::FilterType::CatmullRom)
            };
            // WRITE BACK ONLY MASKED PIXELS OF THE RECT THIS PASS OWNS
            let (ox, oy, ow, oh) = pass.own;
            for yy in oy..oy + oh {
                for xx in ox..ox + ow {
                    if mask.get_pixel(xx, yy)[0] > 0 {
                        let q = out.get_pixel(xx - x, yy - y);
                        result.put_pixel(xx, yy, Rgb([q[0], q[1], q[2]]));
                    }
                }
            }
        }

        Ok(DynamicImage::ImageRgb8(result))
    }

    pub fn inpaint_single_patch(&mut self, img: &DynamicImage, mask: &ImageBuffer<Luma<u8>, Vec<u8>>) -> Result<DynamicImage> {
        let (w, h) = img.dimensions();

        // Modulo 8 padding (snapped to 64px buckets on DirectML to avoid repeated DirectX 12 shader recompilations)
        #[cfg(feature = "directml")]
        let (padded_w, padded_h) = {
            let bw = (w as usize).div_ceil(64) * 64;
            let bh = (h as usize).div_ceil(64) * 64;
            (bw.max(64), bh.max(64))
        };
        #[cfg(not(feature = "directml"))]
        let (padded_w, padded_h) = {
            let pad_w = (8 - (w % 8)) % 8;
            let pad_h = (8 - (h % 8)) % 8;
            ((w + pad_w) as usize, (h + pad_h) as usize)
        };

        let mut img_tensor = vec![0.0_f32; 3 * padded_h * padded_w];
        let mut mask_tensor = vec![0.0_f32; padded_h * padded_w];

        let stride_c = padded_h * padded_w;
        let stride_y = padded_w;

        let rgb_img = crate::ml::geometry::rgb_view(img);
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
        // A MODEL THAT RETURNS LESS THAN [1, 3, padded_h, padded_w] IS AN ERROR, NOT AN OUT-OF-BOUNDS PANIC (B5)
        if out_slice.len() < 3 * stride_c {
            anyhow::bail!("LaMa output has {} values, expected at least {}", out_slice.len(), 3 * stride_c);
        }

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
