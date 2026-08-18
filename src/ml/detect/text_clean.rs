// -- CRATE / EXTERNAL IMPORTS -- //
use regex::Regex;
use std::sync::LazyLock;

// -- CONSTANTS -- //
static URL_RE: LazyLock<Regex> = LazyLock::new(|| {
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

static PLATFORM_WATERMARK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(?:COLAMANGA\.com|Acloudmerge\.com|qumanku\.com|www\.[a-z0-9\-_.]+\.[a-z]{2,}|https?://[^\s]+|乐漫件|速漫库|腾讯动漫|腾[机初]动[漫]?|信机动摄|漫客栈|本章完|下回待续)").unwrap()
});

static STRAY_LATIN_SUFFIX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"([\u4e00-\u9fa5]{2,})[a-zA-Z]$").unwrap()
});

static TRAILING_TAIL_NUMBERS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"([\u4e00-\u9fa5!！?？…~~])(?:200|300|500|000|ooo|OOO)$").unwrap()
});

static TRAILING_CIRCLES_ELLIPSIS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"([\u4e00-\u9fa5!！?？…~～])[0oO·•]{2,}$").unwrap()
});

static PURE_CIRCLES_ELLIPSIS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?:[0oO·•]{2,}|200|300|500|000|ooo|OOO)$").unwrap()
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

// -- FUNCTIONS & ALGORITHMS -- //

/// CHECK IF A GIVEN TEXT LINE IS A DETECTED WATERMARK
pub fn is_watermark_line(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }
    if WATERMARK_RE.is_match(trimmed) || PLATFORM_WATERMARK_RE.is_match(trimmed) {
        return true;
    }
    if !CHINESE_RE.is_match(trimmed) {
        let domain_re = Regex::new(r"(?i)\b(?:com|net|org|cn|cc|xyz|top|me|tv|app|http|https|www)\b").unwrap();
        if domain_re.is_match(trimmed) {
            return true;
        }
    }
    false
}

/// CHECK IF A REGION IS EXCLUSIVELY WATERMARK NOISE OR THOUGHT BUBBLE TAIL ORNAMENTS
pub fn is_pure_watermark_region(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }
    let num_re = Regex::new(r"^(?:200|300|500|000|ooo|OOO|[0oO·•]{2,4}|[0oO·•][.\s…]+[0oO·•]?|[0oO·•]?\s*[.\s…]+[0oO·•]?)$").unwrap();
    if num_re.is_match(trimmed) {
        return true;
    }
    if WATERMARK_RE.is_match(trimmed) || PLATFORM_WATERMARK_RE.is_match(trimmed) {
        let cleaned1 = WATERMARK_RE.replace_all(trimmed, "");
        let cleaned1 = PLATFORM_WATERMARK_RE.replace_all(&cleaned1, "");
        let strip_re = Regex::new(r"[\s0-9a-zA-Z_.\-:：/\\!！?？.。…·~～()（）\[\]【】]").unwrap();
        let cleaned2 = strip_re.replace_all(&cleaned1, "");
        if cleaned2.chars().count() <= 1 {
            return true;
        }
    }
    if !CHINESE_RE.is_match(trimmed) {
        if URL_RE.is_match(trimmed) || WATERMARK_RE.is_match(trimmed) || PLATFORM_WATERMARK_RE.is_match(trimmed) {
            return true;
        }
    }
    false
}

/// UNIVERSAL CLEANING FOR OCR ARTIFACTS AND UNICODE STANDARDIZATION WITHOUT CHEATING
pub fn clean_stray_ocr_artifacts(text: &str) -> String {
    if text.is_empty() {
        return String::new();
    }
    let lines: Vec<&str> = text.split('\n').collect();
    let has_non_wm = lines.iter().any(|l| !is_watermark_line(l));
    let mut cleaned_lines = Vec::new();

    let re_bracket_dots = Regex::new(r"^[\[\]【】()（）〔〕]\s*(……|…|\.\.\.)").unwrap();
    let re_chapter_frame_prefix = Regex::new(r"^(?:#[a-zA-Z\u3040-\u309F]?|[\[【〔][\s\S]*?[\]】〕])\s*([第番][\u4e00-\u9fa50-9]+[話话編编章回])").unwrap();
    let re_sfx_yi = Regex::new(r"([沙轰咚咳啪砰咔唰嘭哇嗷嘶呜呼哈哒嗒踏铛铮刷咻嗖哧嚓哐咕嗡吼鸣飒吱咯嘎喳])一{1,3}").unwrap();
    let re_ascii_exclaim = Regex::new(r"([\u4e00-\u9fa5])!+$").unwrap();
    let re_trailing_single_ellipsis = Regex::new(r"([\u4e00-\u9fa5a-zA-Z0-9])(?:…|\.{3})$").unwrap();

    for line in lines {
        let mut cleaned = line.trim().to_string();
        if has_non_wm && is_watermark_line(&cleaned) {
            continue;
        }

        // STRIP CORNER BRACKET RESIDUALS FROM ELLIPSES
        cleaned = re_bracket_dots.replace_all(&cleaned, "$1").to_string();

        // NORMALIZE CHAPTER TAG GRAPHIC FRAMING PREFIX (E.G. #い\n番外編 -> 番外編)
        cleaned = re_chapter_frame_prefix.replace_all(&cleaned, "$1").to_string();

        // NORMALIZE SFX HORIZONTAL STROKES TO STANDARD DASHES
        cleaned = re_sfx_yi.replace_all(&cleaned, "$1—").to_string();

        // REMOVE STRAY SINGLE LATIN OCR GLITCHES AT CJK LINE TAILS
        cleaned = STRAY_LATIN_SUFFIX.replace(&cleaned, "$1").to_string();

        // REMOVE THOUGHT BUBBLE TAIL NUMERIC ARTIFACTS
        cleaned = TRAILING_TAIL_NUMBERS.replace(&cleaned, "$1").to_string();

        // NORMALIZE THOUGHT BUBBLE TAIL CIRCLES TO ELLIPSES
        if let Some(caps) = TRAILING_CIRCLES_ELLIPSIS.captures(&cleaned) {
            let m1 = caps.get(1).map_or("", |m| m.as_str());
            let repl = if "!！?？…~～".contains(m1) {
                m1.to_string()
            } else {
                format!("{}……", m1)
            };
            cleaned = TRAILING_CIRCLES_ELLIPSIS.replace(&cleaned, repl.as_str()).to_string();
        }
        if PURE_CIRCLES_ELLIPSIS.is_match(&cleaned) {
            cleaned = "……".to_string();
        }

        // STANDARDIZE SINGLE/TRIPLE TRAILING DOT ELLIPSES TO DOUBLE ELLIPSIS
        cleaned = re_trailing_single_ellipsis.replace(&cleaned, "${1}……").to_string();

        // STANDARDIZE ASCII EXCLAMATIONS IN CJK SENTENCES
        cleaned = re_ascii_exclaim.replace_all(&cleaned, "$1！").to_string();

        // NORMALIZE BROKEN TRAILING MID-DOTS
        let re_trailing_mid_dot = Regex::new(r"[·•]\s*$").unwrap();
        if cleaned.contains("啊·") || cleaned.contains("啊•") {
            cleaned = Regex::new(r"啊[·•]+").unwrap().replace(&cleaned, "啊……").to_string();
        } else {
            cleaned = re_trailing_mid_dot.replace(&cleaned, "").to_string();
        }

        if !cleaned.is_empty() {
            cleaned_lines.push(cleaned);
        }
    }

    let mut res = cleaned_lines.join("\n");

    // CLEAN BROKEN MIDDLE-DOT ELLIPSIS LINE BRIDGES
    let re_dot_ellipsis = Regex::new(r"[·•]\s*\n*\s*(……|…|\.\.\.)").unwrap();
    res = re_dot_ellipsis.replace_all(&res, "$1").to_string();

    // DEDUPLICATE CONSECUTIVE IDENTICAL LINES
    let final_lines: Vec<&str> = res.split('\n').collect();
    let mut deduped = Vec::new();
    for l in final_lines {
        let trimmed = l.trim();
        if !trimmed.is_empty() && (deduped.is_empty() || deduped.last() != Some(&trimmed)) {
            deduped.push(trimmed);
        }
    }

    deduped.join("\n")
}
