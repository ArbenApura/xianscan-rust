use std::path::Path;
use anyhow::{Context, Result};
use image::{DynamicImage, GenericImageView, ImageBuffer};
use ort::{session::Session, value::Tensor};
use serde::{Deserialize, Serialize};

use super::dbnet::lines_map_to_boxes;

pub struct ComicTextDetector {
    session: Session,
    pub input_size: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectResult {
    pub boxes: Vec<Vec<[i32; 2]>>,
    pub scores: Vec<f32>,
    pub mask: Vec<u8>,
    pub mask_width: u32,
    pub mask_height: u32,
    pub backend: String,
}

impl ComicTextDetector {
    pub fn new<P: AsRef<Path>>(model_path: P) -> Result<Self> {
        let bytes = std::fs::read(model_path.as_ref())
            .context("Failed to read ONNX model file")?;
        Self::from_bytes(&bytes)
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        let session = crate::ml::device::create_session_from_memory(bytes, "comic_text_detector")?;
        Ok(Self { session, input_size: 1024 })
    }

    pub fn detect(&mut self, img: &DynamicImage) -> Result<DetectResult> {
        let (orig_w, orig_h) = img.dimensions();
        let (tensor_vec, pad_w, pad_h) = preprocess_for_onnx(img, self.input_size);

        let input_tensor = Tensor::from_array(([1, 3, self.input_size as usize, self.input_size as usize], tensor_vec))
            .map_err(|e| anyhow::anyhow!("Tensor create error: {}", e))?;

        let outputs = self.session.run(ort::inputs![input_tensor])
            .map_err(|e| anyhow::anyhow!("Session run error: {}", e))?;

        // Output [1]: Mask (1, 1024, 1024)
        // Output [2]: Lines Map (1, 2, 1024, 1024)
        let (_mask_shape, mask_slice) = outputs[1].try_extract_tensor::<f32>()
            .map_err(|e| anyhow::anyhow!("Extract mask tensor error: {}", e))?;
        let (_lines_shape, lines_slice) = outputs[2].try_extract_tensor::<f32>()
            .map_err(|e| anyhow::anyhow!("Extract lines tensor error: {}", e))?;

        let unpad_w = (self.input_size - pad_w) as usize;
        let unpad_h = (self.input_size - pad_h) as usize;

        let mut lines_map = vec![0.0_f32; unpad_w * unpad_h];
        for y in 0..unpad_h {
            for x in 0..unpad_w {
                // lines_map channel 0 is text line prob
                let idx = y * 1024 + x;
                lines_map[y * unpad_w + x] = lines_slice[idx];
            }
        }

        let (boxes, scores) = lines_map_to_boxes(
            &lines_map,
            unpad_w,
            unpad_h,
            orig_w as usize,
            orig_h as usize,
            0.3,
            0.6,
            1.5,
            1000,
            3,
        );

        // Convert unpadded mask to u8 and resize back to original resolution
        let mut unpad_mask = vec![0_u8; unpad_w * unpad_h];
        for y in 0..unpad_h {
            for x in 0..unpad_w {
                let prob = mask_slice[y * 1024 + x];
                unpad_mask[y * unpad_w + x] = (prob * 255.0).clamp(0.0, 255.0) as u8;
            }
        }

        let mask_img: ImageBuffer<image::Luma<u8>, _> =
            ImageBuffer::from_raw(unpad_w as u32, unpad_h as u32, unpad_mask)
                .context("Failed to construct unpadded mask image")?;

        let resized_mask = image::imageops::resize(
            &mask_img,
            orig_w,
            orig_h,
            image::imageops::FilterType::Triangle,
        );

        Ok(DetectResult {
            boxes,
            scores,
            mask: resized_mask.into_raw(),
            mask_width: orig_w,
            mask_height: orig_h,
            backend: "comic-ctd".to_string(),
        })
    }
}

pub fn preprocess_for_onnx(img: &DynamicImage, input_size: u32) -> (Vec<f32>, u32, u32) {
    let (w, h) = img.dimensions();
    let r = (input_size as f32 / h as f32).min(input_size as f32 / w as f32);
    let new_unpad_w = ((w as f32 * r).round() as u32).min(input_size);
    let new_unpad_h = ((h as f32 * r).round() as u32).min(input_size);

    let pad_w = input_size - new_unpad_w;
    let pad_h = input_size - new_unpad_h;

    let rgb_img = img.to_rgb8();
    let resized = image::imageops::resize(&rgb_img, new_unpad_w, new_unpad_h, image::imageops::FilterType::Triangle);
    let raw_bytes = resized.as_raw();

    let mut tensor = vec![0.0_f32; 1 * 3 * input_size as usize * input_size as usize];

    // ComicTextDetector expects BGR channel order normalized to [0, 1]
    let stride_c = input_size as usize * input_size as usize;
    let stride_y = input_size as usize;
    let unpad_w_usize = new_unpad_w as usize;

    for y in 0..new_unpad_h as usize {
        let row_offset = y * stride_y;
        let raw_row_offset = y * unpad_w_usize * 3;
        for x in 0..unpad_w_usize {
            let raw_idx = raw_row_offset + x * 3;
            let r_val = raw_bytes[raw_idx] as f32 / 255.0;
            let g_val = raw_bytes[raw_idx + 1] as f32 / 255.0;
            let b_val = raw_bytes[raw_idx + 2] as f32 / 255.0;

            let tensor_idx = row_offset + x;
            // Channel 0: B, Channel 1: G, Channel 2: R
            tensor[0 * stride_c + tensor_idx] = b_val;
            tensor[1 * stride_c + tensor_idx] = g_val;
            tensor[2 * stride_c + tensor_idx] = r_val;
        }
    }

    (tensor, pad_w, pad_h)
}
