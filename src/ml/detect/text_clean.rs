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
    Regex::new(r"^(?:[0oO·•●○\s]{1,6}|[\s一1丨Il|二ニ]{1,2}|(?:しし|いい|ここ|くく|し|い)|[1IlL|!/\\~][しい]|し[1IlL|!/\\~])$").unwrap()
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
        return true;
    }
    if is_watermark_line(t) {
        return true;
    }
    // Cyrillic / Latin exclamation noise (e.g. "З..", "3..", "!", "...", "?")
    if (t.starts_with('З') || t.starts_with('3') || t.starts_with('!') || t.starts_with('?'))
        && t.chars().skip(1).all(|c| c == '.' || c == '!' || c == '?' || c == '…' || c == '。' || c == ' ')
    {
        return true;
    }
    // Check thought bubble tail digit noise (e.g. "500", "300", "200", "000", "ooo", "00")
    if t.chars().all(|c| c == '0' || c == 'o' || c == 'O' || c == '2' || c == '3' || c == '5' || c == '8' || c == '9') && t.chars().count() <= 4 {
        return true;
    }
    // Thought bubble tail ornament strings (e.g. "……", "...", "…", "。。", "○", "●", "(…………)")
    let is_symbols_only = t.chars().all(|c| {
        c.is_ascii_punctuation()
            || c.is_whitespace()
            || matches!(
                c,
                '…' | '·' | '—' | '～' | '！' | '？' | '。' | '，' | '、' | '；' | '：'
                    | '“' | '”' | '‘' | '’' | '（' | '）' | '【' | '】' | '《' | '》' | '〔' | '〕'
                    | '『' | '』' | '「' | '」' | '・' | '．' | '‥' | '–' | '●' | '○' | '•'
            )
    });
    if is_symbols_only {
        return true;
    }
    false
}

/// CHECK IF A GIVEN SHORT TEXT STRING REPRESENTS AN ONOMATOPOEIA OR ACTION SHOUT
pub fn is_onomatopoeia_or_shout(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return false;
    }
    // Single-character action onomatopoeia or shouts (e.g. "哒", "接", "啪", "轰", "噗", "砰", "咚", "嘶", "嗖", "刷", "咔", "呼", "嗤", "铛", "啐", "哈", "啧", "哼", "呃", "呀", "哇", "切", "嘟", "滋", "嗡", "哔", "滴", "嘭", "哐", "唰", "吼")
    let is_action_sfx_char = matches!(
        t.chars().next(),
        Some(
            '哒' | '嗒' | '接' | '啪' | '轰' | '噗' | '砰' | '咚' | '嘶' | '嗖' | '刷' | '咔'
                | '呼' | '嗤' | '铛' | '啐' | '哈' | '啧' | '哼' | '呃' | '呀' | '哇' | '切' | '啊'
                | '嘟' | '滋' | '嗡' | '哔' | '滴' | '嘭' | '哐' | '唰' | '吼'
        )
    ) && t.chars().count() <= 3
        && (t.contains('！') || t.contains('!') || t.chars().count() <= 2);

    // Repeated onomatopoeia patterns (e.g. "嘟嘟", "嘟嘟嘟", "轰隆隆", "咚咚", "哗啦啦", "嗒嗒")
    let chars: Vec<char> = t.chars().filter(|c| !c.is_whitespace() && !c.is_ascii_punctuation() && *c != '！' && *c != '？').collect();
    let is_repeated_sound = if chars.len() >= 2 && chars.len() <= 4 {
        let first = chars[0];
        if first.is_ascii_alphanumeric() || first == 'し' || first == 'い' || first == '一' || first == '丨' {
            false
        } else if chars.iter().all(|&c| c == first) {
            true
        } else if chars.len() == 3 && chars[1] == chars[2] && chars.iter().all(|c| crate::ml::detect::has_cjk_characters(&c.to_string())) {
            true
        } else if chars.len() == 4 && chars[0] == chars[1] && chars[2] == chars[3] && chars.iter().all(|c| crate::ml::detect::has_cjk_characters(&c.to_string())) {
            true
        } else {
            false
        }
    } else {
        false
    };

    // Latin shout or prolonged sound effect patterns (e.g. "HOOO", "HO0O", "WAAAA", "WAAA!", "KYAAA", "AAAAA", "OOH")
    let is_latin_shout = if !crate::ml::detect::has_cjk_characters(t) {
        let upper: String = t.to_uppercase().chars().map(|c| if c == '0' { 'O' } else if c == '1' { 'I' } else { c }).collect();
        let letters: Vec<char> = upper.chars().filter(|c| c.is_ascii_alphabetic()).collect();
        let has_ascii_alpha = t.chars().any(|c| c.is_ascii_alphabetic());
        if has_ascii_alpha && letters.len() >= 3 && letters.len() <= 8 {
            let unique_count = letters.iter().copied().collect::<std::collections::HashSet<_>>().len();
            // Single repeated letter (e.g. "AAAA") or 2-letter vowel prolongations (e.g. "HOOO", "WAHH", "KYAAA")
            unique_count <= 2 || (letters.starts_with(&['H', 'O']) && letters.iter().skip(1).all(|&c| c == 'O'))
        } else {
            false
        }
    } else {
        false
    };

    // Cyrillic onomatopoeia & action SFX patterns (e.g. "трог", "вздрог", "вздох", "стук", "шмяк", "хлоп", "чмок", "скрип", "треск", "тя-янь", "ах", "ох", "ух", "эй")
    let is_cyrillic_sfx = if !crate::ml::detect::has_cjk_characters(t) {
        let lower = t.to_lowercase();
        let stripped: String = lower.chars().filter(|c| !c.is_whitespace() && !c.is_ascii_punctuation() && *c != '—' && *c != '–' && *c != '…' && *c != '.').collect();
        matches!(
            stripped.as_str(),
            "трог" | "вздрог" | "вздох" | "стук" | "шмяк" | "хлоп" | "чмок" | "скрип" | "треск"
                | "тяянь" | "тянь" | "ах" | "ох" | "ух" | "эй" | "хах" | "кх" | "псс" | "дзынь" | "бам" | "бум" | "бах"
        ) || (lower.starts_with("тя-") && lower.contains("янь"))
    } else {
        false
    };

    is_action_sfx_char || is_repeated_sound || is_latin_shout || is_cyrillic_sfx
}

/// UNIVERSAL CLEANING FOR OCR ARTIFACTS AND UNICODE STANDARDIZATION
pub fn clean_stray_ocr_artifacts(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    if lines.len() <= 1 {
        return text.to_string();
    }
    let mut kept = Vec::new();
    for line in lines {
        let t = line.trim();
        // Drop trailing or standalone thought bubble tail digit noise (e.g. "000000", "00o0", "ooo", "000")
        let is_tail_noise = !t.is_empty()
            && t.chars().all(|c| c == '0' || c == 'o' || c == 'O' || c == '2' || c == '3' || c == '5' || c == '8' || c == '9')
            && t.chars().count() <= 8;
        if !is_tail_noise {
            kept.push(line);
        }
    }
    if kept.is_empty() {
        text.to_string()
    } else {
        kept.join("\n")
    }
}


