pub mod decode;
pub mod engine;

pub use decode::{decode_ctc_slice, parse_dict_string, OcrLine, OcrResult};
pub use engine::RapidOcr;
