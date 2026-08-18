//! Embedded model weights compiled into the binary when `--features embed-models` is active.

#[cfg(feature = "embed-models")]
pub static COMIC_DET_BYTES: &[u8] = include_bytes!("../../models/comic_text_and_bubble_detector.onnx");

#[cfg(feature = "embed-models")]
pub static PPOCR_DET_BYTES: &[u8] = include_bytes!("../../models/PP-OCRv6_det_small.onnx");

#[cfg(feature = "embed-models")]
pub static PPOCR_REC_BYTES: &[u8] = include_bytes!("../../models/PP-OCRv6_rec_small.onnx");

#[cfg(feature = "embed-models")]
pub static LAMA_BYTES: &[u8] = include_bytes!("../../models/lama.onnx");

#[cfg(feature = "embed-models")]
pub static RAPIDOCR_KEYS: &str = include_str!("../../models/rapidocr_keys.json");

#[cfg(feature = "embed-models")]
pub static KOREAN_REC_BYTES: &[u8] = include_bytes!("../../models/korean_mobile_v2.0_rec.onnx");

#[cfg(feature = "embed-models")]
pub static KOREAN_DICT: &str = include_str!("../../models/korean_dict.txt");

#[cfg(feature = "embed-models")]
pub static CYRILLIC_REC_BYTES: &[u8] = include_bytes!("../../models/cyrillic_mobile_v2.0_rec.onnx");

#[cfg(feature = "embed-models")]
pub static CYRILLIC_DICT: &str = include_str!("../../models/cyrillic_dict.txt");

#[cfg(feature = "embed-models")]
pub static THAI_REC_BYTES: &[u8] = include_bytes!("../../models/th_PP-OCRv5_mobile_rec.onnx");

#[cfg(feature = "embed-models")]
pub static THAI_DICT: &str = include_str!("../../models/th_dict.txt");

#[cfg(feature = "embed-models")]
pub static PPOCR_CLS_BYTES: &[u8] = include_bytes!("../../models/ch_ppocr_mobile_v2.0_cls_mobile.onnx");
