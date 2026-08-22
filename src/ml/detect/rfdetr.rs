// -- CRATE / EXTERNAL IMPORTS -- //
use std::path::Path;
use anyhow::{Context, Result};
use image::{DynamicImage, GenericImageView};
use ort::{session::Session, value::Tensor};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

// -- INTERNAL IMPORTS -- //
use super::rtdetr::RtDetrResult;
use crate::ml::schemas::BoxRect;

// -- CONSTANTS -- //
pub const RFDETR_INPUT_SIZE: u32 = 1152;
pub const RFDETR_TEXT_SCORE_THRESH: f32 = 0.25;
pub const RFDETR_ONOMATOPOEIA_SCORE_THRESH: f32 = 0.25;
pub const RFDETR_BUBBLE_SCORE_THRESH: f32 = 0.50;
pub const RFDETR_PANEL_SCORE_THRESH: f32 = 0.50;

// IMAGENET NORMALIZATION CONSTANTS
const IMAGENET_MEAN: [f32; 3] = [0.485, 0.456, 0.406];
const IMAGENET_STD: [f32; 3] = [0.229, 0.224, 0.225];

// -- TYPES & STRUCTS -- //

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RfDetrClass {
    Text = 0,
    Onomatopoeia = 1,
    Bubble = 2,
    Panel = 3,
}

impl RfDetrClass {
    pub fn from_u32(val: u32) -> Option<Self> {
        match val {
            0 => Some(Self::Text),
            1 => Some(Self::Onomatopoeia),
            2 => Some(Self::Bubble),
            3 => Some(Self::Panel),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RfDetrDetection {
    pub class: RfDetrClass,
    pub score: f32,
    pub box_: BoxRect,
}

pub struct RfDetrSegDetector {
    session: Session,
    pub input_size: u32,
    tensor_buffer: Vec<f32>,
}

// -- TRAITS & IMPLEMENTATIONS -- //

impl RfDetrSegDetector {
    pub fn new<P: AsRef<Path>>(model_path: P) -> Result<Self> {
        let bytes = std::fs::read(model_path.as_ref())
            .context("FAILED TO READ RF-DETR ONNX MODEL FILE")?;
        Self::from_bytes(&bytes)
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        let session = crate::ml::device::create_session_from_memory(bytes, "rfdetr_seg_detector")?;
        let has_input = session.inputs().iter().any(|i| i.name() == "input");
        let has_dets = session.outputs().iter().any(|o| o.name() == "dets");
        let has_labels = session.outputs().iter().any(|o| o.name() == "labels");

        if !has_input || !has_dets || !has_labels {
            anyhow::bail!("Model does not have RF-DETR Seg input/output signatures ('input', 'dets', 'labels')");
        }

        Ok(Self::from_session(session))
    }

    pub fn from_session(session: Session) -> Self {
        let input_size = RFDETR_INPUT_SIZE;
        let tensor_buffer = vec![0.0_f32; 3 * input_size as usize * input_size as usize];

        Self {
            session,
            input_size,
            tensor_buffer,
        }
    }

    pub fn detect(&mut self, img: &DynamicImage) -> Result<RtDetrResult> {
        let (orig_w, orig_h) = img.dimensions();
        if orig_w == 0 || orig_h == 0 {
            return Ok(RtDetrResult {
                panels: Vec::new(),
                bubbles: Vec::new(),
                onomatopoeia: Vec::new(),
                text_bubbles: Vec::new(),
                text_free: Vec::new(),
                all_detections: Vec::new(),
                backend: "rfdetr-seg-2xl".to_string(),
            });
        }

        // PREPROCESS IMAGE: RESIZE TO (1152, 1152) AND NORMALIZE WITH IMAGENET MEAN/STD (RGB)
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
            tensor_vec.resize(3 * input_size * input_size, 0.0);
        }

        // REUSE PRE-ALLOCATED TENSOR BUFFER ACROSS RUNS (ZERO 16MB HEAP ALLOCATIONS)
        tensor_vec.par_chunks_mut(stride_c).enumerate().for_each(|(c, plane)| {
            let mean = IMAGENET_MEAN[c];
            let std = IMAGENET_STD[c];
            for y in 0..input_size {
                let row_offset = y * stride_y;
                let raw_row_offset = y * input_size * 3;
                for x in 0..input_size {
                    let val = raw_bytes[raw_row_offset + x * 3 + c] as f32 / 255.0;
                    plane[row_offset + x] = (val - mean) / std;
                }
            }
        });

        let input_tensor = Tensor::from_array(([1, 3, self.input_size as usize, self.input_size as usize], tensor_vec))
            .map_err(|e| anyhow::anyhow!("FAILED TO CREATE RF-DETR INPUT TENSOR: {}", e))?;

        let outputs = self.session.run(ort::inputs![
            "input" => input_tensor,
        ]).map_err(|e| anyhow::anyhow!("RF-DETR INFERENCE RUN ERROR: {}", e))?;

        // PARSE OUTPUTS:
        // dets: [1, 300, 4] -> [cx, cy, w, h] normalized in [0, 1]
        // labels: [1, 300, 5] -> logits for [text, onomatopoeia, bubble, panel, bg]
        let (_dets_shape, dets_slice) = outputs[0].try_extract_tensor::<f32>()
            .map_err(|e| anyhow::anyhow!("EXTRACT DETS TENSOR ERROR: {}", e))?;
        let (_labels_shape, labels_slice) = outputs[1].try_extract_tensor::<f32>()
            .map_err(|e| anyhow::anyhow!("EXTRACT LABELS TENSOR ERROR: {}", e))?;

        let num_queries = dets_slice.len() / 4;
        let mut panels = Vec::new();
        let mut bubbles = Vec::new();
        let mut onomatopoeia = Vec::new();
        let mut text_bubbles = Vec::new();
        let text_free = Vec::new();
        let mut all_detections = Vec::new();

        for q in 0..num_queries {
            let cx = dets_slice[q * 4];
            let cy = dets_slice[q * 4 + 1];
            let bw = dets_slice[q * 4 + 2];
            let bh = dets_slice[q * 4 + 3];

            let x1 = (cx - 0.5 * bw) * orig_w as f32;
            let y1 = (cy - 0.5 * bh) * orig_h as f32;
            let x2 = (cx + 0.5 * bw) * orig_w as f32;
            let y2 = (cy + 0.5 * bh) * orig_h as f32;

            let min_x = (x1.min(x2).round() as i32).clamp(0, orig_w as i32);
            let min_y = (y1.min(y2).round() as i32).clamp(0, orig_h as i32);
            let w = (x2 - x1).abs().round().max(1.0) as i32;
            let h = (y2 - y1).abs().round().max(1.0) as i32;

            let box_rect = BoxRect {
                x: min_x,
                y: min_y,
                w,
                h,
            };

            for c in 0..4 {
                let logit = labels_slice[q * 5 + c];
                let score = 1.0 / (1.0 + (-logit).exp()); // SIGMOID

                let min_thresh = match c {
                    0 => RFDETR_TEXT_SCORE_THRESH,
                    1 => RFDETR_ONOMATOPOEIA_SCORE_THRESH,
                    2 => RFDETR_BUBBLE_SCORE_THRESH,
                    3 => RFDETR_PANEL_SCORE_THRESH,
                    _ => 0.50,
                };

                if score >= min_thresh {
                    if let Some(rf_class) = RfDetrClass::from_u32(c as u32) {
                        let rt_class = match rf_class {
                            RfDetrClass::Text => super::rtdetr::RtDetrClass::TextBubble,
                            RfDetrClass::Onomatopoeia => super::rtdetr::RtDetrClass::TextFree,
                            RfDetrClass::Bubble => super::rtdetr::RtDetrClass::Bubble,
                            RfDetrClass::Panel => super::rtdetr::RtDetrClass::Bubble, // PANELS CAN ACT AS MACRO CONTAINER IF APPLICABLE
                        };

                        let detection = super::rtdetr::RtDetrDetection {
                            class: rt_class,
                            score,
                            box_: box_rect.clone(),
                        };

                        match rf_class {
                            RfDetrClass::Bubble => {
                                bubbles.push(box_rect.clone());
                            }
                            RfDetrClass::Text => {
                                text_bubbles.push((box_rect.clone(), score));
                            }
                            RfDetrClass::Onomatopoeia => {
                                onomatopoeia.push((box_rect.clone(), score));
                            }
                            RfDetrClass::Panel => {
                                panels.push(box_rect.clone());
                            }
                        }

                        all_detections.push(detection);
                    }
                }
            }
        }

        Ok(RtDetrResult {
            panels,
            bubbles,
            onomatopoeia,
            text_bubbles,
            text_free,
            all_detections,
            backend: "rfdetr-seg-2xl".to_string(),
        })
    }
}
