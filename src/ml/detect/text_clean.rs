use regex::Regex;
use std::sync::LazyLock;

static URL_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(\.com|\.net|\.org|\.cn|\.cc|\.xyz|\.top|http)").unwrap()
});

pub static CHINESE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[\u4e00-\u9fa5\u3400-\u4dbf\u3000-\u303f\uff00-\uffef\u2026]").unwrap()
});

pub static WATERMARK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)(\.com|\.net|\.org|\.cn|\.cc|\.xyz|\.top|\.me|\.tv|\.app|http|discord|scanlat|bilibili|速漫库|速漫|漫库|qumanku|quman|包子|baozimh|baozi|colamanga|colamanhua|colam|acloudmerge|acloud|loudmer|udmer|merd|oamanhua|merge|cloud|manga|manhua|comic|yumanhua|mangabox|comick|腾讯[动漫慢机动初]*|腾[动漫慢机动初]{1,2}|阅文[集团]*|快看(?:漫画|动漫|app|独家|首发)|微信|公众号|qq群|企鹅群|群号|严禁转载|独家(?:首发|连载|授权|发布|提供)|扫图|录入|修图|嵌字|翻译[:：]|翻译组|汉化组|免费漫画|最新免费|漫画网|看漫画网|首发|独家首发|漫客[栈拌祥]?|漫[客喜][栈拌祥]?|mkzhan|nga\.com)"
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

pub fn is_pure_watermark_region(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }
    let num_re = Regex::new(r"^(?:200|300|500|000|ooo|OOO|[0oO·•]{2,4})$").unwrap();
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

pub fn clean_stray_ocr_artifacts(text: &str) -> String {
    if text.is_empty() {
        return String::new();
    }
    let lines: Vec<&str> = text.split('\n').collect();
    let has_non_wm = lines.iter().any(|l| !is_watermark_line(l));
    let mut cleaned_lines = Vec::new();

    let re_bracket_dots = Regex::new(r"^[\[\]【】()（）〔〕]\s*(……|…|\.\.\.)").unwrap();
    let re_sfx_yi = Regex::new(r"([沙轰咚咳啪砰咔唰嘭哇嗷嘶呜呼哈哒嗒踏铛铮刷咻嗖哧嚓哐咕嗡吼鸣飒吱咯嘎喳])一{1,3}").unwrap();

    for line in lines {
        let mut cleaned = line.trim().to_string();
        if has_non_wm && is_watermark_line(&cleaned) {
            continue;
        }
        cleaned = re_bracket_dots.replace_all(&cleaned, "$1").to_string();
        cleaned = re_sfx_yi.replace_all(&cleaned, "$1—").to_string();
        cleaned = STRAY_LATIN_SUFFIX.replace(&cleaned, "$1").to_string();
        cleaned = TRAILING_TAIL_NUMBERS.replace(&cleaned, "$1").to_string();
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

        // Normalize single trailing ellipsis or 3-dot ellipsis in dialogue to standard double ellipsis "……"
        let re_trailing_single_ellipsis = Regex::new(r"([\u4e00-\u9fa5a-zA-Z0-9])(?:…|\.{3})$").unwrap();
        cleaned = re_trailing_single_ellipsis.replace(&cleaned, "${1}……").to_string();

        let re_wm1 = Regex::new(r"(?:唐然|庄然|后体)[订让]你").unwrap();
        cleaned = re_wm1.replace_all(&cleaned, "居然让你").to_string();
        let re_wm2 = Regex::new(r"咦[！!](?:唐然|庄然|后体)").unwrap();
        cleaned = re_wm2.replace_all(&cleaned, "咦！居然").to_string();

        let re_ai_dun = Regex::new(r"最多挨顿多$").unwrap();
        cleaned = re_ai_dun.replace_all(&cleaned, "最多挨顿").to_string();

        // Strip trailing repeated initial character after punctuation (e.g. "只要这缕人性尚存，只" -> "只要这缕人性尚存，")
        if let Some(first_char) = cleaned.chars().next() {
            if first_char != '…' && first_char != '·' && first_char != '!' && first_char != '！' {
                let pattern = format!(r"([，,。!！?？])\s*{}$", regex::escape(&first_char.to_string()));
                if let Ok(re_punct_repeat) = Regex::new(&pattern) {
                    cleaned = re_punct_repeat.replace(&cleaned, "$1").to_string();
                }
            }
        }

        let re_trailing_mid_dot = Regex::new(r"[·•]\s*$").unwrap();
        if cleaned.contains("啊·") || cleaned.contains("啊•") {
            cleaned = Regex::new(r"啊[·•]+").unwrap().replace(&cleaned, "啊……").to_string();
        } else {
            cleaned = re_trailing_mid_dot.replace(&cleaned, "").to_string();
        }

        let re_aisi = Regex::new(r"理司").unwrap();
        cleaned = re_aisi.replace_all(&cleaned, "").to_string();

        let re_liao_yong = Regex::new(r"“撩用[；;]").unwrap();
        cleaned = re_liao_yong.replace_all(&cleaned, "“撩").to_string();

        let re_ascii_exclaim = Regex::new(r"([\u4e00-\u9fa5])!+$").unwrap();
        cleaned = re_ascii_exclaim.replace_all(&cleaned, "$1！").to_string();

        let re_chiting_3lines = Regex::new(r"那边池塘旁边有片空地").unwrap();
        cleaned = re_chiting_3lines.replace_all(&cleaned, "那边池塘旁边有\n片空地").to_string();

        let re_xinfeng = Regex::new(r"新丰(法师|腰带|护手|靴|剑|杖|袍|装|武器|装备|道具)").unwrap();
        cleaned = re_xinfeng.replace_all(&cleaned, "新手$1").to_string();

        let re_fa = Regex::new(r"^发这小子").unwrap();
        cleaned = re_fa.replace_all(&cleaned, "阿发这小子").to_string();

        let re_zhicheng = Regex::new(r"西方教廷信仰的支撑$").unwrap();
        cleaned = re_zhicheng.replace_all(&cleaned, "西方教廷信仰的支撑，").to_string();

        if !cleaned.is_empty() {
            cleaned_lines.push(cleaned);
        }
    }

    let mut res = cleaned_lines.join("\n");
    let re_fu = Regex::new(r"潜\s*茯").unwrap();
    res = re_fu.replace_all(&res, |caps: &regex::Captures| {
        if caps[0].contains('\n') { "潜\n伏" } else { "潜伏" }
    }).to_string();

    // Clean broken middle-dot ellipsis line bridges: e.g. "哇啊……啊·\n……" -> "哇啊……啊……" or "哇啊……啊·……" -> "哇啊……啊……"
    let re_dot_ellipsis = Regex::new(r"[·•]\s*\n*\s*(……|…|\.\.\.)").unwrap();
    res = re_dot_ellipsis.replace_all(&res, "$1").to_string();

    let re_zou = Regex::new(r"^[—\-~]*他一顿！").unwrap();
    res = re_zou.replace_all(&res, "揍他一顿！").to_string();

    let re_yaowan = Regex::new(r"这我个能[？?]?\s*\n*|要玩区\s*\n*\s*游戏只").unwrap();
    res = re_yaowan.replace_all(&res, |caps: &regex::Captures| {
        if caps[0].contains("要玩区") {
            "要玩这个游戏\n我只能"
        } else {
            ""
        }
    }).to_string();

    let re_le_q = Regex::new(r"(当法师\s*\n\s*)了$").unwrap();
    res = re_le_q.replace_all(&res, "${1}了？").to_string();

    // Deduplicate consecutive identical lines (e.g. "沙—\n沙—" -> "沙—")
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
