pub mod dbnet;
pub mod detector;
pub mod grouping;
pub mod lang;
pub mod rfdetr;
pub mod rtdetr;
pub mod text_clean;

pub use dbnet::lines_map_to_boxes;
pub use detector::{ComicTextDetector, DetectResult};
pub use rfdetr::{RfDetrClass, RfDetrDetection, RfDetrSegDetector};
pub use rtdetr::{RtDetrClass, RtDetrComicDetector, RtDetrDetection, RtDetrResult};
pub use grouping::{cluster_adjacent_sfx_boxes, deduplicate_boxes, filter_orthogonal_line_conflicts, sort_regions_top_to_bottom};
pub use lang::{
    filter_text_by_source_lang, has_alphanumeric_characters, has_cjk_characters, is_cjk_source,
    is_cyrillic_source, is_latin_source, is_standalone_alphanumeric_without_cjk, is_thai_source,
    strip_cjk_characters, CJK_CHAR_RE, CYRILLIC_CHAR_RE, NON_LATIN_SCRIPT_RE, THAI_CHAR_RE,
};
pub use text_clean::{
    clean_stray_ocr_artifacts, is_onomatopoeia_or_shout, is_pure_watermark_region, is_standalone_noise_stroke, is_watermark_line,
    ALL_ELLIPSIS, CHINESE_RE, ELLIPSIS_TAIL, EXCLAIM_TAIL, NOISE_STROKES_RE, PUNCT_ONLY, PUNCT_TAIL,
    QUESTION_TAIL, WATERMARK_RE,
};
