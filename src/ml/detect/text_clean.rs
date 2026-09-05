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
        r"(?i)(\.com|\.net|\.org|\.cn|\.cc|\.xyz|\.top|\.me|\.tv|\.app|http|discord|scanlat|bilibili|速漫库|速漫|漫库|qumanku|quman|包子|baozimh|baozi|colamanga|colamanhua|colam|acloudmerge|acloud|loudmer|udmer|merd|oamanhua|merge|cloud|manga|manhua|comic|yumanhua|mangabox|comick|集云数据|集云|儿云数据|米古|咪咕|migu|米古动漫|腾讯[动漫慢机动初]*|腾[动漫慢机动初]{1,2}|阅文[集团]*|快[看刮](?:[漫慢]画|动漫|app|独家|首发)|微信|公众号|qq群|企鹅群|群号|严禁转载|独家(?:首发|连载|授权|发布|提供)|扫图|录入|修图|嵌字|翻译[:：]|翻译组|汉化组|免费漫画|最新免费|漫画网|看漫画网|首发|独家首发|漫客[栈拌祥]?|漫[客喜][栈拌祥]?|mkzhan|nga\.com|^[祥拌]$|澳[祥拌]?|最快最稳|广告最少|观看，最快)"
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
            // Guard: Meaningful conversational action verbs/imperatives (e.g. "快走快走", "等等等等", "救命救命", "看看看看", "想想想想", "快点快点", "走吧走吧", "来吧来吧", "快跑快跑") are dialogue phrases, not sound effects
            let s: String = chars.iter().collect();
            if s.contains("快走") || s.contains("快跑") || s.contains("快点") || s.contains("救命") || s.contains("等等") || s.contains("看看") || s.contains("想想") || s.contains("走吧") || s.contains("来吧") {
                false
            } else {
                true
            }
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

/// CHECK IF A GIVEN TEXT BLOCK REPRESENTS A REPETITIVE UI TABLE, CHAPTER LIST, OR DATA GRID PROP
pub fn is_repetitive_tabular_text(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return false;
    }
    let lines: Vec<&str> = t.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    if lines.is_empty() {
        return false;
    }

    // 1. ALL LINES IDENTICAL (E.G. "댓글:1\n댓글:1" OR "조회수:1\n조회수:1\n조회수:1")
    if lines.len() >= 2 && lines.iter().all(|&l| l == lines[0]) {
        return true;
    }

    // 2. HIGH PROPORTION OF DUPLICATE LINES IN MULTI-LINE BLOCK (>= 3 LINES)
    if lines.len() >= 3 {
        let mut counts = std::collections::HashMap::new();
        for &l in &lines {
            *counts.entry(l).or_insert(0usize) += 1;
        }
        let max_dup = counts.values().copied().max().unwrap_or(0);
        if max_dup >= 3 && max_dup * 10 >= lines.len() * 6 {
            return true;
        }
        let total_dups: usize = counts.values().filter(|&&c| c >= 2).sum();
        if total_dups >= 4 && total_dups * 10 >= lines.len() * 7 {
            return true;
        }
    }

    // 3. REPEATED KEY-VALUE / COUNTER DELIMITER PATTERNS (E.G. LINES WITH ": <DIGITS>", ":1", "댓글:1", "조회수:1")
    if lines.len() >= 3 {
        let delimiter_lines = lines.iter().filter(|l| {
            let s = l.trim();
            if let Some((idx, ch)) = s.char_indices().rev().find(|&(_, c)| c == ':' || c == '：') {
                let rest = s[idx + ch.len_utf8()..].trim();
                !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit() || c.is_whitespace() || c == 'T' || c == 't' || c == 'l' || c == 'I')
            } else if let Some((idx, ch)) = s.char_indices().rev().find(|&(_, c)| c == '|' || c == '│') {
                let rest = s[idx + ch.len_utf8()..].trim();
                !rest.is_empty() && rest.chars().any(|c| c.is_ascii_digit())
            } else {
                false
            }
        }).count();

        if delimiter_lines >= 3 && delimiter_lines * 10 >= lines.len() * 7 {
            return true;
        }
    }

    // 4. REPEATED MULTI-CHARACTER SUBSTRING ACROSS >= 60% OF LINES IN A TALL LIST (>= 5 LINES)
    if lines.len() >= 5 {
        let mut ngram_counts = std::collections::HashMap::new();
        for line in &lines {
            let chars: Vec<char> = line.chars().filter(|c| !c.is_whitespace()).collect();
            if chars.len() >= 2 {
                let mut seen_in_line = std::collections::HashSet::new();
                for w in chars.windows(2) {
                    let s: String = w.iter().collect();
                    if !s.chars().all(|c| c.is_ascii_punctuation()) && seen_in_line.insert(s.clone()) {
                        *ngram_counts.entry(s).or_insert(0usize) += 1;
                    }
                }
                if chars.len() >= 3 {
                    for w in chars.windows(3) {
                        let s: String = w.iter().collect();
                        if !s.chars().all(|c| c.is_ascii_punctuation()) && seen_in_line.insert(s.clone()) {
                            *ngram_counts.entry(s).or_insert(0usize) += 1;
                        }
                    }
                }
            }
        }
        for (_ngram, count) in ngram_counts {
            if count >= 4 && count * 10 >= lines.len() * 6 {
                return true;
            }
        }
    }

    false
}

/// CHECK IF A SHORT LINE IS A STANDALONE TABLE CELL COUNTER / METRIC DEBRIS
pub fn is_standalone_table_cell(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return true;
    }
    if t.chars().count() <= 10 {
        // 1. Colon + counter (e.g. "댓글:1", "조회수:1", "것글:1", ":1", ":T")
        if let Some((idx, ch)) = t.char_indices().rev().find(|&(_, c)| c == ':' || c == '：') {
            let rest = t[idx + ch.len_utf8()..].trim();
            if !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit() || c == 'T' || c == 't' || c == 'l' || c == 'I' || c == '1' || c == '조' || c == '회') {
                return true;
            }
        }
        // 2. Standalone chapter / view / metric index (e.g. "열람3125화", "연라3113하", "열람11작쪽", "조회수1", "조외수T", "조외수1", "Ch.12", "Vol.3")
        let is_metric_cell = (t.starts_with("열람") || t.starts_with("연라") || t.starts_with("조회") || t.starts_with("조외") || t.starts_with("댓글") || t.starts_with("것글") || t.starts_with("Ch.") || t.starts_with("Vol."))
            && t.chars().any(|c| c.is_ascii_digit() || c == 'T' || c == 't' || c == '1' || c == 'I' || c == 'l');
        if is_metric_cell {
            return true;
        }
    }
    false
}

/// STRIP TRAILING NON-NATIVE SCANLATOR / SITE WATERMARK FRAGMENTS ATTACHED TO NATIVE LINES
pub fn strip_trailing_watermark_debris(line_text: &str, source_lang: Option<&str>) -> (String, f32) {
    let t = line_text.trim();
    if t.is_empty() || !crate::ml::detect::is_non_latin_source(source_lang) {
        return (line_text.to_string(), 1.0);
    }
    let native_count = t.chars().filter(|c| crate::ml::detect::has_native_script_for_lang(&c.to_string(), source_lang)).count();
    if native_count == 0 {
        return (line_text.to_string(), 1.0);
    }

    let chars: Vec<char> = t.chars().collect();
    let total_chars = chars.len();
    if t.contains('\n') {
        let lines: Vec<&str> = t.lines().collect();
        if lines.len() == 2 && crate::ml::detect::has_native_script_for_lang(lines[0], source_lang) && !crate::ml::detect::has_native_script_for_lang(lines[1], source_lang) {
            let clean_prefix = lines[0].trim().to_string();
            let keep_ratio = clean_prefix.chars().count() as f32 / total_chars as f32;
            return (clean_prefix, keep_ratio);
        }
    }
    if let Some(idx) = chars.iter().rposition(|&c| crate::ml::detect::has_native_script_for_lang(&c.to_string(), source_lang) || matches!(c, '。' | '！' | '？' | '，' | '、' | '…' | '”' | '’' | '」' | '』' | '）' | ')')) {
        let suffix: String = chars[idx + 1..].iter().collect();
        let suffix_trimmed = suffix.trim_start_matches(|c| matches!(c, '·' | '.' | '_' | '-' | '|' | ' ' | '/' | '\\' | ':')).trim();
        let is_latin_debris = !suffix_trimmed.is_empty()
            && suffix_trimmed.chars().all(|c| c.is_ascii_alphanumeric() || c.is_ascii_punctuation())
            && suffix_trimmed.chars().count() >= 2;
        if is_latin_debris {
            let clean_prefix: String = chars[..=idx].iter().collect();
            let keep_ratio = (idx + 1) as f32 / total_chars as f32;
            return (clean_prefix, keep_ratio);
        }
    }
    (line_text.to_string(), 1.0)
}

/// CHECK IF A TEXT STRING CONTAINS PUBLICATION CREDIT / METADATA MARKERS
pub fn is_credits_or_metadata_text(t: &str) -> bool {
    let credit_markers = [
        "出品", "责编", "原著", "原作", "改编", "主笔", "助理", "监制", "作画", "画师",
        "编辑", "汉化", "翻译", "嵌字", "修图", "图源", "扫图", "校对",
        "출판", "글/그림", "글 :", "그림 :", "글:", "그림:",
        "Original Story", "Art by", "Author", "Artist", "Editor", "Letterer",
    ];
    let has_role_colon = t.lines().any(|l| {
        let lt = l.trim();
        (lt.starts_with("责编")
            || lt.starts_with("原著")
            || lt.starts_with("改编")
            || lt.starts_with("主笔")
            || lt.starts_with("助理")
            || lt.starts_with("原作")
            || lt.starts_with("监制"))
            && (lt.contains(':') || lt.contains('：') || lt.contains("-："))
    });
    has_role_colon || credit_markers.iter().any(|&m| t.contains(m))
}





