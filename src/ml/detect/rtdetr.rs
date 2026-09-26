// -- CRATE / EXTERNAL IMPORTS -- //
use std::path::Path;
use anyhow::{Context, Result};
use image::{DynamicImage, GenericImageView};
use ort::{session::Session, value::{Tensor, TensorRef}};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

// -- INTERNAL IMPORTS -- //
use crate::ml::schemas::BoxRect;

// -- CONSTANTS -- //
pub const RTDETR_INPUT_SIZE: u32 = 1024;
pub const RTDETR_DEFAULT_SCORE_THRESH: f32 = 0.25;
pub const RTDETR_BUBBLE_SCORE_THRESH: f32 = 0.15;
pub const RTDETR_TEXT_BUBBLE_SCORE_THRESH: f32 = 0.20;
// THE EFFECTIVE FREE-TEXT CUT HAS ALWAYS BEEN 0.25 (THE OLD min() WITH THE DEFAULT THRESHOLD); THE VALUE NOW SAYS SO
// (FEAT-004 ADR-006).
pub const RTDETR_TEXT_FREE_SCORE_THRESH: f32 = 0.25;

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
    // TRUE WHEN THE MODEL NAMES ITS OUTPUTS labels / boxes / scores; OTHERWISE THEY ARE READ BY POSITION (D5)
    named_outputs: bool,
}

// ONE WARNING PER PROCESS WHEN THE OUTPUTS HAVE TO BE READ BY POSITION
static WARNED_POSITIONAL: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

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
        let names: Vec<String> = session.outputs().iter().map(|o| o.name().to_string()).collect();
        let named_outputs = ["labels", "boxes", "scores"].iter().all(|n| names.iter().any(|m| m == n));

        Self {
            session,
            input_size,
            tensor_buffer,
            named_outputs,
        }
    }

    pub fn detect(&mut self, img: &DynamicImage) -> Result<RtDetrResult> {
        // 0.0: THE CLASS THRESHOLDS APPLY AS THEY ARE (THE SAME EFFECTIVE CUTS AS BEFORE ADR-006)
        self.detect_with_threshold(img, 0.0)
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
            self.tensor_buffer = vec![0.0_f32; 3 * input_size * input_size];
        }

        // FILL THE THREE CHANNEL PLANES IN PARALLEL; THE BUFFER IS LENT TO ORT AS A VIEW, NEVER CLONED (FEAT-004 D3)
        self.tensor_buffer.par_chunks_mut(stride_c).enumerate().for_each(|(c, plane)| {
            for y in 0..input_size {
                let row_offset = y * stride_y;
                let raw_row_offset = y * input_size * 3;
                for x in 0..input_size {
                    plane[row_offset + x] = raw_bytes[raw_row_offset + x * 3 + c] as f32 / 255.0;
                }
            }
        });

        let input_images = TensorRef::from_array_view(([1_usize, 3, input_size, input_size], &*self.tensor_buffer))
            .map_err(|e| anyhow::anyhow!("FAILED TO CREATE RT-DETR IMAGES TENSOR: {}", e))?;

        let orig_sizes_vec: Vec<i64> = vec![orig_h as i64, orig_w as i64];
        let input_sizes = Tensor::from_array(([1, 2], orig_sizes_vec))
            .map_err(|e| anyhow::anyhow!("FAILED TO CREATE RT-DETR SIZES TENSOR: {}", e))?;

        let outputs = self.session.run(ort::inputs![
            "images" => input_images,
            "orig_target_sizes" => input_sizes,
        ]).map_err(|e| anyhow::anyhow!("RT-DETR INFERENCE RUN ERROR: {}", e))?;

        // labels [1, Q] (i64), boxes [1, Q, 4] (x1, y1, x2, y2), scores [1, Q]; BY NAME WHEN THE MODEL NAMES THEM
        let pick = |name: &str, pos: usize| -> Result<&ort::value::DynValue> {
            if self.named_outputs {
                outputs.get(name).ok_or_else(|| anyhow::anyhow!("RT-DETR OUTPUT '{}' MISSING", name))
            } else {
                if !WARNED_POSITIONAL.swap(true, std::sync::atomic::Ordering::Relaxed) {
                    tracing::warn!("RT-DETR outputs are not named labels/boxes/scores; reading them by position");
                }
                if pos < outputs.len() { Ok(&outputs[pos]) } else { anyhow::bail!("RT-DETR OUTPUT {} MISSING", pos) }
            }
        };
        let (labels_shape, labels_slice) = pick("labels", 0)?.try_extract_tensor::<i64>()
            .map_err(|e| anyhow::anyhow!("EXTRACT LABELS TENSOR ERROR: {}", e))?;
        let (boxes_shape, boxes_slice) = pick("boxes", 1)?.try_extract_tensor::<f32>()
            .map_err(|e| anyhow::anyhow!("EXTRACT BOXES TENSOR ERROR: {}", e))?;
        let (scores_shape, scores_slice) = pick("scores", 2)?.try_extract_tensor::<f32>()
            .map_err(|e| anyhow::anyhow!("EXTRACT SCORES TENSOR ERROR: {}", e))?;
        let shape = |s: &ort::value::Shape| -> Vec<i64> { s.iter().copied().collect() };
        decode_outputs(
            labels_slice,
            &shape(labels_shape),
            boxes_slice,
            &shape(boxes_shape),
            scores_slice,
            &shape(scores_shape),
            orig_w,
            orig_h,
            score_thresh,
        )
    }
}

/// DECODES RT-DETR OUTPUTS. SHAPES ARE CHECKED (labels [1, Q], boxes [1, Q, 4], scores [1, Q]). `score_thresh` CAN
/// ONLY RAISE A CLASS THRESHOLD (ADR-006). NEGATIVE LABEL IDS AND NON-FINITE VALUES ARE SKIPPED.
#[allow(clippy::too_many_arguments)]
pub fn decode_outputs(
    labels: &[i64],
    labels_shape: &[i64],
    boxes: &[f32],
    boxes_shape: &[i64],
    scores: &[f32],
    scores_shape: &[i64],
    orig_w: u32,
    orig_h: u32,
    score_thresh: f32,
) -> Result<RtDetrResult> {
    let q = match labels_shape {
        [1, q] if *q >= 0 => *q,
        _ => anyhow::bail!("RT-DETR labels SHAPE {:?} IS NOT [1, Q]", labels_shape),
    };
    if boxes_shape != [1, q, 4] || scores_shape != [1, q] {
        anyhow::bail!("RT-DETR boxes {:?} / scores {:?} DO NOT MATCH labels [1, {}]", boxes_shape, scores_shape, q);
    }
    let num_queries = q as usize;
    if labels.len() < num_queries || boxes.len() < num_queries * 4 || scores.len() < num_queries {
        anyhow::bail!("RT-DETR OUTPUT BUFFERS ARE SHORTER THAN THEIR SHAPES");
    }

    let mut bubbles = Vec::new();
    let mut text_bubbles = Vec::new();
    let mut text_free = Vec::new();
    let mut all_detections = Vec::new();

    for i in 0..num_queries {
        let score = scores[i];
        if !score.is_finite() {
            continue;
        }
        let Ok(label_id) = u32::try_from(labels[i]) else {
            continue;
        };
        let Some(class) = RtDetrClass::from_u32(label_id) else {
            continue;
        };

        let min_thresh = match class {
            RtDetrClass::Bubble => RTDETR_BUBBLE_SCORE_THRESH.max(score_thresh),
            RtDetrClass::TextBubble => RTDETR_TEXT_BUBBLE_SCORE_THRESH.max(score_thresh),
            RtDetrClass::TextFree => RTDETR_TEXT_FREE_SCORE_THRESH.max(score_thresh),
        };
        if score < min_thresh {
            continue;
        }

        let corners = &boxes[i * 4..i * 4 + 4];
        if !corners.iter().all(|v| v.is_finite()) {
            continue;
        }
        let x1 = corners[0].clamp(0.0, orig_w as f32);
        let y1 = corners[1].clamp(0.0, orig_h as f32);
        let x2 = corners[2].clamp(0.0, orig_w as f32);
        let y2 = corners[3].clamp(0.0, orig_h as f32);

        let min_x = x1.min(x2).round() as i32;
        let min_y = y1.min(y2).round() as i32;
        let w = (x2 - x1).abs().round().max(1.0) as i32;
        let h = (y2 - y1).abs().round().max(1.0) as i32;

        let box_rect = BoxRect { x: min_x, y: min_y, w, h };

        let detection = RtDetrDetection { class, score, box_: box_rect.clone() };

        match class {
            RtDetrClass::Bubble => bubbles.push(box_rect),
            RtDetrClass::TextBubble => text_bubbles.push((box_rect, score)),
            RtDetrClass::TextFree => text_free.push((box_rect, score)),
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
