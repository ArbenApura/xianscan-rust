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

pub static CHINESE_CHAR_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[\u4e00-\u9fff\u3400-\u4dbf]").unwrap()
});

pub static JAPANESE_KANA_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[\u3040-\u309f\u30a0-\u30ff\u31f0-\u31ff]").unwrap()
});

pub static KOREAN_HANGUL_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\ud7b0-\ud7ff]").unwrap()
});

/// Returns true if the text contains native script characters for the given non-Latin source language.
pub fn has_native_script_for_lang(text: &str, source_lang: Option<&str>) -> bool {
    if is_cyrillic_source(source_lang) {
        CYRILLIC_CHAR_RE.is_match(text)
    } else if is_thai_source(source_lang) {
        THAI_CHAR_RE.is_match(text)
    } else if let Some(lang) = source_lang {
        let trimmed = lang.trim().to_ascii_lowercase();
        if trimmed.starts_with("zh") {
            CHINESE_CHAR_RE.is_match(text)
        } else if trimmed.starts_with("ja") {
            CHINESE_CHAR_RE.is_match(text) || JAPANESE_KANA_RE.is_match(text)
        } else if trimmed.starts_with("ko") {
            CHINESE_CHAR_RE.is_match(text) || KOREAN_HANGUL_RE.is_match(text)
        } else if is_cjk_source(Some(&trimmed)) {
            CJK_CHAR_RE.is_match(text)
        } else {
            true
        }
    } else if is_cjk_source(source_lang) {
        CJK_CHAR_RE.is_match(text)
    } else {
        true
    }
}

/// Returns true if the source language uses a non-Latin / non-alphanumeric primary script (CJK, Cyrillic, Thai).
pub fn is_non_latin_source(source_lang: Option<&str>) -> bool {
    is_cjk_source(source_lang) || is_cyrillic_source(source_lang) || is_thai_source(source_lang)
}

/// Returns true if the string consists exclusively of digits, decimal points, degree symbols, or isolated particle punctuation (e.g. "8.0", "0°0", "00", "0.0", "500", "0°") without any alphabetic or CJK characters.
pub fn is_standalone_digit_or_particle_noise(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return true;
    }
    let has_digit = t.chars().any(|c| c.is_ascii_digit());
    let all_digit_or_particle_symbols = t.chars().all(|c| {
        c.is_ascii_digit()
            || c.is_whitespace()
            || matches!(c, '.' | '°' | '·' | '●' | '○' | '•' | '‥' | '．' | ',' | ':' | '\'' | '"' | '`' | '~' | '–' | '—' | '-')
    });
    has_digit && all_digit_or_particle_symbols && !t.chars().any(|c| c.is_alphabetic() || has_cjk_characters(&c.to_string()))
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
            ["en", "eng", "english", "es", "spanish", "fr", "french", "de", "german", "pt", "portuguese", "it", "italian", "id", "indonesian", "nl", "dutch", "tr", "turkish", "pl", "polish"].iter().any(|&l| trimmed == l || trimmed.starts_with(&format!("{}-", l)) || trimmed.starts_with(&format!("{}_", l)))
        }
    }
}

/// NORMALIZE LATIN HOMOGLYPHS AND DIGIT-LETTER CONFUSIONS TO CANONICAL CYRILLIC CHARACTERS IN RUSSIAN CONTEXT
pub fn normalize_cyrillic_homoglyphs(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();

    let has_cyrillic = chars.iter().any(|&c| ('\u{0400}'..='\u{04FF}').contains(&c));
    let has_alpha = chars.iter().any(|c| c.is_alphabetic());

    let mut upper_count = 0_usize;
    let mut lower_count = 0_usize;
    for &c in &chars {
        if c.is_uppercase() {
            upper_count += 1;
        } else if c.is_lowercase() {
            lower_count += 1;
        }
    }
    let is_mostly_lower = lower_count > upper_count;

    for (i, &c) in chars.iter().enumerate() {
        let mapped = match c {
            'A' => if is_mostly_lower { 'а' } else { 'А' },
            'B' => if is_mostly_lower { 'в' } else { 'В' },
            'C' => if is_mostly_lower { 'с' } else { 'С' },
            'D' => if is_mostly_lower { 'д' } else { 'Д' },
            'E' => if is_mostly_lower { 'е' } else { 'Е' },
            'F' => if is_mostly_lower { 'ф' } else { 'Ф' },
            'G' => if is_mostly_lower { 'г' } else { 'Г' },
            'H' => if is_mostly_lower { 'н' } else { 'Н' },
            'I' => if is_mostly_lower { 'и' } else { 'И' },
            'J' => if is_mostly_lower { 'й' } else { 'Й' },
            'K' => if is_mostly_lower { 'к' } else { 'К' },
            'L' => if is_mostly_lower { 'л' } else { 'Л' },
            'M' => if is_mostly_lower { 'м' } else { 'М' },
            'N' => if is_mostly_lower { 'н' } else { 'Н' },
            'O' => if is_mostly_lower { 'о' } else { 'О' },
            'P' => if is_mostly_lower { 'р' } else { 'Р' },
            'Q' => if is_mostly_lower { 'к' } else { 'К' },
            'R' => if is_mostly_lower { 'я' } else { 'Я' },
            'S' => if is_mostly_lower { 'с' } else { 'С' },
            'T' => if is_mostly_lower { 'т' } else { 'Т' },
            'U' => if is_mostly_lower { 'и' } else { 'И' },
            'V' => if is_mostly_lower { 'в' } else { 'В' },
            'W' => if is_mostly_lower { 'ш' } else { 'Ш' },
            'X' => if is_mostly_lower { 'т' } else { 'Т' },
            'Y' => if is_mostly_lower { 'у' } else { 'У' },
            'Z' => if is_mostly_lower { 'з' } else { 'З' },
            'a' => 'а',
            'b' => if is_mostly_lower { 'ь' } else { 'Ь' },
            'c' => if i == 0 && len >= 3 { 'в' } else { 'с' },
            'd' => if is_mostly_lower { 'д' } else { 'Д' },
            'e' => 'е',
            'f' => 'ф',
            'g' => if is_mostly_lower { 'г' } else { 'Г' },
            'h' => if is_mostly_lower { 'х' } else { 'Х' },
            'i' => 'и',
            'j' => 'й',
            'k' => 'к',
            'l' => if is_mostly_lower { 'л' } else { 'Л' },
            'm' => if is_mostly_lower { 'м' } else { 'М' },
            'n' => if is_mostly_lower { 'п' } else { 'П' },
            'o' => 'о',
            'p' => 'р',
            'q' => 'к',
            'r' => if is_mostly_lower { 'г' } else { 'Г' },
            's' => 'с',
            't' => if is_mostly_lower { 'т' } else { 'Т' },
            'u' => 'и',
            'v' => if is_mostly_lower { 'в' } else { 'В' },
            'w' => 'ш',
            'x' => 'х',
            'y' => 'у',
            'z' => 'з',
            '1' if (has_alpha || has_cyrillic || len <= 6) && i == 0 => if is_mostly_lower { 'т' } else { 'Т' },
            '3' if has_alpha || has_cyrillic || len <= 6 => if is_mostly_lower { 'з' } else { 'З' },
            '6' if (has_alpha || has_cyrillic || len <= 6) && i == 0 => if is_mostly_lower { 'в' } else { 'В' },
            '6' if (has_alpha || has_cyrillic || len <= 6) && i == len - 1 => if is_mostly_lower { 'ь' } else { 'Ь' },
            '6' if has_alpha || has_cyrillic => if is_mostly_lower { 'б' } else { 'Б' },
            '9' if has_alpha || has_cyrillic => if is_mostly_lower { 'я' } else { 'Я' },
            '0' if (has_alpha || has_cyrillic) && (i > 0 && i + 1 < len) => if is_mostly_lower { 'о' } else { 'О' },
            '2' if (has_alpha || has_cyrillic) && i == len - 1 => if is_mostly_lower { 'г' } else { 'Г' },
            '2' if (has_alpha || has_cyrillic) && i > 0 => if is_mostly_lower { 'д' } else { 'Д' },
            _ => c,
        };
        out.push(mapped);
    }

    if out.starts_with("клог") || out.starts_with("клоп") || out.starts_with("тлог") {
        out = out.replacen("кл", "тр", 1).replacen("тл", "тр", 1);
        if out.ends_with('п') {
            out.pop();
            out.push('г');
        }
    }

    out
}

/// Strip foreign script characters that do not belong to the requested source language.
pub fn filter_text_by_source_lang(text: &str, source_lang: Option<&str>) -> String {
    if is_cyrillic_source(source_lang) {
        // Keep Cyrillic, Latin/alphanumeric, punctuation; strip CJK, Thai, etc.
        let no_cjk = CJK_CHAR_RE.replace_all(text, "");
        let no_thai = THAI_CHAR_RE.replace_all(&no_cjk, "").to_string();
        normalize_cyrillic_homoglyphs(&no_thai)
    } else if is_thai_source(source_lang) {
        // Keep Thai, Latin/alphanumeric, punctuation; strip CJK, Cyrillic, etc.
        let no_cjk = CJK_CHAR_RE.replace_all(text, "");
        CYRILLIC_CHAR_RE.replace_all(&no_cjk, "").to_string()
    } else if is_cjk_source(source_lang) {
        // Keep CJK, Latin/alphanumeric, punctuation; strip Cyrillic, Thai, etc.
        let no_cyrillic = CYRILLIC_CHAR_RE.replace_all(text, "");
        THAI_CHAR_RE.replace_all(&no_cyrillic, "").to_string()
    } else {
        // Latin / alphanumeric (Indonesian, English, Spanish, French, etc.): strip all non-Latin foreign scripts
        NON_LATIN_SCRIPT_RE.replace_all(text, "").to_string()
    }
}

