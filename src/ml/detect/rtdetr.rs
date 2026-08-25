// -- CRATE / EXTERNAL IMPORTS -- //
use std::path::Path;
use anyhow::{Context, Result};
use image::{DynamicImage, GenericImageView};
use ort::{session::Session, value::Tensor};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

// -- INTERNAL IMPORTS -- //
use crate::ml::schemas::BoxRect;

// -- CONSTANTS -- //
pub const RTDETR_INPUT_SIZE: u32 = 1024;
pub const RTDETR_DEFAULT_SCORE_THRESH: f32 = 0.25;
pub const RTDETR_BUBBLE_SCORE_THRESH: f32 = 0.15;
pub const RTDETR_TEXT_BUBBLE_SCORE_THRESH: f32 = 0.20;
pub const RTDETR_TEXT_FREE_SCORE_THRESH: f32 = 0.40;

// -- TYPES & STRUCTS -- //

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RtDetrClass {
    Bubble = 0,
    TextBubble = 1,
    TextFree = 2,
}

impl RtDetrClass {
    pub fn from_u32(val: u32) -> Option<Self> {
        match val {
            0 => Some(Self::Bubble),
            1 => Some(Self::TextBubble),
            2 => Some(Self::TextFree),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RtDetrDetection {
    pub class: RtDetrClass,
    pub score: f32,
    pub box_: BoxRect,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RtDetrResult {
    pub panels: Vec<BoxRect>,
    pub bubbles: Vec<BoxRect>,
    pub onomatopoeia: Vec<(BoxRect, f32)>,
    pub text_bubbles: Vec<(BoxRect, f32)>,
    pub text_free: Vec<(BoxRect, f32)>,
    pub all_detections: Vec<RtDetrDetection>,
    pub backend: String,
}

pub struct RtDetrComicDetector {
    session: Session,
    pub input_size: u32,
    tensor_buffer: Vec<f32>,
}

// -- TRAITS & IMPLEMENTATIONS -- //

impl RtDetrComicDetector {
    pub fn new<P: AsRef<Path>>(model_path: P) -> Result<Self> {
        let bytes = std::fs::read(model_path.as_ref())
            .context("FAILED TO READ RT-DETR ONNX MODEL FILE")?;
        Self::from_bytes(&bytes)
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        let session = crate::ml::device::create_session_from_memory(bytes, "rtdetr_comic_detector")?;
        let is_rtdetr = session.inputs().iter().any(|i| i.name() == "orig_target_sizes");
        if !is_rtdetr {
            anyhow::bail!("Model does not have RT-DETR input signature ('orig_target_sizes')");
        }
        Ok(Self::from_session(session))
    }

    pub fn from_session(session: Session) -> Self {
        let input_size = RTDETR_INPUT_SIZE;
        let tensor_buffer = vec![0.0_f32; 3 * input_size as usize * input_size as usize];

        Self {
            session,
            input_size,
            tensor_buffer,
        }
    }

    pub fn detect(&mut self, img: &DynamicImage) -> Result<RtDetrResult> {
        self.detect_with_threshold(img, RTDETR_DEFAULT_SCORE_THRESH)
    }

    pub fn detect_with_threshold(&mut self, img: &DynamicImage, score_thresh: f32) -> Result<RtDetrResult> {
        let (orig_w, orig_h) = img.dimensions();
        if orig_w == 0 || orig_h == 0 {
            return Ok(RtDetrResult {
                panels: Vec::new(),
                bubbles: Vec::new(),
                onomatopoeia: Vec::new(),
                text_bubbles: Vec::new(),
                text_free: Vec::new(),
                all_detections: Vec::new(),
                backend: "rtdetr-v2".to_string(),
            });
        }

        // PREPROCESS IMAGE: RESIZE TO (input_size, input_size) AND NORMALIZE RGB [0.0, 1.0]
        let rgb_img = img.to_rgb8();
        let resized = image::imageops::resize(
            &rgb_img,
            self.input_size,
            self.input_size,
            image::imageops::FilterType::Triangle,
        );

        let stride_c = (self.input_size * self.input_size) as usize;
        let stride_y = self.input_size as usize;
        let input_size = self.input_size as usize;
        let raw_bytes = resized.as_raw();

        let mut tensor_vec = std::mem::take(&mut self.tensor_buffer);
        if tensor_vec.len() != 3 * input_size * input_size {
            tensor_vec = vec![0.0_f32; 3 * input_size * input_size];
        }

        // FILL THE THREE CHANNEL PLANES IN PARALLEL ACROSS ALL CPU CORES
        tensor_vec.par_chunks_mut(stride_c).enumerate().for_each(|(c, plane)| {
            for y in 0..input_size {
                let row_offset = y * stride_y;
                let raw_row_offset = y * input_size * 3;
                for x in 0..input_size {
                    plane[row_offset + x] = raw_bytes[raw_row_offset + x * 3 + c] as f32 / 255.0;
                }
            }
        });

        let input_images = Tensor::from_array(([1, 3, self.input_size as usize, self.input_size as usize], tensor_vec.clone()))
            .map_err(|e| anyhow::anyhow!("FAILED TO CREATE RT-DETR IMAGES TENSOR: {}", e))?;

        // RESTORE THE PREALLOCATED BUFFER FOR SUBSEQUENT CALLS
        self.tensor_buffer = tensor_vec;

        let orig_sizes_vec: Vec<i64> = vec![orig_h as i64, orig_w as i64];
        let input_sizes = Tensor::from_array(([1, 2], orig_sizes_vec))
            .map_err(|e| anyhow::anyhow!("FAILED TO CREATE RT-DETR SIZES TENSOR: {}", e))?;

        let outputs = self.session.run(ort::inputs![
            "images" => input_images,
            "orig_target_sizes" => input_sizes,
        ]).map_err(|e| anyhow::anyhow!("RT-DETR INFERENCE RUN ERROR: {}", e))?;

        // PARSE OUTPUTS:
        // labels: [1, num_queries] (i64)
        // boxes: [1, num_queries, 4] (f32) -> [x1, y1, x2, y2]
        // scores: [1, num_queries] (f32)
        let (_labels_shape, labels_slice) = outputs[0].try_extract_tensor::<i64>()
            .map_err(|e| anyhow::anyhow!("EXTRACT LABELS TENSOR ERROR: {}", e))?;
        let (_boxes_shape, boxes_slice) = outputs[1].try_extract_tensor::<f32>()
            .map_err(|e| anyhow::anyhow!("EXTRACT BOXES TENSOR ERROR: {}", e))?;
        let (_scores_shape, scores_slice) = outputs[2].try_extract_tensor::<f32>()
            .map_err(|e| anyhow::anyhow!("EXTRACT SCORES TENSOR ERROR: {}", e))?;

        let num_queries = labels_slice.len();
        let mut bubbles = Vec::new();
        let mut text_bubbles = Vec::new();
        let mut text_free = Vec::new();
        let mut all_detections = Vec::new();

        for i in 0..num_queries {
            let score = scores_slice[i];
            let label_id = labels_slice[i] as u32;
            let class_opt = RtDetrClass::from_u32(label_id);
            if class_opt.is_none() {
                continue;
            }
            let class = class_opt.unwrap();

            let min_thresh = match class {
                RtDetrClass::Bubble => RTDETR_BUBBLE_SCORE_THRESH.min(score_thresh),
                RtDetrClass::TextBubble => RTDETR_TEXT_BUBBLE_SCORE_THRESH.min(score_thresh),
                RtDetrClass::TextFree => RTDETR_TEXT_FREE_SCORE_THRESH.min(score_thresh),
            };
            if score < min_thresh {
                continue;
            }

            let x1 = boxes_slice[i * 4].clamp(0.0, orig_w as f32);
            let y1 = boxes_slice[i * 4 + 1].clamp(0.0, orig_h as f32);
            let x2 = boxes_slice[i * 4 + 2].clamp(0.0, orig_w as f32);
            let y2 = boxes_slice[i * 4 + 3].clamp(0.0, orig_h as f32);

            let min_x = x1.min(x2).round() as i32;
            let min_y = y1.min(y2).round() as i32;
            let w = (x2 - x1).abs().round().max(1.0) as i32;
            let h = (y2 - y1).abs().round().max(1.0) as i32;

            let box_rect = BoxRect {
                x: min_x,
                y: min_y,
                w,
                h,
            };

            let detection = RtDetrDetection {
                class,
                score,
                box_: box_rect.clone(),
            };

            match class {
                RtDetrClass::Bubble => {
                    bubbles.push(box_rect);
                }
                RtDetrClass::TextBubble => {
                    text_bubbles.push((box_rect, score));
                }
                RtDetrClass::TextFree => {
                    text_free.push((box_rect, score));
                }
            }

            all_detections.push(detection);
        }

        Ok(RtDetrResult {
            panels: Vec::new(),
            bubbles,
            onomatopoeia: Vec::new(),
            text_bubbles,
            text_free,
            all_detections,
            backend: "rtdetr-v2".to_string(),
        })
    }
}
