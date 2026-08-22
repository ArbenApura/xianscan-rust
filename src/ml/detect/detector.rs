// -- CRATE / EXTERNAL IMPORTS -- //
use std::path::Path;
use anyhow::{Context, Result};
use image::{DynamicImage, GenericImageView, ImageBuffer};
use ort::{session::Session, value::Tensor};
use serde::{Deserialize, Serialize};

// -- INTERNAL IMPORTS -- //
use super::dbnet::lines_map_to_boxes;
use super::rfdetr::RfDetrSegDetector;
use super::rtdetr::{RtDetrComicDetector, RtDetrResult};
use crate::ml::schemas::BoxRect;

// -- TYPES & STRUCTS -- //

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectResult {
    pub boxes: Vec<Vec<[i32; 2]>>,
    pub scores: Vec<f32>,
    pub panels: Vec<BoxRect>,
    pub bubbles: Vec<BoxRect>,
    pub onomatopoeia: Vec<(BoxRect, f32)>,
    pub text_bubbles: Vec<(BoxRect, f32)>,
    pub text_free: Vec<(BoxRect, f32)>,
    pub mask: Vec<u8>,
    pub mask_width: u32,
    pub mask_height: u32,
    pub backend: String,
}

enum DetectorEngine {
    RtDetr(RtDetrComicDetector),
    RfDetr(RfDetrSegDetector),
    LegacyCtd { session: Session, input_size: u32 },
}

pub struct ComicTextDetector {
    engine: DetectorEngine,
}

// -- TRAITS & IMPLEMENTATIONS -- //

impl ComicTextDetector {
    pub fn new<P: AsRef<Path>>(model_path: P) -> Result<Self> {
        let bytes = std::fs::read(model_path.as_ref())
            .context("FAILED TO READ ONNX MODEL FILE")?;
        Self::from_bytes(&bytes)
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        // SINGLE-PASS SESSION CREATION: BUILD ONNX SESSION ONCE AND ROUTE BY SIGNATURE
        let session = crate::ml::device::create_session_from_memory(bytes, "comic_text_detector")?;

        // 1. RT-DETR (BUBBLE + TEXT TRANSFORMER DETECTOR)
        let is_rtdetr = session.inputs().iter().any(|i| i.name() == "orig_target_sizes");
        if is_rtdetr {
            return Ok(Self {
                engine: DetectorEngine::RtDetr(RtDetrComicDetector::from_session(session)),
            });
        }

        // 2. RF-DETR SEG (KOHARU LAYOUT SEGMENTATION DETECTOR)
        let is_rfdetr = session.inputs().iter().any(|i| i.name() == "input")
            && session.outputs().iter().any(|o| o.name() == "dets")
            && session.outputs().iter().any(|o| o.name() == "labels");
        if is_rfdetr {
            return Ok(Self {
                engine: DetectorEngine::RfDetr(RfDetrSegDetector::from_session(session)),
            });
        }

        // 3. FALLBACK TO LEGACY COMIC TEXT DETECTOR (DBNET)
        Ok(Self {
            engine: DetectorEngine::LegacyCtd {
                session,
                input_size: 1024,
            },
        })
    }

    pub fn backend_name(&self) -> &'static str {
        match &self.engine {
            DetectorEngine::RfDetr(_) => "Koharu RF-DETR Seg Layout Detector",
            DetectorEngine::RtDetr(_) => "RT-DETR Bubble & Text Detector",
            DetectorEngine::LegacyCtd { .. } => "Comic Text Detector (DBNet)",
        }
    }

    pub fn detect(&mut self, img: &DynamicImage) -> Result<DetectResult> {
        let (orig_w, orig_h) = img.dimensions();

        match &mut self.engine {
            DetectorEngine::RtDetr(rtdetr) => {
                let res: RtDetrResult = rtdetr.detect(img)?;
                let mut boxes: Vec<Vec<[i32; 2]>> = Vec::new();
                let mut scores: Vec<f32> = Vec::new();

                // ADD ENCLOSED TEXT BUBBLES
                for (b, s) in &res.text_bubbles {
                    boxes.push(vec![
                        [b.x, b.y],
                        [b.x + b.w, b.y],
                        [b.x + b.w, b.y + b.h],
                        [b.x, b.y + b.h],
                    ]);
                    scores.push(*s);
                }

                // ADD FREE-FLOATING TEXT / SFX
                for (b, s) in &res.text_free {
                    boxes.push(vec![
                        [b.x, b.y],
                        [b.x + b.w, b.y],
                        [b.x + b.w, b.y + b.h],
                        [b.x, b.y + b.h],
                    ]);
                    scores.push(*s);
                }

                Ok(DetectResult {
                    boxes,
                    scores,
                    panels: res.panels,
                    bubbles: res.bubbles,
                    onomatopoeia: res.onomatopoeia,
                    text_bubbles: res.text_bubbles,
                    text_free: res.text_free,
                    mask: Vec::new(),
                    mask_width: orig_w,
                    mask_height: orig_h,
                    backend: "rtdetr-v2".to_string(),
                })
            }
            DetectorEngine::RfDetr(rfdetr) => {
                let res: RtDetrResult = rfdetr.detect(img)?;
                let mut boxes: Vec<Vec<[i32; 2]>> = Vec::new();
                let mut scores: Vec<f32> = Vec::new();

                // ADD ENCLOSED TEXT BUBBLES
                for (b, s) in &res.text_bubbles {
                    boxes.push(vec![
                        [b.x, b.y],
                        [b.x + b.w, b.y],
                        [b.x + b.w, b.y + b.h],
                        [b.x, b.y + b.h],
                    ]);
                    scores.push(*s);
                }

                // ADD FREE-FLOATING TEXT
                for (b, s) in &res.text_free {
                    boxes.push(vec![
                        [b.x, b.y],
                        [b.x + b.w, b.y],
                        [b.x + b.w, b.y + b.h],
                        [b.x, b.y + b.h],
                    ]);
                    scores.push(*s);
                }

                // ADD ONOMATOPOEIA / SFX
                for (b, s) in &res.onomatopoeia {
                    boxes.push(vec![
                        [b.x, b.y],
                        [b.x + b.w, b.y],
                        [b.x + b.w, b.y + b.h],
                        [b.x, b.y + b.h],
                    ]);
                    scores.push(*s);
                }

                Ok(DetectResult {
                    boxes,
                    scores,
                    panels: res.panels,
                    bubbles: res.bubbles,
                    onomatopoeia: res.onomatopoeia,
                    text_bubbles: res.text_bubbles,
                    text_free: res.text_free,
                    mask: Vec::new(),
                    mask_width: orig_w,
                    mask_height: orig_h,
                    backend: "rfdetr-seg-2xl".to_string(),
                })
            }
            DetectorEngine::LegacyCtd { session, input_size } => {
                let (tensor_vec, pad_w, pad_h) = preprocess_for_onnx(img, *input_size);

                let input_tensor = Tensor::from_array(([1, 3, *input_size as usize, *input_size as usize], tensor_vec))
                    .map_err(|e| anyhow::anyhow!("TENSOR CREATE ERROR: {}", e))?;

                let outputs = session.run(ort::inputs![input_tensor])
                    .map_err(|e| anyhow::anyhow!("SESSION RUN ERROR: {}", e))?;

                // OUTPUT [1]: MASK (1, 1024, 1024)
                // OUTPUT [2]: LINES MAP (1, 2, 1024, 1024)
                let (_mask_shape, mask_slice) = outputs[1].try_extract_tensor::<f32>()
                    .map_err(|e| anyhow::anyhow!("EXTRACT MASK TENSOR ERROR: {}", e))?;
                let (_lines_shape, lines_slice) = outputs[2].try_extract_tensor::<f32>()
                    .map_err(|e| anyhow::anyhow!("EXTRACT LINES TENSOR ERROR: {}", e))?;

                let unpad_w = (*input_size - pad_w) as usize;
                let unpad_h = (*input_size - pad_h) as usize;

                let mut lines_map = vec![0.0_f32; unpad_w * unpad_h];
                for y in 0..unpad_h {
                    for x in 0..unpad_w {
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

                // CONVERT UNPADDED MASK TO U8 AND RESIZE BACK TO ORIGINAL RESOLUTION
                let mut unpad_mask = vec![0_u8; unpad_w * unpad_h];
                for y in 0..unpad_h {
                    for x in 0..unpad_w {
                        let prob = mask_slice[y * 1024 + x];
                        unpad_mask[y * unpad_w + x] = (prob * 255.0).clamp(0.0, 255.0) as u8;
                    }
                }

                let mask_img: ImageBuffer<image::Luma<u8>, _> =
                    ImageBuffer::from_raw(unpad_w as u32, unpad_h as u32, unpad_mask)
                        .context("FAILED TO CONSTRUCT UNPADDED MASK IMAGE")?;

                let resized_mask = image::imageops::resize(
                    &mask_img,
                    orig_w,
                    orig_h,
                    image::imageops::FilterType::Triangle,
                );

                Ok(DetectResult {
                    boxes,
                    scores,
                    panels: Vec::new(),
                    bubbles: Vec::new(),
                    onomatopoeia: Vec::new(),
                    text_bubbles: Vec::new(),
                    text_free: Vec::new(),
                    mask: resized_mask.into_raw(),
                    mask_width: orig_w,
                    mask_height: orig_h,
                    backend: "comic-ctd".to_string(),
                })
            }
        }
    }
}

// -- FUNCTIONS & ALGORITHMS -- //

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

    let mut tensor = vec![0.0_f32; 3 * input_size as usize * input_size as usize];

    // COMIC TEXT DETECTOR EXPECTS BGR CHANNEL ORDER NORMALIZED TO [0, 1]
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
            // CHANNEL 0: B, CHANNEL 1: G, CHANNEL 2: R
            tensor[tensor_idx] = b_val;
            tensor[stride_c + tensor_idx] = g_val;
            tensor[2 * stride_c + tensor_idx] = r_val;
        }
    }

    (tensor, pad_w, pad_h)
}
