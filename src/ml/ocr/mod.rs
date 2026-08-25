pub mod decode;
pub mod engine;
pub mod slicing;

pub use decode::{decode_ctc_slice, parse_dict_string, OcrLine, OcrResult};
pub use engine::RapidOcr;
pub use slicing::{horizontal_paragraph_to_line_strips, vertical_to_upright_horizontal_strip};

