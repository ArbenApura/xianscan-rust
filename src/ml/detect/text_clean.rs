// -- CRATE / EXTERNAL IMPORTS -- //
use regex::Regex;
use std::sync::LazyLock;

// -- CONSTANTS -- //
#[allow(dead_code)]
pub static URL_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(\.com|\.net|\.org|\.cn|\.cc|\.xyz|\.top|http)").unwrap()
});

pub static CHINESE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[\u4e00-\u9fa5\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u3000-\u303f\uff00-\uffef\u2026]").unwrap()
});

pub static WATERMARK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)(\.com|\.net|\.org|\.cn|\.cc|\.xyz|\.top|\.me|\.tv|\.app|http|discord|scanlat|bilibili|速漫库|速漫|漫库|qumanku|quman|包子|baozimh|baozi|colamanga|colamanhua|colam|acloudmerge|acloud|loudmer|udmer|merd|oamanhua|merge|cloud|manga|manhua|comic|yumanhua|mangabox|comick|腾讯[动漫慢机动初]*|腾[动漫慢机动初]{1,2}|阅文[集团]*|快看(?:漫画|动漫|app|独家|首发)|微信|公众号|qq群|企鹅群|群号|严禁转载|独家(?:首发|连载|授权|发布|提供)|扫图|录入|修图|嵌字|翻译[:：]|翻译组|汉化组|免费漫画|最新免费|漫画网|看漫画网|首发|独家首发|漫客[栈拌祥]?|漫[客喜][栈拌祥]?|mkzhan|nga\.com|^[祥拌]$)"
    ).unwrap()
});

pub static PUNCT_ONLY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[.．…·!！?？~～]{1,2}$").unwrap()
});

pub static ALL_ELLIPSIS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[.．…·]{2,}$").unwrap()
});

pub static ELLIPSIS_TAIL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[.．…·]{2,}$").unwrap()
});

pub static PUNCT_TAIL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[.．…·!！?？~～]{1,}$").unwrap()
});

pub static EXCLAIM_TAIL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[!！]$").unwrap()
});

pub static QUESTION_TAIL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[?？]$").unwrap()
});

pub static NOISE_STROKES_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?:[0oO·•\s]{1,6}|[\s一1丨Il|]{1,2})$").unwrap()
});

/// CHECK IF A GIVEN TEXT STRING IS ISOLATED NOISE OR SINGLE REPEATED STROKES
pub fn is_standalone_noise_stroke(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return true;
    }
    NOISE_STROKES_RE.is_match(t)
}

/// CHECK IF A GIVEN TEXT LINE IS A DETECTED WATERMARK
pub fn is_watermark_line(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return false;
    }
    WATERMARK_RE.is_match(t)
}

/// CHECK IF A REGION IS EXCLUSIVELY WATERMARK NOISE, THOUGHT BUBBLE TAIL ORNAMENTS, OR SYMBOL/PUNCTUATION ONLY
pub fn is_pure_watermark_region(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return false;
    }
    if is_watermark_line(t) || is_standalone_noise_stroke(t) {
        return true;
    }
    // Check thought bubble tail digit noise (e.g. "300", "200", "000", "ooo")
    if t.chars().all(|c| c == '0' || c == 'o' || c == 'O' || c == '2' || c == '3' || c == '9') && t.chars().count() <= 4 {
        return true;
    }
    // Filter symbol/punctuation/bracket/ellipsis-only regions (e.g. "......", "...", "……", "(…………)", "?!", "!!!", "!?", "~~", "——")
    let is_symbols_only = t.chars().all(|c| {
        c.is_ascii_punctuation()
            || c.is_whitespace()
            || matches!(
                c,
                '…' | '·' | '—' | '～' | '！' | '？' | '。' | '，' | '、' | '；' | '：'
                    | '“' | '”' | '‘' | '’' | '（' | '）' | '【' | '】' | '《' | '》' | '〔' | '〕'
                    | '『' | '』' | '「' | '」' | '・' | '．' | '‥' | '–'
            )
    });
    if is_symbols_only {
        return true;
    }
    false
}

/// UNIVERSAL CLEANING FOR OCR ARTIFACTS AND UNICODE STANDARDIZATION (SUPPRESSED FOR RAW PIPELINE)
pub fn clean_stray_ocr_artifacts(text: &str) -> String {
    text.to_string()
}

