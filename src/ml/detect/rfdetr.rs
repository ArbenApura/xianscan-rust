// -- CRATE / EXTERNAL IMPORTS -- //
use std::path::Path;
use anyhow::{Context, Result};
use image::{DynamicImage, GenericImageView};
use ort::{session::Session, value::TensorRef};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

// -- INTERNAL IMPORTS -- //
use super::rtdetr::RtDetrResult;
use crate::ml::schemas::BoxRect;

// -- CONSTANTS -- //
pub const RFDETR_INPUT_SIZE: u32 = 768;
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

        // PREPROCESS IMAGE: RESIZE TO (768, 768) AND NORMALIZE WITH IMAGENET MEAN/STD (RGB)
        let rgb_img = crate::ml::geometry::rgb_view(img);
        let resized = image::imageops::resize(
            &*rgb_img,
            self.input_size,
            self.input_size,
            image::imageops::FilterType::Triangle,
        );

        let stride_c = (self.input_size * self.input_size) as usize;
        let stride_y = self.input_size as usize;
        let input_size = self.input_size as usize;
        let raw_bytes = resized.as_raw();

        if self.tensor_buffer.len() != 3 * input_size * input_size {
            self.tensor_buffer.resize(3 * input_size * input_size, 0.0);
        }

        // THE BUFFER IS FILLED IN PLACE AND LENT TO ORT AS A VIEW, SO IT IS REUSED ACROSS CALLS (FEAT-004 D2)
        self.tensor_buffer.par_chunks_mut(stride_c).enumerate().for_each(|(c, plane)| {
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

        let input_tensor = TensorRef::from_array_view(([1_usize, 3, input_size, input_size], &*self.tensor_buffer))
            .map_err(|e| anyhow::anyhow!("FAILED TO CREATE RF-DETR INPUT TENSOR: {}", e))?;

        let outputs = self.session.run(ort::inputs![
            "input" => input_tensor,
        ]).map_err(|e| anyhow::anyhow!("RF-DETR INFERENCE RUN ERROR: {}", e))?;

        // OUTPUTS BY NAME (VERIFIED AT LOAD): dets [1, Q, 4] (cx, cy, w, h IN [0, 1]), labels [1, Q, C] LOGITS
        let dets = outputs.get("dets").ok_or_else(|| anyhow::anyhow!("RF-DETR OUTPUT 'dets' MISSING"))?;
        let labels = outputs.get("labels").ok_or_else(|| anyhow::anyhow!("RF-DETR OUTPUT 'labels' MISSING"))?;
        let (dets_shape, dets_slice) = dets.try_extract_tensor::<f32>()
            .map_err(|e| anyhow::anyhow!("EXTRACT DETS TENSOR ERROR: {}", e))?;
        let (labels_shape, labels_slice) = labels.try_extract_tensor::<f32>()
            .map_err(|e| anyhow::anyhow!("EXTRACT LABELS TENSOR ERROR: {}", e))?;
        let dets_shape: Vec<i64> = dets_shape.iter().copied().collect();
        let labels_shape: Vec<i64> = labels_shape.iter().copied().collect();
        decode_outputs(dets_slice, &dets_shape, labels_slice, &labels_shape, orig_w, orig_h)
    }
}

/// ONE DETECTOR BOX FROM PAGE-SPACE CORNERS: SORT EACH PAIR, CLAMP TO THE PAGE, KEEP THE ROUNDING OF AN INTERIOR BOX
/// EXACTLY AS BEFORE (x = round(min), w = round(|x2 - x1|)), AND KEEP x + w INSIDE THE PAGE (FEAT-004 D1). None WHEN
/// THE BOX LIES FULLY OUTSIDE THE PAGE OR A CORNER IS NOT FINITE.
fn page_box(x1: f32, y1: f32, x2: f32, y2: f32, page_w: u32, page_h: u32) -> Option<BoxRect> {
    if ![x1, y1, x2, y2].iter().all(|v| v.is_finite()) {
        return None;
    }
    let (pw, ph) = (page_w as f32, page_h as f32);
    let (lx, hx) = (x1.min(x2).clamp(0.0, pw), x1.max(x2).clamp(0.0, pw));
    let (ly, hy) = (y1.min(y2).clamp(0.0, ph), y1.max(y2).clamp(0.0, ph));
    if hx - lx <= 0.0 && (x1 - x2).abs() > 0.0 || hy - ly <= 0.0 && (y1 - y2).abs() > 0.0 {
        return None;
    }
    let axis = |lo: f32, hi: f32, page: u32| -> (i32, i32) {
        let mut pos = lo.round() as i32;
        if pos >= page as i32 {
            pos = page as i32 - 1;
        }
        let pos = pos.max(0);
        let len = ((hi - lo).round().max(1.0) as i32).min(page as i32 - pos).max(1);
        (pos, len)
    };
    let (x, w) = axis(lx, hx, page_w);
    let (y, h) = axis(ly, hy, page_h);
    Some(BoxRect { x, y, w, h })
}

/// DECODES RF-DETR OUTPUTS INTO PAGE-SPACE DETECTIONS. SHAPES ARE CHECKED ([1, Q, 4] AND [1, Q, C] WITH C >= 4) AND
/// THE CLASS COUNT IS READ FROM THE SHAPE (D4); ONLY CLASSES 0..4 ARE MAPPED. A QUERY WITH A NON-FINITE VALUE IS SKIPPED.
pub fn decode_outputs(
    dets: &[f32],
    dets_shape: &[i64],
    labels: &[f32],
    labels_shape: &[i64],
    orig_w: u32,
    orig_h: u32,
) -> Result<RtDetrResult> {
    if dets_shape.len() != 3 || dets_shape[0] != 1 || dets_shape[2] != 4 {
        anyhow::bail!("RF-DETR dets SHAPE {:?} IS NOT [1, Q, 4]", dets_shape);
    }
    if labels_shape.len() != 3 || labels_shape[0] != 1 || labels_shape[1] != dets_shape[1] || labels_shape[2] < 4 {
        anyhow::bail!("RF-DETR labels SHAPE {:?} DOES NOT MATCH dets {:?} (NEED [1, Q, C >= 4])", labels_shape, dets_shape);
    }
    let num_queries = usize::try_from(dets_shape[1]).map_err(|_| anyhow::anyhow!("RF-DETR NEGATIVE QUERY COUNT"))?;
    let num_classes = usize::try_from(labels_shape[2]).map_err(|_| anyhow::anyhow!("RF-DETR NEGATIVE CLASS COUNT"))?;
    if dets.len() < num_queries * 4 || labels.len() < num_queries * num_classes {
        anyhow::bail!("RF-DETR OUTPUT BUFFERS ARE SHORTER THAN THEIR SHAPES");
    }

    let mut panels = Vec::new();
    let mut bubbles = Vec::new();
    let mut onomatopoeia = Vec::new();
    let mut text_bubbles = Vec::new();
    let text_free = Vec::new();
    let mut all_detections = Vec::new();

    for q in 0..num_queries {
        let cx = dets[q * 4];
        let cy = dets[q * 4 + 1];
        let bw = dets[q * 4 + 2];
        let bh = dets[q * 4 + 3];
        let logits = &labels[q * num_classes..q * num_classes + 4];
        if !logits.iter().all(|v| v.is_finite()) {
            continue;
        }

        let x1 = (cx - 0.5 * bw) * orig_w as f32;
        let y1 = (cy - 0.5 * bh) * orig_h as f32;
        let x2 = (cx + 0.5 * bw) * orig_w as f32;
        let y2 = (cy + 0.5 * bh) * orig_h as f32;
        let Some(box_rect) = page_box(x1, y1, x2, y2, orig_w, orig_h) else {
            continue;
        };

        for (c, logit) in logits.iter().enumerate() {
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
                        RfDetrClass::Bubble => bubbles.push(box_rect.clone()),
                        RfDetrClass::Text => text_bubbles.push((box_rect.clone(), score)),
                        RfDetrClass::Onomatopoeia => onomatopoeia.push((box_rect.clone(), score)),
                        RfDetrClass::Panel => panels.push(box_rect.clone()),
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
