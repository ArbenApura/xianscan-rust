// -- CRATE / EXTERNAL IMPORTS -- //
use std::path::Path;
use anyhow::{Context, Result};
use image::{DynamicImage, GenericImageView};
use serde::{Deserialize, Serialize};

// -- INTERNAL IMPORTS -- //
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

        anyhow::bail!("UNSUPPORTED COMIC DETECTOR MODEL SIGNATURE: EXPECTED RT-DETR OR RF-DETR")
    }

    pub fn backend_name(&self) -> &'static str {
        match &self.engine {
            DetectorEngine::RfDetr(_) => "Koharu RF-DETR Seg Layout Detector",
            DetectorEngine::RtDetr(_) => "RT-DETR Bubble & Text Detector",
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
        }
    }
}
