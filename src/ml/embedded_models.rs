//! Embedded model weights compiled into the binary when `--features embed-models` is active.

#[cfg(feature = "embed-models")]
pub const COMIC_DET_BYTES: &[u8] = include_bytes!("../../models/comictextdetector.pt.onnx");

#[cfg(feature = "embed-models")]
pub const PPOCR_DET_BYTES: &[u8] = include_bytes!("../../models/PP-OCRv6_det_small.onnx");

#[cfg(feature = "embed-models")]
pub const PPOCR_REC_BYTES: &[u8] = include_bytes!("../../models/PP-OCRv6_rec_small.onnx");

#[cfg(feature = "embed-models")]
pub const LAMA_BYTES: &[u8] = include_bytes!("../../models/lama.onnx");

#[cfg(feature = "embed-models")]
pub const RAPIDOCR_KEYS: &str = include_str!("../../models/rapidocr_keys.json");

#[cfg(feature = "embed-models")]
pub const KOREAN_REC_BYTES: &[u8] = include_bytes!("../../models/korean_mobile_v2.0_rec.onnx");

#[cfg(feature = "embed-models")]
pub const KOREAN_DICT: &str = include_str!("../../models/korean_dict.txt");

#[cfg(feature = "embed-models")]
pub const CYRILLIC_REC_BYTES: &[u8] = include_bytes!("../../models/cyrillic_mobile_v2.0_rec.onnx");

#[cfg(feature = "embed-models")]
pub const CYRILLIC_DICT: &str = include_str!("../../models/cyrillic_dict.txt");

#[cfg(feature = "embed-models")]
pub const THAI_REC_BYTES: &[u8] = include_bytes!("../../models/th_PP-OCRv5_mobile_rec.onnx");

#[cfg(feature = "embed-models")]
pub const THAI_DICT: &str = include_str!("../../models/th_dict.txt");

#[cfg(feature = "embed-models")]
pub const VIETNAMESE_REC_BYTES: &[u8] = include_bytes!("../../models/vi_PP-OCRv3_rec.onnx");

#[cfg(feature = "embed-models")]
pub const VIETNAMESE_DICT: &str = include_str!("../../models/vi_dict.txt");

#[cfg(feature = "embed-models")]
pub const PPOCR_CLS_BYTES: &[u8] = include_bytes!("../../models/ch_ppocr_mobile_v2.0_cls_mobile.onnx");
