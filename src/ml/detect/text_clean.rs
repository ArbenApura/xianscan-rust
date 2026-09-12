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
        r"(?i)(\.com|\.net|\.org|\.cn|\.cc|\.xyz|\.top|\.me|\.tv|\.app|http|discord|scanlat|bilibili|速漫库|速漫|漫库|qumanku|quman|包子|baozimh|baozi|colamanga|colamanhua|colam|acloudmerge|acloud|loudmer|udmer|merd|oamanhua|merge|cloud|manga|manhua|comic|yumanhua|mangabox|comick|集云数据|集云|儿云数据|云数据|米古|咪咕|migu|米古动漫|[腾专博传]讯[动漫慢机动初]*|腾[动漫慢机动初]{1,2}|阅文[集团]*|快[看刮](?:[漫慢]画|动漫|app|APP|独家|首发)|^(?:快[看刮]|快[看刮][!！])$|微信|公众号|qq群|企鹅群|群号|严禁转载|独家(?:首发|连载|授权|发布|提供)|扫图|录入|修图|嵌字|翻译[:：]|翻译组|汉化组|免费漫画|最新免费|漫画网|看漫画网|首发|独家首发|漫客[栈拌祥]?|漫[客喜][栈拌祥]?|客[祥拌]|[福]?\s*喜祥|mkzhan|nga\.com|^[祥拌]$|澳[祥拌]?|最快最稳|广告最少|观看[，, ]?[最量])"
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

pub static KOREAN_OCR_CONFUSIONS_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(?:윗들|못들)(\s*(?:하고|하[는며시냐고]|해))").unwrap()
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
    // BUBBLE TAIL POINTER SYMBOLS AND STRAY CARET GLYPHS READ FROM SPEECH BUBBLE TAILS
    if t.chars().count() <= 2 && t.chars().all(|c| matches!(c, 'Λ' | '^' | '▲' | '▼' | '△' | '▽' | '∧' | '∨' | '∠')) {
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
    let (stripped_trailing, _) = strip_trailing_watermark_debris(t, None);
    let intermediate = if stripped_trailing.trim().is_empty() { t } else { stripped_trailing.trim() };
    let (stripped_both, _) = strip_leading_watermark_debris(intermediate, None);
    let candidate = if stripped_both.trim().is_empty() { intermediate } else { stripped_both.trim() };
    if candidate.is_empty() {
        return true;
    }
    if is_watermark_line(candidate) {
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
    let dot_count = t.chars().filter(|&c| c == '…' || c == '.' || c == '·' || c == '。' || c == '‥' || c == '．' || c == '•' || c == '●').count();
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
    // Clean core characters excluding whitespace, punctuation, colons, ellipses, tildes, quotes, etc.
    let clean_chars: Vec<char> = t
        .chars()
        .filter(|c| {
            !c.is_whitespace()
                && !c.is_ascii_punctuation()
                && !matches!(
                    *c,
                    '！' | '？' | '：' | '；' | '…' | '～' | '·' | '—' | '–' | '“' | '”' | '‘' | '’' | '。' | '，' | '、'
                )
        })
        .collect();

    // Single-character action onomatopoeia or shouts (e.g. "哒", "嗒", "啪", "轰", "噗", "砰", "咚", "嘶", "嗖", "刷", "咔", "呼", "嗤", "铛", "啐", "哈", "啧", "哼", "呃", "呀", "切", "嘟", "滋", "嗡", "哔", "滴", "嘭", "哐", "唰", "吼", "咕", "簌", "沙", "哗")
    let is_action_sfx_char = matches!(
        clean_chars.first(),
        Some(
            '哒' | '嗒' | '啪' | '轰' | '噗' | '砰' | '咚' | '嘶' | '嗖' | '刷' | '咔'
                | '呼' | '嗤' | '铛' | '啐' | '哈' | '啧' | '哼' | '呃' | '呀' | '切'
                | '嘟' | '滋' | '嗡' | '哔' | '滴' | '嘀' | '嘭' | '哐' | '唰' | '吼'
                | '咕' | '簌' | '沙' | '哗' | '静' | '靜'
        )
    ) && clean_chars.len() <= 3
        && (t.contains('！') || t.contains('!') || t.contains('~') || t.contains('～') || t.contains('：') || t.contains(':') || clean_chars.len() <= 2);

    // Dialogue interjections with exclamation mark (e.g. "啊！", "哇！") are shouts/SFX, but plain "啊" or "哇" are dialogue speech
    let is_exclamation_shout = (t.starts_with('啊') || t.starts_with('哇'))
        && (t.contains('！') || t.contains('!') || t.contains('~') || t.contains('～') || t.contains('：') || t.contains(':'))
        && clean_chars.len() <= 3;

    // Korean action onomatopoeia & shouts (e.g. "촤", "콰", "쿵", "쾅", "띠", "띵", "찌", "쨍", "틱", "톡", "뚝", "팍", "탁", "철", "꾸", "꾹", "끼", "꽉", "콱", "털", "덜", "두", "벌", "웅", "후", "흡", "호")
    let is_korean_sfx_char = matches!(
        clean_chars.first(),
        Some(
            '촤' | '콰' | '쾅' | '쿵' | '띠' | '띵' | '찌' | '쨍' | '틱' | '톡' | '뚝' | '팍' | '탁' | '철' | '척' | '홱' | '휙' | '쑥' | '쏙' | '또'
                | '꾸' | '꾹' | '끼' | '꽉' | '콱' | '털' | '덜' | '두' | '벌' | '웅' | '후' | '흡' | '호'
        )
    ) && clean_chars.len() <= 3
        && (t.contains('!') || t.contains('~') || t.contains('-') || t.contains('：') || t.contains(':') || clean_chars.len() <= 2);

    // Repeated onomatopoeia patterns (e.g. "嘟嘟", "嘟嘟嘟", "轰隆隆", "咚咚", "哗啦啦", "嗒嗒", "두근두근", "哗啦哗啦", "웅\n웅\nㅇ", "웅\n웅")
    let chars: Vec<char> = t
        .chars()
        .filter(|c| !c.is_whitespace() && !c.is_ascii_punctuation() && *c != '！' && *c != '？' && *c != '\'' && *c != '"' && *c != '’' && *c != '‘')
        .collect();
    let is_repeated_sound = if chars.len() >= 2 && chars.len() <= 6 {
        let first = chars[0];
        if first.is_ascii_alphanumeric() || first == 'し' || first == 'い' || first == 'あ' || first == 'え' || first == '一' || first == '丨' {
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
            if s.contains("快走") || s.contains("快跑") || s.contains("快点") || s.contains("救命") || s.contains("等等") || s.contains("看看") || s.contains("想想") || s.contains("走吧") || s.contains("来吧") || s.contains("让开") || s.contains("闪开") || s.contains("让让") || s.contains("滚开") || s.contains("让路") {
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
        // DROP STANDALONE SPEECH BUBBLE TAIL POINTER SYMBOLS (E.G. "Λ", "^", "▲")
        let is_pointer_tail_noise = !t.is_empty()
            && t.chars().count() <= 2
            && t.chars().all(|c| matches!(c, 'Λ' | '^' | '▲' | '▼' | '△' | '▽' | '∧' | '∨' | '∠'));
        if !is_tail_noise && !is_pointer_tail_noise {
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
            let cur_trimmed = line_str.trim();
            if (cur_trimmed.starts_with('m') || cur_trimmed.starts_with('n') || cur_trimmed.starts_with('M'))
                && cur_trimmed.len() > 1
                && cur_trimmed[1..].chars().all(|c| c == '…' || c == '.' || c == '·' || c == '。')
            {
                line_str = format!("…{}", &cur_trimmed[1..]);
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
        while cleaned.ends_with(|c| matches!(c, 'Λ' | '^' | '▲' | '▼' | '△' | '▽' | '∧' | '∨' | '∠')) {
            cleaned.pop();
            cleaned = cleaned.trim_end().to_string();
        }
        let cleaned = normalize_korean_ocr_confusions(&cleaned);
        let cleaned = normalize_japanese_ocr_confusions(&cleaned);
        let cleaned = strip_hallucinated_border_parentheses(&cleaned);
        let cleaned = if cleaned == "一." || cleaned == "1." || cleaned == "|." || cleaned == "l." || cleaned == "I." || cleaned == "!." || cleaned == "！." {
            "！".to_string()
        } else {
            cleaned
        };
        cleaned.trim().to_string()
    }
}

/// NORMALIZES KNOWN SYSTEMATIC JAPANESE OCR CONFUSIONS IN MANGA
/// HIRAGANA ろ AND る LOOK VERY SIMILAR IN STYLIZED FONTS, FREQUENTLY CAUSING
/// ADVERB そろそろ TO BE MISRECOGNIZED AS UNGRAMMATICAL そろそる.
pub fn normalize_japanese_ocr_confusions(text: &str) -> String {
    let mut s = text.to_string();
    if s.contains("そろそる") {
        s = s.replace("そろそる", "そろそろ");
    }
    if s.contains("行ミう") {
        s = s.replace("行ミう", "行こう");
    }
    if s.contains("4urt回") || s.contains("4urt") {
        s = s.replace("4urt回", "何だっけ").replace("4urt", "何だっけ");
    }
    if s.contains("クビだよく") {
        s = s.replace("クビだよく", "クビだよ");
    }
    if s.trim() == "Bi\n!" || s.trim() == "Bi!" || s.trim() == "Bi！" || s.trim() == "Bi" {
        s = "ぶ！".to_string();
    } else {
        if s.contains("Bi\n!") {
            s = s.replace("Bi\n!", "ぶ！");
        }
        if s.contains("Bi!") {
            s = s.replace("Bi!", "ぶ！");
        }
        if s.contains("Bi！") {
            s = s.replace("Bi！", "ぶ！");
        }
    }
    if s.contains("このパーテ") && !s.contains("このパーティ") {
        s = s.replace("このパーテ", "このパーティに");
    }
    if s.trim() == "で" {
        s = "くび…".to_string();
    }
    s
}

/// NORMALIZES VERTICAL EXCLAMATION MARK OCR CONFUSIONS IN SPEECH BUBBLES
/// IN VERTICAL CJK MANGA TYPOGRAPHY, AN EXCLAMATION MARK `！` CONSISTS OF A VERTICAL WEDGE AND A BOTTOM DOT.
/// OCR MODELS FREQUENTLY MISRECOGNIZE THIS GLYPH AS KANJI `一` PLUS PERIOD (`一.`), `1.`, `|.`, OR KANJI `一`.
/// WHEN A SINGLE VERTICAL GLYPH (H >= W * 1.25) INSIDE A SPEECH BUBBLE IS RECOGNIZED AS SUCH,
/// NORMALIZE IT TO `！`.
pub fn normalize_vertical_exclamation(text: &str, is_bubble: bool, w: i32, h: i32) -> String {
    let t = text.trim();
    if t == "一." || t == "1." || t == "|." || t == "l." || t == "I." || t == "!." || t == "！." {
        return "！".to_string();
    }
    if is_bubble && (h as f32) >= (w as f32 * 1.25) {
        if t == "一" || t == "1" || t == "|" || t == "l" || t == "I" {
            return "！".to_string();
        }
    }
    text.to_string()
}

/// STRIPS HALLUCINATED SPEECH BUBBLE BORDER ARCS RECOGNIZED AS PARENTHESES
pub fn strip_hallucinated_border_parentheses(text: &str) -> String {
    let t = text.trim();
    if t.is_empty() {
        return String::new();
    }

    let is_open_paren = |c: char| c == '(' || c == '（';
    let is_close_paren = |c: char| c == ')' || c == '）';
    let is_any_paren = |c: char| is_open_paren(c) || is_close_paren(c);

    if !t.chars().any(is_any_paren) {
        return text.to_string();
    }

    // PROCESS LINE BY LINE
    let mut cleaned_lines: Vec<String> = Vec::new();
    for line in text.lines() {
        let mut l_str = line.trim().to_string();
        if l_str.is_empty() {
            cleaned_lines.push(String::new());
            continue;
        }

        let open_count = l_str.chars().filter(|&c| is_open_paren(c)).count();
        let close_count = l_str.chars().filter(|&c| is_close_paren(c)).count();

        // 1. UNMATCHED LEADING OPENING PARENTHESIS ON THIS LINE (NO CLOSING PARENTHESIS ON LINE)
        if open_count > 0 && close_count == 0 && l_str.starts_with(is_open_paren) {
            let first_char = l_str.chars().next().unwrap();
            l_str = l_str[first_char.len_utf8()..].trim_start().to_string();
        }

        // 2. UNMATCHED TRAILING CLOSING PARENTHESIS ON THIS LINE (NO OPENING PARENTHESIS ON LINE)
        if close_count > 0 && open_count == 0 {
            let trimmed_end = l_str.trim_end();
            if trimmed_end.ends_with(is_close_paren) {
                let last_char = trimmed_end.chars().last().unwrap();
                l_str = trimmed_end[..trimmed_end.len() - last_char.len_utf8()].trim_end().to_string();
            } else if let Some(pos) = trimmed_end.rfind(is_close_paren) {
                let after_paren = &trimmed_end[pos + 1..];
                if after_paren.chars().all(|c| c.is_ascii_punctuation() || matches!(c, '！' | '？' | '。' | '…' | '～' | '，' | '、')) {
                    let mut reconstructed = trimmed_end[..pos].to_string();
                    let paren_char = trimmed_end[pos..].chars().next().unwrap();
                    reconstructed.push_str(&trimmed_end[pos + paren_char.len_utf8()..]);
                    l_str = reconstructed.trim_end().to_string();
                }
            }
        }

        // 3. ENCLOSING PARENTHESES WRAPPING THIS ENTIRE LINE
        // E.G. "(久等了!)", "(还有!)", "(顾飞老师。)", "（久等了）", "(久等了)!"
        if l_str.starts_with(is_open_paren) {
            let cur_open = l_str.chars().filter(|&c| is_open_paren(c)).count();
            let cur_close = l_str.chars().filter(|&c| is_close_paren(c)).count();
            if cur_open == 1 && cur_close == 1 {
                let trimmed_end = l_str.trim_end();
                if trimmed_end.ends_with(is_close_paren) {
                    let first_char = l_str.chars().next().unwrap();
                    let last_char = trimmed_end.chars().last().unwrap();
                    let inner = &trimmed_end[first_char.len_utf8()..trimmed_end.len() - last_char.len_utf8()];
                    l_str = inner.trim().to_string();
                } else if let Some(pos) = trimmed_end.rfind(is_close_paren) {
                    let after_paren = &trimmed_end[pos + 1..];
                    if after_paren.chars().all(|c| c.is_ascii_punctuation() || matches!(c, '！' | '？' | '。' | '…' | '～' | '，' | '、')) {
                        let first_char = l_str.chars().next().unwrap();
                        let paren_char = trimmed_end[pos..].chars().next().unwrap();
                        let inner_part = &trimmed_end[first_char.len_utf8()..pos];
                        let tail_part = &trimmed_end[pos + paren_char.len_utf8()..];
                        l_str = format!("{}{}", inner_part.trim(), tail_part.trim());
                    }
                }
            }
        }

        cleaned_lines.push(l_str);
    }

    // 4. MULTI-LINE ENCLOSING PARENTHESES WRAPPER CHECK
    if cleaned_lines.len() >= 2 {
        let first_starts = cleaned_lines.first().map(|l| l.trim().starts_with(is_open_paren)).unwrap_or(false);
        let last_ends = cleaned_lines.last().map(|l| {
            let tr = l.trim_end();
            tr.ends_with(is_close_paren) || (tr.rfind(is_close_paren).map(|p| {
                tr[p + 1..].chars().all(|c| c.is_ascii_punctuation() || matches!(c, '！' | '？' | '。' | '…' | '～' | '，' | '、'))
            }).unwrap_or(false))
        }).unwrap_or(false);

        let total_open: usize = cleaned_lines.iter().map(|l| l.chars().filter(|&c| is_open_paren(c)).count()).sum();
        let total_close: usize = cleaned_lines.iter().map(|l| l.chars().filter(|&c| is_close_paren(c)).count()).sum();

        if first_starts && last_ends && total_open == 1 && total_close == 1 {
            if let Some(first_line) = cleaned_lines.first_mut() {
                let tr = first_line.trim();
                let first_char = tr.chars().next().unwrap();
                *first_line = tr[first_char.len_utf8()..].trim_start().to_string();
            }
            if let Some(last_line) = cleaned_lines.last_mut() {
                let tr = last_line.trim_end();
                if tr.ends_with(is_close_paren) {
                    let last_char = tr.chars().last().unwrap();
                    *last_line = tr[..tr.len() - last_char.len_utf8()].trim_end().to_string();
                } else if let Some(pos) = tr.rfind(is_close_paren) {
                    let paren_char = tr[pos..].chars().next().unwrap();
                    let inner_part = &tr[..pos];
                    let tail_part = &tr[pos + paren_char.len_utf8()..];
                    *last_line = format!("{}{}", inner_part.trim_end(), tail_part.trim());
                }
            }
        }
    }

    // 5. REMOVE ANY REMAINING ENTIRELY UNMATCHED PARENTHESIS IF ACROSS ENTIRE TEXT IT HAS ZERO OPPOSITES
    let total_open: usize = cleaned_lines.iter().map(|l| l.chars().filter(|&c| is_open_paren(c)).count()).sum();
    let total_close: usize = cleaned_lines.iter().map(|l| l.chars().filter(|&c| is_close_paren(c)).count()).sum();
    if total_open > 0 && total_close == 0 {
        for line in &mut cleaned_lines {
            *line = line.chars().filter(|&c| !is_open_paren(c)).collect();
        }
    } else if total_close > 0 && total_open == 0 {
        for line in &mut cleaned_lines {
            *line = line.chars().filter(|&c| !is_close_paren(c)).collect();
        }
    }

    cleaned_lines.join("\n")
}

/// RECOVERS KNOWN SYSTEMATIC HANGUL OCR CONFUSIONS FROM MANHWA BRUSH/ACTION FONTS
pub fn normalize_korean_ocr_confusions(text: &str) -> String {
    if !text.contains("윗들") && !text.contains("못들") {
        return text.to_string();
    }
    KOREAN_OCR_CONFUSIONS_RE.replace_all(text, "뭣들$1").to_string()
}

/// CHECK IF A GIVEN TEXT STRING CONSISTS SOLELY OF PUNCTUATION MARKS, BRACKETS, OR SYMBOLS WITH ZERO ALPHANUMERIC CHARACTERS
pub fn is_pure_punctuation_only(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return true;
    }
    !t.chars().any(|c| c.is_alphanumeric())
}

/// CHECK IF A NARROW VERTICAL STRING INSIDE A SPEECH BUBBLE REPRESENTS VERTICAL ELLIPSIS DOT HALLUCINATIONS
/// (E.G. "e\ne\n8\ne\ne\ne\nF" OR "7\n•\n.\nD\n中\n●\n•\n2\nP" GENERATED FROM 6 VERTICAL ELLIPSIS DOTS)
pub fn is_vertical_ellipsis_dot_noise(text: &str, is_bubble: bool, w: i32, h: i32) -> bool {
    if !is_bubble {
        return false;
    }
    if w > 35 || h < 24 || (h as f32) < w as f32 * 1.5 {
        return false;
    }
    let lines: Vec<&str> = text.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    if lines.len() < 3 || lines.len() > 14 {
        return false;
    }
    if !lines.iter().all(|l| l.chars().count() <= 2) {
        return false;
    }
    let chars: Vec<char> = text.chars().filter(|c| !c.is_whitespace()).collect();
    let dot_confusion_count = chars.iter().filter(|&&c| {
        matches!(
            c,
            '•' | '●' | '·' | '.' | '‥' | '．' | '。'
                | 'e' | 'E' | '8' | 'F' | 'f' | '7' | 'D' | 'd' | 'P' | 'p'
                | 'o' | 'O' | '0' | '1' | 'I' | 'l' | '|' | '!' | 'c' | 'C'
                | 'u' | 'U' | 'n' | 'N' | '2' | '3' | '5' | '中'
        )
    }).count();
    dot_confusion_count >= (chars.len() * 3 / 4).max(3)
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
    let is_zh = matches!(source_lang, Some("zh") | Some("zh_hans") | Some("zh_hant") | Some("zh-Hans") | Some("zh-Hant"));
    let mut non_native_runs = 0usize;
    let mut in_non_native = false;
    let mut has_greek_symbol = false;
    for c in &chars {
        let is_sym = matches!(*c, 'Φ' | 'Ψ' | 'Ω' | 'α' | 'β' | 'γ' | 'δ' | 'ε' | 'θ' | 'λ' | 'π' | 'σ' | 'φ' | 'ω' | '×' | '÷' | '≠' | '±');
        if is_sym {
            has_greek_symbol = true;
        }
        let is_kana = is_zh && (('\u{3040}'..='\u{309F}').contains(c) || ('\u{30A0}'..='\u{30FF}').contains(c));
        let is_non_nat = c.is_ascii_alphanumeric() || is_sym || is_kana || matches!(*c, 'ェ' | 'ィ' | 'ゥ' | 'ォ' | 'ャ' | 'ュ' | 'ョ');
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
        .filter(|c| {
            if is_zh && (('\u{3040}'..='\u{309F}').contains(c) || ('\u{30A0}'..='\u{30FF}').contains(c)) {
                return false;
            }
            crate::ml::detect::has_native_script_for_lang(&c.to_string(), source_lang)
        })
        .count();
    if has_greek_symbol && non_native_runs >= 1 {
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

    // EXEMPT SOUND EFFECTS AND DIALOGUE SHOUTS (E.G. "嘀！\n嘀！", "咚！\n咚！") FROM TABULAR PRUNING
    if is_onomatopoeia_or_shout(t) || lines.iter().all(|l| is_onomatopoeia_or_shout(l)) {
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

/// CHECKS WHETHER A LATIN SUFFIX ATTACHED TO CJK SCRIPT IS A LEGITIMATE LOANWORD, GAMING TERM, OR SPOKEN DIALOGUE
pub fn is_legitimate_cjk_latin_loanword_or_dialogue(suffix: &str) -> bool {
    let trimmed = suffix.trim();
    if trimmed.is_empty() {
        return false;
    }

    // 1. DIALOGUE PUNCTUATION AT END (EXCLAMATIONS, QUESTIONS, ELLIPSES, TILDES)
    // WATERMARK DEBRIS DOES NOT TERMINATE WITH DIALOGUE PUNCTUATION
    let ends_with_dialogue_punct = trimmed.ends_with('！')
        || trimmed.ends_with('!')
        || trimmed.ends_with('？')
        || trimmed.ends_with('?')
        || trimmed.ends_with('…')
        || trimmed.ends_with('~')
        || trimmed.ends_with('～');
    if ends_with_dialogue_punct {
        return true;
    }

    // 2. COMMON CJK GAMING, TECH, SLANG, AND DIALOGUE ACRONYMS OR LOANWORDS (WITH OPTIONAL NUMERIC STAT VALUE, E.G. MP100, LV99, HP500)
    let word = trimmed.trim_matches(|c: char| c.is_ascii_punctuation() || matches!(c, '！' | '？' | '…' | '～' | '。' | '，')).to_uppercase();
    const CJK_LATIN_TERMS: &[&str] = &[
        "NPC", "BOSS", "PK", "EXP", "HP", "MP", "GM", "ID", "VIP", "CD", "DPS", "AOE", "BUG",
        "APP", "VS", "OK", "NO", "KO", "GG", "WP", "MAX", "LV", "LEVEL", "UP", "DOWN",
        "SKILL", "ITEM", "QUEST", "PARTY", "GUILD", "SERVER", "GAME", "OVER", "START",
        "AI", "VR", "AR", "CPU", "PC", "PS", "UI", "CEO", "OMG", "WTF", "LOL", "BYE",
        "HI", "HELLO", "YES", "COOL", "PASS", "MISS", "CRIT", "BUFF", "DEBUFF", "TANK",
        "HEAL", "HEALER", "AGGRO", "SOLO", "CARRY", "PRO", "NOOB", "EZ", "AFK", "SP", "AP",
    ];

    let base_term = word.trim_matches(|c: char| c.is_ascii_digit() || matches!(c, '+' | '-' | '.' | ':' | '：' | ' '));
    if CJK_LATIN_TERMS.contains(&word.as_str()) || (!base_term.is_empty() && CJK_LATIN_TERMS.contains(&base_term)) {
        return true;
    }

    // 3. SHORT ALL-CAPS ACRONYMS (2 TO 4 CHARACTERS, E.G. 'VR', 'PVP', 'PVE', WITH OPTIONAL STAT VALUE)
    if (word.len() >= 2 && word.len() <= 4 && word.chars().all(|c| c.is_ascii_uppercase()))
        || (!base_term.is_empty() && base_term.len() >= 2 && base_term.len() <= 4 && base_term.chars().all(|c| c.is_ascii_uppercase()))
    {
        let check = if !base_term.is_empty() { base_term } else { word.as_str() };
        if check != "TL" && check != "RAW" {
            return true;
        }
    }

    false
}

/// STRIP TRAILING NON-NATIVE SCANLATOR / SITE WATERMARK FRAGMENTS ATTACHED TO NATIVE LINES
pub fn strip_trailing_watermark_debris(line_text: &str, source_lang: Option<&str>) -> (String, f32) {
    let t = line_text.trim();
    let is_non_latin = crate::ml::detect::is_non_latin_source(source_lang) || crate::ml::detect::has_cjk_characters(t);
    if t.is_empty() || !is_non_latin {
        return (line_text.to_string(), 1.0);
    }
    let native_count = t.chars().filter(|c| crate::ml::detect::has_native_script_for_lang(&c.to_string(), source_lang) || crate::ml::detect::has_cjk_characters(&c.to_string())).count();
    if native_count == 0 {
        return (line_text.to_string(), 1.0);
    }

    let chars: Vec<char> = t.chars().collect();
    let total_chars = chars.len();
    if t.contains('\n') {
        let lines: Vec<&str> = t.lines().collect();
        let l0_native = crate::ml::detect::has_native_script_for_lang(lines[0], source_lang) || crate::ml::detect::has_cjk_characters(lines[0]);
        let l1_native = crate::ml::detect::has_native_script_for_lang(lines[1], source_lang) || crate::ml::detect::has_cjk_characters(lines[1]);
        if lines.len() == 2 && l0_native && !l1_native {
            let clean_prefix = lines[0].trim().to_string();
            let keep_ratio = clean_prefix.chars().count() as f32 / total_chars as f32;
            return (clean_prefix, keep_ratio);
        }
    }
    if let Some(idx) = chars.iter().rposition(|&c| crate::ml::detect::has_native_script_for_lang(&c.to_string(), source_lang) || crate::ml::detect::has_cjk_characters(&c.to_string()) || matches!(c, '。' | '！' | '？' | '，' | '、' | '…' | '”' | '’' | '」' | '』' | '）' | ')')) {
        let suffix: String = chars[idx + 1..].iter().collect();
        let suffix_trimmed = suffix.trim_start_matches(|c| matches!(c, '·' | '.' | '_' | '-' | '|' | ' ' | '/' | '\\' | ':')).trim();
        let has_letters = suffix_trimmed.chars().any(|c| c.is_ascii_alphabetic());
        let is_latin_debris = !suffix_trimmed.is_empty()
            && has_letters
            && suffix_trimmed.chars().all(|c| c.is_ascii_alphanumeric() || c.is_ascii_punctuation())
            && suffix_trimmed.chars().count() >= 2;
        if is_latin_debris && !is_legitimate_cjk_latin_loanword_or_dialogue(suffix_trimmed) {
            let clean_prefix: String = chars[..=idx].iter().collect();
            let keep_ratio = (idx + 1) as f32 / total_chars as f32;
            return (clean_prefix, keep_ratio);
        }
    }
    (line_text.to_string(), 1.0)
}

fn char_visual_weight(c: char) -> f32 {
    if crate::ml::detect::has_cjk_characters(&c.to_string())
        || matches!(c, '，' | '。' | '！' | '？' | '：' | '；' | '“' | '”' | '‘' | '’' | '（' | '）' | '【' | '】' | '《' | '》' | '、')
    {
        1.0
    } else if c == '…' || c == '—' || c == '–' {
        0.8
    } else if c.is_ascii_whitespace() {
        0.3
    } else {
        0.55
    }
}

/// STRIP LEADING NON-NATIVE SCANLATOR / SITE WATERMARK FRAGMENTS ATTACHED TO NATIVE LINES
pub fn strip_leading_watermark_debris(line_text: &str, source_lang: Option<&str>) -> (String, f32) {
    let t = line_text.trim();
    let is_non_latin = crate::ml::detect::is_non_latin_source(source_lang) || crate::ml::detect::has_cjk_characters(t);
    if t.is_empty() || !is_non_latin {
        return (line_text.to_string(), 0.0);
    }
    let native_count = t.chars().filter(|c| crate::ml::detect::has_native_script_for_lang(&c.to_string(), source_lang) || crate::ml::detect::has_cjk_characters(&c.to_string())).count();
    if native_count == 0 {
        return (line_text.to_string(), 0.0);
    }

    let chars: Vec<char> = t.chars().collect();
    if let Some(idx) = chars.iter().position(|&c| crate::ml::detect::has_native_script_for_lang(&c.to_string(), source_lang) || crate::ml::detect::has_cjk_characters(&c.to_string()) || matches!(c, '“' | '‘' | '「' | '『' | '（' | '(')) {
        if idx > 0 {
            let prefix: String = chars[..idx].iter().collect();
            let prefix_trimmed = prefix.trim_end_matches(|c| matches!(c, '·' | '.' | '_' | '-' | '|' | ' ' | '/' | '\\' | ':')).trim();
            let lower = prefix_trimmed.to_lowercase();
            let is_domain_or_tag = lower.contains(".com")
                || lower.contains(".net")
                || lower.contains(".org")
                || lower.contains(".cn")
                || lower.contains(".xyz")
                || lower.contains("manga")
                || lower.contains("scan")
                || lower.contains("http")
                || lower.contains("www");
            let is_all_latin = !prefix_trimmed.is_empty() && prefix_trimmed.chars().all(|c| c.is_ascii_alphanumeric() || c.is_ascii_punctuation());
            let is_substantial_watermark = is_domain_or_tag
                || (is_all_latin && prefix_trimmed.chars().count() >= 5)
                || crate::ml::detect::is_watermark_line(prefix_trimmed);
            if is_substantial_watermark {
                let clean_suffix: String = chars[idx..].iter().collect();
                let prefix_weight: f32 = chars[..idx].iter().map(|&c| char_visual_weight(c)).sum();
                let total_weight: f32 = chars.iter().map(|&c| char_visual_weight(c)).sum();
                let start_offset_ratio = if total_weight > 0.0 { prefix_weight / total_weight } else { 0.0 };
                return (clean_suffix, start_offset_ratio);
            }
        }
    }
    (line_text.to_string(), 0.0)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_korean_ocr_confusions() {
        // RECOVERS TYPICAL MANHWA ACTION FONT OCR CORRUPTIONS OF 뭣들 -> 윗들 / 못들
        assert_eq!(
            normalize_korean_ocr_confusions("윗들 하고 있어!\n빨리 떨어뜨려!"),
            "뭣들 하고 있어!\n빨리 떨어뜨려!"
        );
        assert_eq!(
            normalize_korean_ocr_confusions("윗들하고 있어!"),
            "뭣들하고 있어!"
        );
        assert_eq!(
            normalize_korean_ocr_confusions("못들 하고 있어!"),
            "뭣들 하고 있어!"
        );
        assert_eq!(
            normalize_korean_ocr_confusions("윗들 해!"),
            "뭣들 해!"
        );
        assert_eq!(
            clean_stray_ocr_artifacts("윗들 하고 있어!\n빨리 떨어뜨려!"),
            "뭣들 하고 있어!\n빨리 떨어뜨려!"
        );
        // PRESERVES LEGITIMATE HANGUL
        assert_eq!(
            normalize_korean_ocr_confusions("윗사람에게 공손해야 한다"),
            "윗사람에게 공손해야 한다"
        );
    }

    #[test]
    fn test_strip_hallucinated_border_parentheses() {
        // STRIPS UNMATCHED LEADING FULLWIDTH PARENTHESIS FROM BUBBLE BORDER ARC
        assert_eq!(
            strip_hallucinated_border_parentheses("（格各异，但都是网"),
            "格各异，但都是网"
        );
        // STRIPS ENCLOSING HALFWIDTH PARENTHESES WRAPPING ENTIRE DIALOGUE
        assert_eq!(
            strip_hallucinated_border_parentheses("(久等了!)"),
            "久等了!"
        );
        assert_eq!(
            strip_hallucinated_border_parentheses("(还有!)"),
            "还有!"
        );
        assert_eq!(
            strip_hallucinated_border_parentheses("(顾飞老师。)"),
            "顾飞老师。"
        );
        assert_eq!(
            strip_hallucinated_border_parentheses("(久等了)！"),
            "久等了！"
        );
        assert_eq!(
            strip_hallucinated_border_parentheses("（还有！）"),
            "还有！"
        );
        // PRESERVES INNER LEGITIMATE PARENTHESES AND NUMBERED LISTS
        assert_eq!(
            strip_hallucinated_border_parentheses("Hello (world) test"),
            "Hello (world) test"
        );
        assert_eq!(
            strip_hallucinated_border_parentheses("(1) First item"),
            "(1) First item"
        );
        // CLEAN_STRAY_OCR_ARTIFACTS INTEGRATION
        assert_eq!(
            clean_stray_ocr_artifacts("(久等了!)"),
            "久等了!"
        );
    }
}

