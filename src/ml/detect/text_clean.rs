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
        r"(?i)(\.com|\.net|\.org|\.cn|\.cc|\.xyz|\.top|\.me|\.tv|\.app|http|discord|scanlat|bilibili|速漫库|速漫|漫库|qumanku|quman|包子|baozimh|baozi|colamanga|colamanhua|colam|acloudmerge|acloud|loudmer|udmer|merd|oamanhua|merge|cloud|manga|manhua|comic|yumanhua|mangabox|comick|集云数据|集云|儿云数据|米古|咪咕|migu|米古动漫|腾讯[动漫慢机动初]*|腾[动漫慢机动初]{1,2}|阅文[集团]*|快[看刮](?:[漫慢]画|动漫|app|独家|首发)|微信|公众号|qq群|企鹅群|群号|严禁转载|独家(?:首发|连载|授权|发布|提供)|扫图|录入|修图|嵌字|翻译[:：]|翻译组|汉化组|免费漫画|最新免费|漫画网|看漫画网|首发|独家首发|漫客[栈拌祥]?|漫[客喜][栈拌祥]?|mkzhan|nga\.com|^[祥拌]$|澳[祥拌]?)"
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
    Regex::new(r"^(?:[0oO·•●○\s]{1,6}|[\s一1丨Il|二ニ]{1,2}|(?:しし|いい|ここ|くく|し|い|っ|ッ)|[1IlL|!/\\~][しいっッ]|[しいっッ][1IlL|!/\\~]|[※＊†‡米])$").unwrap()
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
    // Cyrillic noise (e.g. "З..", "3..", "3...")
    if (t.starts_with('З') || t.starts_with('3'))
        && t.chars().skip(1).all(|c| c == '.' || c == '!' || c == '?' || c == '…' || c == '。' || c == ' ')
    {
        return true;
    }
    // Check thought bubble tail digit noise (e.g. "500", "300", "200", "000", "ooo", "00")
    if t.chars().all(|c| c == '0' || c == 'o' || c == 'O' || c == '2' || c == '3' || c == '5' || c == '8' || c == '9') && t.chars().count() <= 4 {
        return true;
    }
    // Thought bubble tail ornament strings or silence ellipsis bubbles (e.g. "……", "...", "…", "。。", "○", "●", "(…………)", "(………)\n6")
    let is_tail_ornament_only = t.chars().all(|c| {
        c == '…'
            || c == '.'
            || c == '·'
            || c == '。'
            || c == '●'
            || c == '○'
            || c == '•'
            || c == '‥'
            || c == '．'
            || c.is_whitespace()
            || c == '('
            || c == ')'
            || c == '（'
            || c == '）'
    });
    if is_tail_ornament_only {
        return true;
    }

    // Silence ellipsis with OCR tail noise (e.g. "(………)\n6", "……6", "…9", "…...UIn")
    let dot_count = t.chars().filter(|&c| c == '…' || c == '.' || c == '·' || c == '。' || c == '‥' || c == '．').count();
    let is_digit_or_noise_residue = t.chars().all(|c| {
        c == '…'
            || c == '.'
            || c == '·'
            || c == '。'
            || c == '‥'
            || c == '．'
            || c.is_whitespace()
            || c == '('
            || c == ')'
            || c == '（'
            || c == '）'
            || c.is_ascii_digit()
            || c == '|'
            || c == 'l'
            || c == 'I'
            || c == '1'
            || c == 'o'
            || c == 'O'
            || c == '0'
            || c == 'U'
            || c == 'u'
            || c == 'n'
            || c == 'N'
            || c == 'i'
            || c == '!'
            || c == '/'
            || c == '\\'
            || c == '~'
            || c == '-'
            || c == '_'
    });
    if dot_count >= 2 && is_digit_or_noise_residue {
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
    // Single-character action onomatopoeia or shouts (e.g. "哒", "嗒", "接", "啪", "轰", "噗", "砰", "咚", "嘶", "嗖", "刷", "咔", "呼", "嗤", "铛", "啐", "哈", "啧", "哼", "呃", "呀", "切", "嘟", "滋", "嗡", "哔", "滴", "嘭", "哐", "唰", "吼", "碌", "骨", "咕", "簌", "沙", "哗")
    let is_action_sfx_char = matches!(
        t.chars().next(),
        Some(
            '哒' | '嗒' | '接' | '啪' | '轰' | '噗' | '砰' | '咚' | '嘶' | '嗖' | '刷' | '咔'
                | '呼' | '嗤' | '铛' | '啐' | '哈' | '啧' | '哼' | '呃' | '呀' | '切'
                | '嘟' | '滋' | '嗡' | '哔' | '滴' | '嘭' | '哐' | '唰' | '吼'
                | '碌' | '骨' | '咕' | '簌' | '沙' | '哗'
        )
    ) && t.chars().count() <= 3
        && (t.contains('！') || t.contains('!') || t.chars().count() <= 2);

    // Dialogue interjections with exclamation mark (e.g. "啊！", "哇！") are shouts/SFX, but plain "啊" or "哇" are dialogue speech
    let is_exclamation_shout = (t.starts_with('啊') || t.starts_with('哇'))
        && (t.contains('！') || t.contains('!'))
        && t.chars().count() <= 3;

    // Korean action onomatopoeia & shouts (e.g. "촤", "콰", "쿵", "쾅", "띠", "띵", "찌", "쨍", "틱", "톡", "뚝", "팍", "탁", "철", "꾸", "꾹", "끼", "꽉", "콱", "털", "덜", "두", "벌", "웅", "후", "흡", "호")
    let is_korean_sfx_char = matches!(
        t.chars().next(),
        Some(
            '촤' | '콰' | '쾅' | '쿵' | '띠' | '띵' | '찌' | '쨍' | '틱' | '톡' | '뚝' | '팍' | '탁' | '철' | '척' | '홱' | '휙' | '쑥' | '쏙' | '또'
                | '꾸' | '꾹' | '끼' | '꽉' | '콱' | '털' | '덜' | '두' | '벌' | '웅' | '후' | '흡' | '호'
        )
    ) && t.chars().count() <= 3
        && (t.contains('!') || t.contains('~') || t.contains('-') || t.chars().count() <= 2);

    // Repeated onomatopoeia patterns (e.g. "嘟嘟", "嘟嘟嘟", "轰隆隆", "咚咚", "哗啦啦", "嗒嗒", "두근두근", "哗啦哗啦", "웅\n웅\nㅇ", "웅\n웅")
    let chars: Vec<char> = t
        .chars()
        .filter(|c| !c.is_whitespace() && !c.is_ascii_punctuation() && *c != '！' && *c != '？' && *c != '\'' && *c != '"' && *c != '’' && *c != '‘')
        .collect();
    let is_repeated_sound = if chars.len() >= 2 && chars.len() <= 6 {
        let first = chars[0];
        if first.is_ascii_alphanumeric() || first == 'し' || first == 'い' || first == '一' || first == '丨' {
            false
        } else if chars.iter().all(|&c| c == first) {
            true
        } else if chars.len() >= 3 && chars[..chars.len() - 1].iter().all(|&c| c == first) && (chars.last() == Some(&'ㅇ') || chars.last() == Some(&'…') || chars.last() == Some(&'~')) {
            // Repeated Korean/CJK SFX with trailing jamo or symbol (e.g. '웅\n웅\nㅇ')
            true
        } else if chars.len() == 3 && chars[1] == chars[2] && chars.iter().all(|c| crate::ml::detect::has_cjk_characters(&c.to_string())) {
            true
        } else if chars.len() == 4 && chars[0] == chars[1] && chars[2] == chars[3] && chars.iter().all(|c| crate::ml::detect::has_cjk_characters(&c.to_string())) {
            true
        } else if chars.len() == 4 && chars[0] == chars[2] && chars[1] == chars[3] && chars[0] != chars[1] && chars.iter().all(|c| crate::ml::detect::has_cjk_characters(&c.to_string())) {
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

    is_action_sfx_char || is_exclamation_shout || is_korean_sfx_char || is_repeated_sound || is_latin_shout || is_cyrillic_sfx
}

/// UNIVERSAL CLEANING FOR OCR ARTIFACTS AND UNICODE STANDARDIZATION
pub fn clean_stray_ocr_artifacts(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let mut kept = Vec::new();
    for line in lines {
        let t = line.trim();
        // DROP TRAILING OR STANDALONE THOUGHT BUBBLE TAIL DIGIT NOISE (E.G. "000000", "00O0", "OOO", "000", "200000")
        let is_tail_noise = !t.is_empty()
            && t.chars().all(|c| c == '0' || c == 'o' || c == 'O' || c == '2' || c == '3' || c == '5' || c == '8' || c == '9')
            && t.chars().count() <= 8;
        if !is_tail_noise {
            // STRIP INLINE TRAILING THOUGHT BUBBLE TAIL DIGITS (E.G. "...…200000", "……0000", "…000")
            let mut line_str = line.to_string();
            let trimmed = line_str.trim_end();
            if let Some((idx, ch)) = trimmed.char_indices().rfind(|&(_, c)| !c.is_ascii_digit() && c != 'o' && c != 'O') {
                let tail_start = idx + ch.len_utf8();
                let tail = &trimmed[tail_start..];
                if tail.len() >= 3 && tail.len() <= 8 && tail.chars().all(|c| c == '0' || c == 'o' || c == 'O' || c == '2' || c == '3' || c == '5' || c == '8' || c == '9') {
                    if ch == '.' || ch == '…' || ch == '·' || ch == '。' || ch == ' ' {
                        line_str = trimmed[..tail_start].trim_end().to_string();
                    }
                }
            }
            kept.push(line_str);
        }
    }
    if kept.is_empty() {
        String::new()
    } else {
        let joined = kept.join("\n");
        let t = joined.trim();
        let mut cleaned = t.to_string();
        if cleaned.ends_with('/') || cleaned.ends_with('\\') {
            cleaned.pop();
        }
        cleaned.trim().to_string()
    }
}

/// CHECK IF A GIVEN TEXT STRING CONSISTS SOLELY OF PUNCTUATION MARKS, BRACKETS, OR SYMBOLS WITH ZERO ALPHANUMERIC CHARACTERS
pub fn is_pure_punctuation_only(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return true;
    }
    !t.chars().any(|c| c.is_alphanumeric())
}

/// DETECTS DECORATIVE-SCRIPT OCR GARBAGE: NATIVE CHARACTERS INTERLEAVED WITH 3+ SEPARATE
/// ASCII ALPHANUMERIC FRAGMENTS (E.G. "中1ェc70に4Φ17814" READ FROM IN-WORLD FANTASY LETTERING).
/// REAL TEXT NEVER INTERLEAVES THREE OR MORE SEPARATE ASCII RUNS INSIDE NATIVE SCRIPT —
/// LEGIT NUMBERS APPEAR AS CONTIGUOUS RUNS ("第721话", "1対1での", "365일").
pub fn is_mixed_script_debris(text: &str, source_lang: Option<&str>) -> bool {
    if !crate::ml::detect::is_non_latin_source(source_lang) {
        return false;
    }
    let chars: Vec<char> = text.chars().filter(|c| !c.is_whitespace()).collect();
    if chars.len() < 7 {
        return false;
    }
    let mut non_native_runs = 0usize;
    let mut in_non_native = false;
    let mut has_greek_symbol = false;
    for c in &chars {
        let is_sym = matches!(*c, 'Φ' | 'Ψ' | 'Ω' | 'α' | 'β' | 'γ' | 'δ' | 'ε' | 'θ' | 'λ' | 'π' | 'σ' | 'φ' | 'ω');
        if is_sym {
            has_greek_symbol = true;
        }
        let is_non_nat = c.is_ascii_alphanumeric() || is_sym || matches!(*c, 'ェ' | 'ィ' | 'ゥ' | 'ォ' | 'ャ' | 'ュ' | 'ョ');
        if is_non_nat {
            if !in_non_native {
                non_native_runs += 1;
            }
            in_non_native = true;
        } else {
            in_non_native = false;
        }
    }
    let native = chars
        .iter()
        .filter(|c| crate::ml::detect::has_native_script_for_lang(&c.to_string(), source_lang))
        .count();
    if has_greek_symbol && non_native_runs >= 2 {
        return true;
    }
    if native == 0 {
        return false;
    }
    non_native_runs >= 3 && non_native_runs >= native
}

pub static TIMESTAMP_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^(?:(?:오전|오후)\s*\d{1,2}:\d{2}|\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?|(?:AM|PM|am|pm)\s*\d{1,2}:\d{2}|(?:\d{4}|20XX)[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}[일\s]*(?:[월화수목금토일]요일)?.*)$").unwrap()
});

/// CHECK IF A GIVEN TEXT STRING REPRESENTS A STANDALONE TIMESTAMP OR DATE CAPSULE IN CHAT / UI INTERFACES
pub fn is_timestamp_or_date_line(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return false;
    }
    TIMESTAMP_RE.is_match(t)
}

/// CHECK IF A GIVEN TEXT STRING OR BOUNDING REGION REPRESENTS A WATERMARK OR SCANLATOR LOGO
pub fn is_likely_watermark(rect: &crate::ml::schemas::BoxRect, text: &str, img_w: u32, img_h: u32) -> bool {
    if is_watermark_line(text) || is_pure_watermark_region(text) {
        return true;
    }

    // Border suppression: tiny text strips sitting in the outer 3% margins
    let margin_x = (img_w as f32 * 0.03) as i32;
    let margin_y = (img_h as f32 * 0.03) as i32;

    let is_at_extreme_edge = rect.x < margin_x
        || (rect.x + rect.w) > (img_w as i32 - margin_x)
        || rect.y < margin_y
        || (rect.y + rect.h) > (img_h as i32 - margin_y);

    if is_at_extreme_edge && (rect.w < 80 || rect.h < 25) {
        return true;
    }

    // Large platform logo stamp suppression: wide box sitting at the bottom 15% of the page.
    let bottom_15pct = (img_h as f32 * 0.85) as i32;
    let wide_threshold = (img_w as f32 * 0.35) as i32;
    if rect.y >= bottom_15pct && rect.w >= wide_threshold {
        return true;
    }

    false
}

/// CLEAN STANDALONE UI NAVIGATION CHEVRONS (E.G. LEADING '<' IN BACK BUTTONS LIKE '<현성민')
pub fn clean_ui_header_text(text: &str) -> String {
    let t = text.trim();
    if (t.starts_with('<') || t.starts_with('〈') || t.starts_with('‹') || t.starts_with('＜'))
        && !t.ends_with('>') && !t.ends_with('〉') && !t.ends_with('›') && !t.ends_with('＞')
        && !t.contains('>') && !t.contains('〉') && !t.contains('›') && !t.contains('＞')
    {
        let stripped = t.trim_start_matches(|c| c == '<' || c == '〈' || c == '‹' || c == '＜').trim();
        if !stripped.is_empty() {
            return stripped.to_string();
        }
    }
    text.to_string()
}



