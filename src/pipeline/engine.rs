use std::path::Path;
use anyhow::Result;
use image::DynamicImage;

use crate::ml::detect::ComicTextDetector;
use crate::ml::inpaint::LamaInpainter;
use crate::ml::ocr::RapidOcr;
use crate::ml::schemas::{AnalyzeOptions, AnalyzeResponse, CleanRequestRegion};
use super::analyzer::{analyze_image, analyze_image_with_options};
use super::cleaner::clean_image;

pub struct PipelineEngine {
    pub detector: Option<ComicTextDetector>,
    pub ocr: Option<RapidOcr>,
    pub inpainter: Option<LamaInpainter>,
}

/// LOADS A MODEL FROM `path`, OR RETURNS None. A FILE THAT EXISTS BUT FAILS TO LOAD IS LOGGED (IT USED TO BE HIDDEN BY
/// `.ok()`, FEAT-004 H1).
fn load_or_warn<T>(what: &str, path: &Path, load: impl FnOnce(&Path) -> Result<T>) -> Option<T> {
    match load(path) {
        Ok(model) => Some(model),
        Err(e) => {
            tracing::warn!("{} model {} exists but failed to load: {}", what, path.display(), e);
            None
        }
    }
}

/// THE LAYOUT DETECTOR: THE MODELS-DIR FILE, ELSE THE EMBEDDED WEIGHTS (embed-models BUILDS), ELSE None.
pub fn load_detector(dir: &Path) -> Option<ComicTextDetector> {
    let file = dir.join("rfdetr-seg-2xlarge.onnx");
    if file.exists() {
        return load_or_warn("detector", &file, |f| ComicTextDetector::new(f));
    }
    #[cfg(feature = "embed-models")]
    {
        ComicTextDetector::from_bytes(crate::ml::embedded_models::COMIC_DET_BYTES).ok()
    }
    #[cfg(not(feature = "embed-models"))]
    {
        None
    }
}

/// RAPIDOCR (DETECTION + RECOGNITION) PLUS THE KOREAN, CYRILLIC AND THAI RECOGNISERS WHEN PRESENT.
pub fn load_ocr(dir: &Path) -> Option<RapidOcr> {
    let rec = dir.join("PP-OCRv6_rec_small.onnx");
    let mut ocr = if rec.exists() {
        let dict_path = if dir.join("rapidocr_keys.json").exists() {
            dir.join("rapidocr_keys.json")
        } else {
            dir.join("ppocr_keys_v1.txt")
        };
        let det_path = if dir.join("PP-OCRv6_det_small.onnx").exists() {
            Some(dir.join("PP-OCRv6_det_small.onnx"))
        } else {
            None
        };
        load_or_warn("OCR", &rec, |r| RapidOcr::new(det_path, r.to_path_buf(), dict_path))
    } else {
        #[cfg(feature = "embed-models")]
        {
            let mut emb_ocr = RapidOcr::from_bytes(
                Some(crate::ml::embedded_models::PPOCR_DET_BYTES),
                crate::ml::embedded_models::PPOCR_REC_BYTES,
                crate::ml::embedded_models::RAPIDOCR_KEYS,
            ).ok();
            if let Some(ref mut engine) = emb_ocr {
                let _ = engine.load_korean_from_bytes(
                    crate::ml::embedded_models::KOREAN_REC_BYTES,
                    crate::ml::embedded_models::KOREAN_DICT,
                );
                let _ = engine.load_cyrillic_from_bytes(
                    crate::ml::embedded_models::CYRILLIC_REC_BYTES,
                    crate::ml::embedded_models::CYRILLIC_DICT,
                );
                let _ = engine.load_thai_from_bytes(
                    crate::ml::embedded_models::THAI_REC_BYTES,
                    crate::ml::embedded_models::THAI_DICT,
                );
            }
            emb_ocr
        }
        #[cfg(not(feature = "embed-models"))]
        {
            None
        }
    };

    if let Some(ref mut ocr_engine) = ocr {
        if dir.join("korean_mobile_v2.0_rec.onnx").exists() && dir.join("korean_dict.txt").exists() {
            let _ = ocr_engine.load_korean_model(dir.join("korean_mobile_v2.0_rec.onnx"), dir.join("korean_dict.txt"));
        }
        if dir.join("cyrillic_mobile_v2.0_rec.onnx").exists() && dir.join("cyrillic_dict.txt").exists() {
            let _ = ocr_engine.load_cyrillic_model(dir.join("cyrillic_mobile_v2.0_rec.onnx"), dir.join("cyrillic_dict.txt"));
        }
        if dir.join("th_PP-OCRv5_mobile_rec.onnx").exists() && dir.join("th_dict.txt").exists() {
            let _ = ocr_engine.load_thai_model(dir.join("th_PP-OCRv5_mobile_rec.onnx"), dir.join("th_dict.txt"));
        }
    }
    ocr
}

/// THE LAMA INPAINTER: THE MODELS-DIR FILE, ELSE THE EMBEDDED WEIGHTS, ELSE None.
pub fn load_inpainter(dir: &Path) -> Option<LamaInpainter> {
    let file = dir.join("lama.onnx");
    if file.exists() {
        return load_or_warn("inpainter", &file, |f| LamaInpainter::new(f));
    }
    #[cfg(feature = "embed-models")]
    {
        LamaInpainter::from_bytes(crate::ml::embedded_models::LAMA_BYTES).ok()
    }
    #[cfg(not(feature = "embed-models"))]
    {
        None
    }
}

impl PipelineEngine {
    pub fn new<P: AsRef<Path>>(models_dir: P) -> Self {
        let dir = models_dir.as_ref();
        Self {
            detector: load_detector(dir),
            ocr: load_ocr(dir),
            inpainter: load_inpainter(dir),
        }
    }

    pub fn new_ocr_only<P: AsRef<Path>>(models_dir: P) -> Self {
        Self {
            detector: None,
            ocr: load_ocr(models_dir.as_ref()),
            inpainter: None,
        }
    }

    pub fn empty() -> Self {
        Self {
            detector: None,
            ocr: None,
            inpainter: None,
        }
    }

    pub fn analyze_image(&mut self, img: &DynamicImage) -> Result<AnalyzeResponse> {
        analyze_image(self, img)
    }

    pub fn analyze_image_with_options(
        &mut self,
        img: &DynamicImage,
        options: Option<&AnalyzeOptions>,
    ) -> Result<AnalyzeResponse> {
        analyze_image_with_options(self, img, options)
    }

    pub fn clean_image(&mut self, img: &DynamicImage, regions: &[CleanRequestRegion], mode: &str, enable_white_inpaint: bool) -> Result<DynamicImage> {
        clean_image(&mut self.inpainter, img, regions, mode, enable_white_inpaint)
    }

    /// Explicitly triggers process memory reclamation and working-set page release back to the OS.
    pub fn trim_memory(&self) {
        crate::ml::device::trim_process_memory();
    }
}
