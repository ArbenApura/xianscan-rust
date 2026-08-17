use regex::Regex;
use std::sync::LazyLock;

pub static CJK_CHAR_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\u31f0-\u31ff\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\ud7b0-\ud7ff]").unwrap()
});

/// Returns true if the text contains at least one Chinese, Japanese, or Korean character.
pub fn has_cjk_characters(text: &str) -> bool {
    CJK_CHAR_RE.is_match(text)
}

/// Returns true if the text contains at least one ASCII/alphanumeric letter or digit.
pub fn has_alphanumeric_characters(text: &str) -> bool {
    text.chars().any(|c| c.is_ascii_alphanumeric())
}

/// Returns true if the string consists of alphanumeric characters without ANY CJK characters.
pub fn is_standalone_alphanumeric_without_cjk(text: &str) -> bool {
    has_alphanumeric_characters(text) && !has_cjk_characters(text)
}

/// Check if the specified source language is CJK (defaults to zh-Hans).
pub fn is_cjk_source(source_lang: Option<&str>) -> bool {
    match source_lang {
        None => true, // default to CJK (zh-Hans)
        Some(s) => {
            let trimmed = s.trim().to_ascii_lowercase();
            if trimmed.is_empty() || trimmed == "auto" {
                true
            } else if trimmed.starts_with("zh") || trimmed.starts_with("ja") || trimmed.starts_with("ko") {
                true
            } else {
                !is_latin_source(Some(&trimmed))
            }
        }
    }
}

/// Check if the specified source language is Latin / European / non-CJK based.
pub fn is_latin_source(source_lang: Option<&str>) -> bool {
    match source_lang {
        None => false,
        Some(s) => {
            let trimmed = s.trim().to_ascii_lowercase();
            ["en", "eng", "english", "es", "spanish", "fr", "french", "de", "german", "pt", "portuguese", "it", "italian", "ru", "russian", "id", "indonesian", "vi", "vietnamese", "th", "thai"].iter().any(|&l| trimmed == l || trimmed.starts_with(&format!("{}-", l)) || trimmed.starts_with(&format!("{}_", l)))
        }
    }
}
