use regex::Regex;
use std::sync::LazyLock;

pub static CJK_CHAR_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\u31f0-\u31ff\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\ud7b0-\ud7ff]").unwrap()
});

pub static CYRILLIC_CHAR_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[\u0400-\u04ff\u0500-\u052f\u2de0-\u2dff\ua640-\ua69f]").unwrap()
});

pub static THAI_CHAR_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[\u0e00-\u0e7f]").unwrap()
});

/// Non-Latin / non-alphanumeric foreign script characters (CJK, Cyrillic, Thai, Greek, Arabic, Devanagari, etc.)
pub static NON_LATIN_SCRIPT_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\u31f0-\u31ff\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\ud7b0-\ud7ff\u0400-\u04ff\u0500-\u052f\u2de0-\u2dff\ua640-\ua69f\u0e00-\u0e7f\u0370-\u03ff\u1f00-\u1fff\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff\u0900-\u097f]").unwrap()
});

/// Returns true if the text contains at least one Chinese, Japanese, or Korean character.
pub fn has_cjk_characters(text: &str) -> bool {
    CJK_CHAR_RE.is_match(text)
}

/// Strip all CJK characters from the text.
pub fn strip_cjk_characters(text: &str) -> String {
    CJK_CHAR_RE.replace_all(text, "").to_string()
}

/// Returns true if the text contains at least one ASCII/alphanumeric letter or digit.
pub fn has_alphanumeric_characters(text: &str) -> bool {
    text.chars().any(|c| c.is_ascii_alphanumeric())
}

/// Returns true if the string consists of alphanumeric characters without ANY CJK characters.
pub fn is_standalone_alphanumeric_without_cjk(text: &str) -> bool {
    has_alphanumeric_characters(text) && !has_cjk_characters(text)
}

/// Check if the specified source language is Cyrillic (e.g. Russian, Ukrainian).
pub fn is_cyrillic_source(source_lang: Option<&str>) -> bool {
    match source_lang {
        None => false,
        Some(s) => {
            let trimmed = s.trim().to_ascii_lowercase();
            ["ru", "russian", "cyrillic", "uk", "ukrainian", "be", "belarusian", "bg", "bulgarian"].iter().any(|&l| trimmed == l || trimmed.starts_with(&format!("{}-", l)) || trimmed.starts_with(&format!("{}_", l)))
        }
    }
}

/// Check if the specified source language is Thai.
pub fn is_thai_source(source_lang: Option<&str>) -> bool {
    match source_lang {
        None => false,
        Some(s) => {
            let trimmed = s.trim().to_ascii_lowercase();
            trimmed == "th" || trimmed == "thai" || trimmed.starts_with("th-") || trimmed.starts_with("th_")
        }
    }
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
            } else if is_cyrillic_source(Some(&trimmed)) || is_thai_source(Some(&trimmed)) {
                false
            } else {
                !is_latin_source(Some(&trimmed))
            }
        }
    }
}

/// Check if the specified source language is Latin / European / alphanumeric based.
pub fn is_latin_source(source_lang: Option<&str>) -> bool {
    match source_lang {
        None => false,
        Some(s) => {
            let trimmed = s.trim().to_ascii_lowercase();
            ["en", "eng", "english", "es", "spanish", "fr", "french", "de", "german", "pt", "portuguese", "it", "italian", "id", "indonesian", "vi", "vietnamese", "nl", "dutch", "tr", "turkish", "pl", "polish"].iter().any(|&l| trimmed == l || trimmed.starts_with(&format!("{}-", l)) || trimmed.starts_with(&format!("{}_", l)))
        }
    }
}

/// Strip foreign script characters that do not belong to the requested source language.
pub fn filter_text_by_source_lang(text: &str, source_lang: Option<&str>) -> String {
    if is_cyrillic_source(source_lang) {
        // Keep Cyrillic, Latin/alphanumeric, punctuation; strip CJK, Thai, etc.
        let no_cjk = CJK_CHAR_RE.replace_all(text, "");
        THAI_CHAR_RE.replace_all(&no_cjk, "").to_string()
    } else if is_thai_source(source_lang) {
        // Keep Thai, Latin/alphanumeric, punctuation; strip CJK, Cyrillic, etc.
        let no_cjk = CJK_CHAR_RE.replace_all(text, "");
        CYRILLIC_CHAR_RE.replace_all(&no_cjk, "").to_string()
    } else if is_cjk_source(source_lang) {
        // Keep CJK, Latin/alphanumeric, punctuation; strip Cyrillic, Thai, etc.
        let no_cyrillic = CYRILLIC_CHAR_RE.replace_all(text, "");
        THAI_CHAR_RE.replace_all(&no_cyrillic, "").to_string()
    } else {
        // Latin / alphanumeric (Vietnamese, Indonesian, English, Spanish, etc.): strip all non-Latin foreign scripts
        NON_LATIN_SCRIPT_RE.replace_all(text, "").to_string()
    }
}
