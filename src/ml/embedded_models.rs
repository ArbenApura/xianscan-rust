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
