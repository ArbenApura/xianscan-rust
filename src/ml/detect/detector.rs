// -- CRATE / EXTERNAL IMPORTS -- //
use std::path::Path;
use anyhow::{Context, Result};
use image::{DynamicImage, GenericImageView};
use serde::{Deserialize, Serialize};

// -- INTERNAL IMPORTS -- //
use super::rfdetr::RfDetrSegDetector;
use super::rtdetr::{RtDetrComicDetector, RtDetrResult};
use super::tiling::{merge_tiled, plan_tiles, Tile, TilingConfig};
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
    // TALL-PAGE TILING (FEAT-004 PHASE 5); ONE TILE MEANS THE SINGLE-PASS PATH, UNCHANGED
    tiling: TilingConfig,
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
                tiling: TilingConfig::default(),
            });
        }

        // 2. RF-DETR SEG (KOHARU LAYOUT SEGMENTATION DETECTOR)
        let is_rfdetr = session.inputs().iter().any(|i| i.name() == "input")
            && session.outputs().iter().any(|o| o.name() == "dets")
            && session.outputs().iter().any(|o| o.name() == "labels");
        if is_rfdetr {
            return Ok(Self {
                engine: DetectorEngine::RfDetr(RfDetrSegDetector::from_session(session)),
                tiling: TilingConfig::default(),
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

    /// REPLACES THE TILING CONFIGURATION (THE A/B HARNESS SWITCHES IT OFF AND ON).
    pub fn set_tiling(&mut self, cfg: TilingConfig) {
        self.tiling = cfg;
    }

    /// THE TILES A PAGE OF THIS SIZE IS DETECTED IN (ONE MEANS A SINGLE PASS).
    pub fn plan_for(&self, w: u32, h: u32) -> Vec<Tile> {
        plan_tiles(w, h, &self.tiling)
    }

    /// DETECTS THE PAGE, TILED WHEN IT IS TALLER THAN THE TRIGGER ASPECT (ADR-003). EACH TILE IS A FULL-WIDTH VIEW
    /// OF THE PAGE; ITS BOXES ARE MERGED BACK IN PAGE COORDINATES.
    pub fn detect(&mut self, img: &DynamicImage) -> Result<DetectResult> {
        let (w, h) = img.dimensions();
        let tiles = self.plan_for(w, h);
        if tiles.len() <= 1 {
            return self.detect_single(img);
        }
        let mut per_tile = Vec::with_capacity(tiles.len());
        for tile in tiles {
            let view = img.crop_imm(0, tile.y0, w, tile.h);
            per_tile.push((tile, self.detect_single(&view)?));
        }
        Ok(merge_tiled(per_tile, w, h))
    }

    fn detect_single(&mut self, img: &DynamicImage) -> Result<DetectResult> {
        let (orig_w, orig_h) = img.dimensions();

        match &mut self.engine {
            DetectorEngine::RtDetr(rtdetr) => {
                let res: RtDetrResult = rtdetr.detect(img)?;
                let mut boxes: Vec<Vec<[i32; 2]>> = Vec::new();
                let mut scores: Vec<f32> = Vec::new();

                // ADD ENCLOSED TEXT BUBBLES
                push_rect_polys(&mut boxes, &mut scores, &res.text_bubbles);

                // ADD FREE-FLOATING TEXT / SFX
                push_rect_polys(&mut boxes, &mut scores, &res.text_free);

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
                push_rect_polys(&mut boxes, &mut scores, &res.text_bubbles);

                // ADD FREE-FLOATING TEXT
                push_rect_polys(&mut boxes, &mut scores, &res.text_free);

                // ADD ONOMATOPOEIA / SFX
                push_rect_polys(&mut boxes, &mut scores, &res.onomatopoeia);

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

/// PUSHES EACH (BOX, SCORE) AS A 4-POINT POLYGON AND ITS SCORE, IN ORDER (DOWNSTREAM CODE IS ORDER-SENSITIVE).
fn push_rect_polys(boxes: &mut Vec<Vec<[i32; 2]>>, scores: &mut Vec<f32>, src: &[(crate::ml::schemas::BoxRect, f32)]) {
    for (b, s) in src {
        boxes.push(vec![[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]);
        scores.push(*s);
    }
}
