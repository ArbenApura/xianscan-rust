use std::path::Path;
use anyhow::Result;
use image::DynamicImage;

use crate::ml::detect::ComicTextDetector;
use crate::ml::inpaint::LamaInpainter;
use crate::ml::ocr::RapidOcr;
use crate::ml::schemas::{AnalyzeOptions, AnalyzeResponse, CleanRequestRegion};
use crate::ml::watermark::WatermarkRemover;
use super::analyzer::{analyze_image, analyze_image_with_options};
use super::cleaner::clean_image;

pub struct PipelineEngine {
    pub detector: Option<ComicTextDetector>,
    pub ocr: Option<RapidOcr>,
    pub inpainter: Option<LamaInpainter>,
    pub watermark: WatermarkRemover,
}

impl PipelineEngine {
    pub fn new<P: AsRef<Path>>(models_dir: P) -> Self {
        let dir = models_dir.as_ref();

        // 1. ComicTextDetector / RT-DETR Comic Bubble & Text Detector
        let detector = if dir.join("comic_text_and_bubble_detector.onnx").exists() {
            ComicTextDetector::new(dir.join("comic_text_and_bubble_detector.onnx")).ok()
        } else if dir.join("detector.onnx").exists() {
            ComicTextDetector::new(dir.join("detector.onnx")).ok()
        } else if dir.join("detector_int8.onnx").exists() {
            ComicTextDetector::new(dir.join("detector_int8.onnx")).ok()
        } else if dir.join("comictextdetector.pt.onnx").exists() {
            ComicTextDetector::new(dir.join("comictextdetector.pt.onnx")).ok()
        } else {
            #[cfg(feature = "embed-models")]
            {
                ComicTextDetector::from_bytes(crate::ml::embedded_models::COMIC_DET_BYTES).ok()
            }
            #[cfg(not(feature = "embed-models"))]
            {
                None
            }
        };

        // 2. RapidOCR
        let mut ocr = if dir.join("PP-OCRv6_rec_small.onnx").exists() {
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
            RapidOcr::new(det_path, dir.join("PP-OCRv6_rec_small.onnx"), dict_path).ok()
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
                    let _ = engine.load_vietnamese_from_bytes(
                        crate::ml::embedded_models::VIETNAMESE_REC_BYTES,
                        crate::ml::embedded_models::VIETNAMESE_DICT,
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
            if dir.join("vi_PP-OCRv3_rec.onnx").exists() && dir.join("vi_dict.txt").exists() {
                let _ = ocr_engine.load_vietnamese_model(dir.join("vi_PP-OCRv3_rec.onnx"), dir.join("vi_dict.txt"));
            }
            if dir.join("th_PP-OCRv5_mobile_rec.onnx").exists() && dir.join("th_dict.txt").exists() {
                let _ = ocr_engine.load_thai_model(dir.join("th_PP-OCRv5_mobile_rec.onnx"), dir.join("th_dict.txt"));
            }
        }

        // 3. LaMa Inpainter
        let inpainter = if dir.join("lama.onnx").exists() {
            LamaInpainter::new(dir.join("lama.onnx")).ok()
        } else {
            #[cfg(feature = "embed-models")]
            {
                LamaInpainter::from_bytes(crate::ml::embedded_models::LAMA_BYTES).ok()
            }
            #[cfg(not(feature = "embed-models"))]
            {
                None
            }
        };

        let watermark = WatermarkRemover::new();

        Self {
            detector,
            ocr,
            inpainter,
            watermark,
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

    pub fn clean_image(&mut self, img: &DynamicImage, regions: &[CleanRequestRegion], mode: &str) -> Result<DynamicImage> {
        clean_image(&mut self.inpainter, img, regions, mode)
    }
}
