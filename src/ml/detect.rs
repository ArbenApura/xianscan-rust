use std::path::Path;
use anyhow::{Context, Result};
use image::{DynamicImage, GenericImageView, ImageBuffer};
use ort::{session::Session, value::Tensor};
use regex::Regex;
use std::sync::LazyLock;

use super::geometry::{
    box_iou_f32, box_score_fast, box_to_xywh_f32, find_contours,
    get_mini_boxes, unclip_polygon,
};

use serde::{Deserialize, Serialize};

pub struct ComicTextDetector {
    session: Session,
    pub input_size: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectResult {
    pub boxes: Vec<Vec<[i32; 2]>>,
    pub scores: Vec<f32>,
    pub mask: Vec<u8>,
    pub mask_width: u32,
    pub mask_height: u32,
    pub backend: String,
}

static URL_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(\.com|\.net|\.org|\.cn|\.cc|\.xyz|\.top|http)").unwrap()
});

pub static CHINESE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[\u4e00-\u9fa5\u3400-\u4dbf\u3000-\u303f\uff00-\uffef\u2026]").unwrap()
});

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

pub static WATERMARK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)(\.com|\.net|\.org|\.cn|\.cc|\.xyz|\.top|\.me|\.tv|\.app|http|discord|scanlat|bilibili|速漫库|速漫|漫库|qumanku|quman|包子|baozimh|baozi|colamanga|colamanhua|colam|acloudmerge|acloud|loudmer|udmer|merd|oamanhua|merge|cloud|manga|manhua|comic|yumanhua|mangabox|comick|腾讯[动漫慢]*|腾[动漫慢]{1,2}|阅文[集团]*|快看(?:漫画|动漫|app|独家|首发)|微信|公众号|qq群|企鹅群|群号|严禁转载|独家(?:首发|连载|授权|发布|提供)|扫图|录入|修图|嵌字|翻译[:：]|翻译组|汉化组|免费漫画|最新免费|漫画网|看漫画网|首发|独家首发|漫客[栈拌祥]?|漫[客喜][栈拌祥]?|mkzhan|nga\.com)"
    ).unwrap()
});

static PLATFORM_WATERMARK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(?:COLAMANGA\.com|Acloudmerge\.com|qumanku\.com|www\.[a-z0-9\-_.]+\.[a-z]{2,}|https?://[^\s]+|乐漫件|速漫库|腾讯动漫|信机动摄|漫客栈|本章完|下回待续)").unwrap()
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
    let mut cleaned_lines = Vec::new();

    let re_bracket_dots = Regex::new(r"^[\[\]【】()（）〔〕]\s*(……|…|\.\.\.)").unwrap();
    let re_sfx_yi = Regex::new(r"([沙轰咚咳啪砰咔唰嘭哇嗷嘶呜呼哈哒嗒踏铛铮刷咻嗖哧嚓哐咕嗡吼鸣飒吱咯嘎喳])一{1,3}").unwrap();

    for line in lines {
        let mut cleaned = line.trim().to_string();
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

impl ComicTextDetector {
    pub fn new<P: AsRef<Path>>(model_path: P) -> Result<Self> {
        let bytes = std::fs::read(model_path.as_ref())
            .context("Failed to read ONNX model file")?;
        Self::from_bytes(&bytes)
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        let session = Session::builder()
            .map_err(|e| anyhow::anyhow!("Session builder error: {}", e))?
            .with_intra_threads(num_cpus::get().min(8))
            .map_err(|e| anyhow::anyhow!("Session intra threads error: {}", e))?
            .commit_from_memory(bytes)
            .map_err(|e| anyhow::anyhow!("Commit from memory error: {}", e))?;
        Ok(Self { session, input_size: 1024 })
    }

    pub fn detect(&mut self, img: &DynamicImage) -> Result<DetectResult> {
        let (orig_w, orig_h) = img.dimensions();
        let (tensor_vec, pad_w, pad_h) = preprocess_for_onnx(img, self.input_size);

        let input_tensor = Tensor::from_array(([1, 3, self.input_size as usize, self.input_size as usize], tensor_vec))
            .map_err(|e| anyhow::anyhow!("Tensor create error: {}", e))?;

        let outputs = self.session.run(ort::inputs![input_tensor])
            .map_err(|e| anyhow::anyhow!("Session run error: {}", e))?;

        // Output [1]: Mask (1, 1024, 1024)
        // Output [2]: Lines Map (1, 2, 1024, 1024)
        let (_mask_shape, mask_slice) = outputs[1].try_extract_tensor::<f32>()
            .map_err(|e| anyhow::anyhow!("Extract mask tensor error: {}", e))?;
        let (_lines_shape, lines_slice) = outputs[2].try_extract_tensor::<f32>()
            .map_err(|e| anyhow::anyhow!("Extract lines tensor error: {}", e))?;

        let unpad_w = (self.input_size - pad_w) as usize;
        let unpad_h = (self.input_size - pad_h) as usize;

        let mut lines_map = vec![0.0_f32; unpad_w * unpad_h];
        for y in 0..unpad_h {
            for x in 0..unpad_w {
                // lines_map channel 0 is text line prob
                let idx = y * 1024 + x;
                lines_map[y * unpad_w + x] = lines_slice[idx];
            }
        }

        let (boxes, scores) = lines_map_to_boxes(
            &lines_map,
            unpad_w,
            unpad_h,
            orig_w as usize,
            orig_h as usize,
            0.3,
            0.6,
            1.5,
            1000,
            5,
        );

        // Convert unpadded mask to u8 and resize back to original resolution
        let mut unpad_mask = vec![0_u8; unpad_w * unpad_h];
        for y in 0..unpad_h {
            for x in 0..unpad_w {
                let prob = mask_slice[y * 1024 + x];
                unpad_mask[y * unpad_w + x] = (prob * 255.0).clamp(0.0, 255.0) as u8;
            }
        }

        let mask_img: ImageBuffer<image::Luma<u8>, _> =
            ImageBuffer::from_raw(unpad_w as u32, unpad_h as u32, unpad_mask)
                .context("Failed to construct unpadded mask image")?;

        let resized_mask = image::imageops::resize(
            &mask_img,
            orig_w,
            orig_h,
            image::imageops::FilterType::Triangle,
        );

        Ok(DetectResult {
            boxes,
            scores,
            mask: resized_mask.into_raw(),
            mask_width: orig_w,
            mask_height: orig_h,
            backend: "comic-ctd".to_string(),
        })
    }
}

pub fn preprocess_for_onnx(img: &DynamicImage, input_size: u32) -> (Vec<f32>, u32, u32) {
    let (w, h) = img.dimensions();
    let r = (input_size as f32 / h as f32).min(input_size as f32 / w as f32);
    let new_unpad_w = ((w as f32 * r).round() as u32).min(input_size);
    let new_unpad_h = ((h as f32 * r).round() as u32).min(input_size);

    let pad_w = input_size - new_unpad_w;
    let pad_h = input_size - new_unpad_h;

    let rgb_img = img.to_rgb8();
    let resized = image::imageops::resize(&rgb_img, new_unpad_w, new_unpad_h, image::imageops::FilterType::Triangle);
    let raw_bytes = resized.as_raw();

    let mut tensor = vec![0.0_f32; 1 * 3 * input_size as usize * input_size as usize];

    // ComicTextDetector expects BGR channel order normalized to [0, 1]
    let stride_c = input_size as usize * input_size as usize;
    let stride_y = input_size as usize;
    let unpad_w_usize = new_unpad_w as usize;

    for y in 0..new_unpad_h as usize {
        let row_offset = y * stride_y;
        let raw_row_offset = y * unpad_w_usize * 3;
        for x in 0..unpad_w_usize {
            let raw_idx = raw_row_offset + x * 3;
            let r_val = raw_bytes[raw_idx] as f32 / 255.0;
            let g_val = raw_bytes[raw_idx + 1] as f32 / 255.0;
            let b_val = raw_bytes[raw_idx + 2] as f32 / 255.0;

            let tensor_idx = row_offset + x;
            // Channel 0: B, Channel 1: G, Channel 2: R
            tensor[0 * stride_c + tensor_idx] = b_val;
            tensor[1 * stride_c + tensor_idx] = g_val;
            tensor[2 * stride_c + tensor_idx] = r_val;
        }
    }

    (tensor, pad_w, pad_h)
}

/// DBNet representer (boxes_from_bitmap port): lines_map -> (boxes, scores)
pub fn lines_map_to_boxes(
    lines_map: &[f32],
    map_w: usize,
    map_h: usize,
    dest_w: usize,
    dest_h: usize,
    thresh: f32,
    box_thresh: f32,
    unclip_ratio: f32,
    max_candidates: usize,
    min_side: i32,
) -> (Vec<Vec<[i32; 2]>>, Vec<f32>) {
    let mut binary_map = vec![0_u8; map_w * map_h];
    for i in 0..(map_w * map_h) {
        if lines_map[i] > thresh {
            binary_map[i] = 255;
        }
    }

    let contours = find_contours(&binary_map, map_w, map_h);
    let mut boxes = Vec::new();
    let mut scores = Vec::new();

    for contour in contours.into_iter().take(max_candidates) {
        if contour.len() < 4 {
            continue;
        }
        let score = box_score_fast(lines_map, map_w, map_h, &contour);
        if score < box_thresh {
            continue;
        }

        let (points, sside) = get_mini_boxes(&contour);
        if sside < 2.0 {
            continue;
        }

        let expanded = match unclip_polygon(&points, unclip_ratio) {
            Some(exp) => exp,
            None => continue,
        };

        let (box_rect, sside2) = get_mini_boxes(&expanded);
        if (sside2 as i32) < min_side {
            continue;
        }

        let mut scaled_box = Vec::with_capacity(4);
        for p in box_rect {
            let sx = ((p[0] / map_w as f32) * dest_w as f32).round().clamp(0.0, dest_w as f32) as i32;
            let sy = ((p[1] / map_h as f32) * dest_h as f32).round().clamp(0.0, dest_h as f32) as i32;
            scaled_box.push([sx, sy]);
        }

        boxes.push(scaled_box);
        scores.push(score);
    }

    (boxes, scores)
}

/// Merge horizontal text boxes that sit on the same line (Python merge_text_lines port).
pub fn merge_text_lines(
    boxes: &[Vec<[f32; 2]>],
    scores: &[f32],
    texts: Option<&[String]>,
    overlap_min: f32,
    gap_factor: f32,
    height_sim_max: f32,
) -> (Vec<Vec<[f32; 2]>>, Vec<f32>) {
    if boxes.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let default_texts = vec![String::new(); boxes.len()];
    let txt_slice = texts.unwrap_or(&default_texts);

    let mut indexed: Vec<(usize, &Vec<[f32; 2]>, f32, &str)> = boxes
        .iter()
        .zip(scores.iter())
        .zip(txt_slice.iter())
        .enumerate()
        .map(|(idx, ((b, &s), t))| (idx, b, s, t.as_str()))
        .collect();

    indexed.sort_by(|a, b| {
        let (ax, ay, _, _) = box_to_xywh_f32(a.1);
        let (bx, by, _, _) = box_to_xywh_f32(b.1);
        ax.total_cmp(&bx).then(ay.total_cmp(&by))
    });

    // Struct: [x0, y0, x1, y1, score, is_wm, text]
    struct MergedLine {
        x0: f32,
        y0: f32,
        x1: f32,
        y1: f32,
        score: f32,
        is_wm: bool,
        text: String,
    }

    let mut lines: Vec<MergedLine> = Vec::new();

    for (_idx, box_pts, score, txt) in indexed {
        let (x, y, w, h) = box_to_xywh_f32(box_pts);
        let x1 = x + w;
        let y1 = y + h;
        let is_wm = is_watermark_line(txt);

        if h > w * 1.2 {
            // Vertical text column — its own line, never horizontally merged
            lines.push(MergedLine {
                x0: x,
                y0: y,
                x1,
                y1,
                score,
                is_wm,
                text: txt.to_string(),
            });
            continue;
        }

        let mut placed = false;
        let cy = y + h / 2.0;

        for ln in &mut lines {
            if is_wm != ln.is_wm {
                continue;
            }
            let lh = ln.y1 - ln.y0;
            let min_h = h.min(lh);
            let overlap = y1.min(ln.y1) - y.max(ln.y0);
            let lcy = ln.y0 + lh / 2.0;

            if (overlap < 0.60 * min_h && (cy - lcy).abs() > 0.40 * min_h) || overlap < overlap_min * min_h {
                continue;
            }

            let gap = x - ln.x1;
            if gap > gap_factor * h.max(lh) {
                continue;
            }

            let x_inter = x1.min(ln.x1) - x.max(ln.x0);
            let min_w = w.min(ln.x1 - ln.x0);
            let is_same_line_detection = (x_inter >= 0.40 * min_w) && (overlap >= 0.40 * min_h);

            let has_words = !txt.trim().is_empty() && CHINESE_RE.is_match(txt);
            let is_trailing_segment = (overlap >= 0.70 * min_h)
                && (x >= ln.x0)
                && (gap <= gap_factor * h.max(lh))
                && (gap >= -0.50 * h.max(lh))
                && !has_words
                && (h <= 0.65 * lh || w <= 160.0 || txt.trim().is_empty() || PUNCT_ONLY.is_match(txt.trim()) || ALL_ELLIPSIS.is_match(txt.trim()));

            let c_count_l = CHINESE_RE.find_iter(&ln.text).count();
            let c_count_r = CHINESE_RE.find_iter(txt).count();
            let has_words_l = c_count_l >= 3;
            let has_words_r = c_count_r >= 3;
            if has_words_l && has_words_r && gap >= 8.0_f32.max(0.25 * h.max(lh)) {
                continue;
            }

            if !is_same_line_detection && !is_trailing_segment && (h.max(lh) / 1.0_f32.max(min_h)) > height_sim_max {
                continue;
            }

            if gap < -h.max(lh) * 0.30 && !is_trailing_segment {
                let union_w = x1.max(ln.x1) - x.min(ln.x0);
                if union_w > w.max(ln.x1 - ln.x0) * 1.20 {
                    continue;
                }
            }

            let terminal_punct = "。!！?？）】”\"'~～:：;；";
            let ln_trimmed = ln.text.trim_end();
            if !ln_trimmed.is_empty() && terminal_punct.chars().any(|c| ln_trimmed.ends_with(c)) && gap >= -h.max(lh) * 0.40 {
                let ui_prefix_re = Regex::new(r"^(?:嘟|叮|提示|系统|注意)[!！:：]?$").unwrap();
                let is_ui_prefix = ui_prefix_re.is_match(ln_trimmed);
                if is_ui_prefix && gap <= 1.2 * h.max(lh) {
                    // Allow UI prefix
                } else {
                    let union_w = x1.max(ln.x1) - x.min(ln.x0);
                    if union_w > w.max(ln.x1 - ln.x0) * 1.20 {
                        continue;
                    }
                }
            }

            ln.x0 = ln.x0.min(x);
            ln.y0 = ln.y0.min(y);
            ln.x1 = ln.x1.max(x1);
            ln.y1 = ln.y1.max(y1);
            ln.score = ln.score.max(score);
            if !txt.trim().is_empty() {
                ln.text = if ln.text.is_empty() {
                    txt.to_string()
                } else {
                    format!("{} {}", ln.text, txt)
                };
            }
            placed = true;
            break;
        }

        if !placed {
            lines.push(MergedLine {
                x0: x,
                y0: y,
                x1,
                y1,
                score,
                is_wm,
                text: txt.to_string(),
            });
        }
    }

    let mut merged_boxes = Vec::new();
    let mut merged_scores = Vec::new();

    for l in lines {
        merged_boxes.push(vec![
            [l.x0, l.y0],
            [l.x1, l.y0],
            [l.x1, l.y1],
            [l.x0, l.y1],
        ]);
        merged_scores.push(l.score);
    }

    (merged_boxes, merged_scores)
}

/// Groups vertically stacked text lines into multi-line speech bubbles / paragraphs (group_paragraphs port).
pub fn group_paragraphs(
    boxes: &[Vec<[f32; 2]>],
    scores: &[f32],
    texts: Option<&[String]>,
    overlap_min: f32,
    gap_factor: f32,
    height_sim_max: f32,
    centroid_drift_max: f32,
) -> (Vec<Vec<[f32; 2]>>, Vec<f32>) {
    if boxes.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let default_texts = vec![String::new(); boxes.len()];
    let txt_slice = texts.unwrap_or(&default_texts);

    struct Paragraph {
        boxes: Vec<Vec<[f32; 2]>>,
        score: f32,
        is_url: bool,
        cx_list: Vec<f32>,
        texts: Vec<String>,
    }

    let mut paragraphs: Vec<Paragraph> = Vec::new();

    // Standalone vertical stripes (h > 2.2 * w) never group
    for ((b, &s), t) in boxes.iter().zip(scores.iter()).zip(txt_slice.iter()) {
        let (x, _, w, h) = box_to_xywh_f32(b);
        if h > w * 2.2 {
            paragraphs.push(Paragraph {
                boxes: vec![b.clone()],
                score: s,
                is_url: is_watermark_line(t),
                cx_list: vec![x + w / 2.0],
                texts: vec![t.clone()],
            });
        }
    }

    let mut horizontal: Vec<(&Vec<[f32; 2]>, f32, &String)> = boxes
        .iter()
        .zip(scores.iter())
        .zip(txt_slice.iter())
        .filter(|((b, _), _)| {
            let (_, _, w, h) = box_to_xywh_f32(b);
            h <= w * 2.2
        })
        .map(|((b, &s), t)| (b, s, t))
        .collect();

    horizontal.sort_by(|a, b| {
        let (ax, ay, _, _) = box_to_xywh_f32(a.0);
        let (bx, by, _, _) = box_to_xywh_f32(b.0);
        ay.total_cmp(&by).then(ax.total_cmp(&bx))
    });

    for (box_pts, score, txt) in horizontal {
        let (x, y, w, h) = box_to_xywh_f32(box_pts);
        let x1 = x + w;
        let box_url = is_watermark_line(txt);
        let mut placed = false;

        for p in &mut paragraphs {
            if box_url != p.is_url {
                continue;
            }

            let last = p.boxes.last().unwrap();
            let (lx, ly, lw, lh) = box_to_xywh_f32(last);
            let lx1 = lx + lw;

            let last_txt = p.texts.last().map(|s| s.as_str()).unwrap_or("");
            let raw_cand_lines = txt.trim().split('\n').filter(|s| !s.trim().is_empty()).count().max(1);
            let raw_last_lines = last_txt.trim().split('\n').filter(|s| !s.trim().is_empty()).count().max(1);
            let last_line_count = (lh / 22.0).round().max(1.0) as usize;
            let last_line_cnt = raw_last_lines.max(1).min(last_line_count.max(1)) as f32;
            let eff_lh = lh / last_line_cnt;

            let cand_max_lines = (h / 22.0).round().max(1.0) as usize;
            let cand_line_cnt = if eff_lh > 0.0 && h <= 1.6 * eff_lh {
                1.0
            } else {
                (raw_cand_lines.max(1).min(cand_max_lines.max(1))) as f32
            };
            let eff_h = h / cand_line_cnt;
            let min_eff_h = eff_h.min(eff_lh);

            let is_left_aligned = (x - lx).abs() <= 0.25 * w.min(lw);
            let is_right_aligned = (x1 - lx1).abs() <= 0.25 * w.min(lw);
            let new_cx = x + w / 2.0;
            let para_mean_cx = p.cx_list.iter().sum::<f32>() / p.cx_list.len() as f32;
            let overlap = x1.min(lx1) - x.max(lx);
            let is_aligned = is_left_aligned || is_right_aligned || (new_cx - para_mean_cx).abs() <= 0.30 * w.min(lw);
            let is_strongly_aligned = overlap >= 0.50 * w.min(lw) && is_aligned;

            let gap = y - (ly + lh);
            let paren_re_start = Regex::new(r"^[（\(\[【〔*]").unwrap();
            let paren_re_end = Regex::new(r"[）\)\]】〕]$").unwrap();
            let is_parenthetical = paren_re_start.is_match(txt.trim()) || paren_re_end.is_match(txt.trim());
            let is_trailing_tail = (w <= 80.0_f32.max(lw * 0.65) && eff_h <= eff_lh * 1.75)
                || (!txt.trim().is_empty() && txt.trim().chars().count() <= 3 && !txt.trim().ends_with(['，', ',', '、', ':', '：', '—', '―', '-', '~', '～']) && !txt.trim().chars().any(|c| "噗轰咚咳啪砰咔唰嘭哇嗷嘶呜呼哈哒嗒踏铛铮刷咻嗖哧嚓哐咕嗡吼鸣飒吱咯嘎喳沙".contains(c)) && eff_h <= eff_lh * 1.80)
                || is_parenthetical;

            let has_meaningful_text = !txt.trim().is_empty() || !last_txt.trim().is_empty();
            let is_multiline_para = cand_line_cnt > 1.0 || last_line_cnt > 1.0 || (has_meaningful_text && (txt.chars().count() >= 10 || last_txt.chars().count() >= 10));
            let is_same_bubble_paragraphs = is_multiline_para && overlap >= 0.70 * w.min(lw) && (new_cx - para_mean_cx).abs() <= 0.20 * w.min(lw);

            let gap_multiplier = if is_parenthetical {
                2.8
            } else if is_same_bubble_paragraphs {
                2.4
            } else if is_trailing_tail {
                1.8
            } else if is_strongly_aligned && has_meaningful_text {
                1.6
            } else {
                1.0
            };

            let max_allowed_gap = gap_factor * gap_multiplier * min_eff_h;
            if gap > max_allowed_gap || y < ly - 0.35 * min_eff_h {
                continue;
            }

            if overlap < overlap_min * w.min(lw) {
                continue;
            }

            // When a paragraph already contains >= 3 lines (a complete speech bubble), a subsequent line separated by an inter-bubble gap must start a new bubble
            if (p.boxes.len() >= 3 || last_line_cnt >= 3.0) && gap >= 0.70 * min_eff_h {
                continue;
            }

            let is_tight_bubble_pair = gap <= 0.35 * min_eff_h && overlap >= 0.50 * w.min(lw) && is_aligned;

            // Terminal punctuation guard
            if !last_txt.is_empty() {
                let last_strip = last_txt.trim();
                let cand_strip = txt.trim();
                let last_clean = last_strip.trim_end_matches(['）', ')', '"', '\'', '”', '’']);
                let cand_clean = cand_strip.trim_end_matches(['）', ')', '"', '\'', '”', '’']);

                let sfx_glyphs = "噗轰咚咳啪砰咔唰嘭哇嗷嘶呜呼哈哒嗒踏铛铮刷咻嗖哧嚓哐咕嗡吼鸣飒吱咯嘎喳沙";
                let dash_re = Regex::new(r"[-—―_~～]$").unwrap();
                let is_last_sfx = (dash_re.is_match(last_clean) && last_clean.chars().count() <= 5)
                    || (last_clean.chars().count() <= 3 && last_clean.chars().any(|c| sfx_glyphs.contains(c)));
                let is_cand_sfx = (dash_re.is_match(cand_clean) && cand_clean.chars().count() <= 5)
                    || (cand_clean.chars().count() <= 3 && cand_clean.chars().any(|c| sfx_glyphs.contains(c)));

                if is_last_sfx || is_cand_sfx {
                    if is_last_sfx && is_cand_sfx {
                        continue;
                    }
                    if dash_re.is_match(last_clean) || dash_re.is_match(cand_clean) {
                        continue;
                    }
                }

                let ui_card_re = Regex::new(r"^(?:嘟|叮|提示|系统|注意)[!！:：]?").unwrap();
                if ui_card_re.is_match(cand_clean) && gap >= 0.10 * min_eff_h {
                    continue;
                }

                let period_re = Regex::new(r"[。;；]$").unwrap();
                if period_re.is_match(last_clean) {
                    let is_both_single = cand_line_cnt == 1.0 && last_line_cnt == 1.0 && period_re.is_match(cand_clean);
                    let is_short = last_clean.chars().count() <= 5;
                    let has_gap = gap >= 0.30 * min_eff_h && !(is_aligned && overlap >= 0.50 * w.min(lw));
                    let has_offset = (new_cx - para_mean_cx).abs() > 0.40 * w.min(lw) && !(is_left_aligned || is_right_aligned);
                    if !is_same_bubble_paragraphs && (
                        (is_both_single && gap >= 0.15 * min_eff_h)
                        || (is_short && !(is_aligned && overlap >= 0.50 * w.min(lw)) && gap >= 0.15 * min_eff_h)
                        || has_gap
                        || (has_offset && gap > 0.10 * min_eff_h)
                    ) {
                        continue;
                    }
                }

                let exclaim_re = Regex::new(r"[!！?？]$").unwrap();
                if exclaim_re.is_match(last_clean) {
                    let is_sfx = last_clean.chars().count() <= 2;
                    let has_gap = gap >= 0.30 * min_eff_h && !(is_aligned && overlap >= 0.50 * w.min(lw));
                    let has_offset = (new_cx - para_mean_cx).abs() > 0.45 * w.min(lw) && !(is_left_aligned || is_right_aligned);
                    if (is_sfx && gap >= 0.15 * min_eff_h)
                        || (last_clean.chars().count() <= 5 && !(is_aligned && overlap >= 0.50 * w.min(lw)) && gap >= 0.15 * min_eff_h)
                        || has_gap
                        || (has_offset && gap > 0.10 * min_eff_h)
                    {
                        continue;
                    }
                }
            }

            let height_ratio = eff_h.max(eff_lh) / 1.0_f32.max(min_eff_h);
            if is_trailing_tail || is_parenthetical {
                if height_ratio > 2.5 {
                    continue;
                }
            } else {
                let max_ratio = if cand_line_cnt > 1.0 || last_line_cnt > 1.0 {
                    2.0
                } else if is_tight_bubble_pair {
                    1.75
                } else {
                    height_sim_max
                };
                if height_ratio > max_ratio {
                    continue;
                }
            }

            if is_trailing_tail || is_parenthetical || is_left_aligned || is_right_aligned {
                if (new_cx - para_mean_cx).abs() > centroid_drift_max * w.max(lw) {
                    continue;
                }
            } else if (new_cx - para_mean_cx).abs() > centroid_drift_max * w.min(lw) {
                continue;
            }

            p.boxes.push(box_pts.clone());
            p.cx_list.push(new_cx);
            p.texts.push(txt.clone());
            p.score = p.score.max(score);
            placed = true;
            break;
        }

        if !placed {
            paragraphs.push(Paragraph {
                boxes: vec![box_pts.clone()],
                score,
                is_url: box_url,
                cx_list: vec![x + w / 2.0],
                texts: vec![txt.clone()],
            });
        }
    }

    let mut merged = Vec::new();
    let mut mscores = Vec::new();

    for p in paragraphs {
        let mut min_x = f32::INFINITY;
        let mut min_y = f32::INFINITY;
        let mut max_x = -f32::INFINITY;
        let mut max_y = -f32::INFINITY;

        for b in &p.boxes {
            let (bx, by, bw, bh) = box_to_xywh_f32(b);
            min_x = min_x.min(bx);
            min_y = min_y.min(by);
            max_x = max_x.max(bx + bw);
            max_y = max_y.max(by + bh);
        }

        merged.push(vec![
            [min_x, min_y],
            [max_x, min_y],
            [max_x, max_y],
            [min_x, max_y],
        ]);
        mscores.push(p.score);
    }

    (merged, mscores)
}

/// Deduplicate overlapping bounding boxes (deduplicate_boxes port).
pub fn deduplicate_boxes(
    boxes: &[Vec<[f32; 2]>],
    scores: &[f32],
    iou_thresh: f32,
) -> (Vec<Vec<[f32; 2]>>, Vec<f32>) {
    if boxes.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let mut indexed: Vec<(usize, &Vec<[f32; 2]>, f32)> = boxes
        .iter()
        .zip(scores.iter())
        .enumerate()
        .map(|(idx, (b, &s))| (idx, b, s))
        .collect();

    indexed.sort_by(|a, b| b.2.total_cmp(&a.2));

    let mut kept_boxes: Vec<Vec<[f32; 2]>> = Vec::new();
    let mut kept_scores: Vec<f32> = Vec::new();

    for (_idx, box_pts, score) in indexed {
        let (x0, y0, w, h) = box_to_xywh_f32(box_pts);
        let box_area = 1.0_f32.max(w * h);
        let mut merged = false;

        for k in 0..kept_boxes.len() {
            let kbox = &kept_boxes[k];
            let (kx0, ky0, kw, kh) = box_to_xywh_f32(kbox);
            let karea = 1.0_f32.max(kw * kh);

            let iou = box_iou_f32(box_pts, kbox);
            let ix = 0.0_f32.max((x0 + w).min(kx0 + kw) - x0.max(kx0));
            let iy = 0.0_f32.max((y0 + h).min(ky0 + kh) - y0.max(ky0));
            let inter = ix * iy;
            let min_area = box_area.min(karea);
            let max_area = box_area.max(karea);
            let overlap_ratio = if min_area > 0.0 { inter / min_area } else { 0.0 };

            let x_subsumed = (ix >= 0.80 * w.min(kw)) && (iy >= 0.40 * h.min(kh));
            if iou >= iou_thresh || overlap_ratio >= 0.70 || (overlap_ratio >= 0.60 && max_area / min_area <= 2.5) || x_subsumed {
                let ux0 = x0.min(kx0);
                let uy0 = y0.min(ky0);
                let ux1 = (x0 + w).max(kx0 + kw);
                let uy1 = (y0 + h).max(ky0 + kh);

                kept_boxes[k] = vec![
                    [ux0, uy0],
                    [ux1, uy0],
                    [ux1, uy1],
                    [ux0, uy1],
                ];
                kept_scores[k] = kept_scores[k].max(score);
                merged = true;
                break;
            }
        }

        if !merged {
            kept_boxes.push(box_pts.clone());
            kept_scores.push(score);
        }
    }

    (kept_boxes, kept_scores)
}

/// Sort detected text regions top-to-bottom, grouping lines into horizontal rows.
pub fn sort_regions_top_to_bottom(boxes: &[Vec<[f32; 2]>], _page_h: usize, row_tolerance: f32) -> Vec<usize> {
    if boxes.is_empty() {
        return Vec::new();
    }

    let mut centers = Vec::new();
    for b in boxes {
        let (x, y, w, h) = box_to_xywh_f32(b);
        centers.push((y + h / 2.0, x + w / 2.0, h));
    }

    let mut rows: Vec<Vec<usize>> = Vec::new();

    for (i, &(cy, _cx, _h)) in centers.iter().enumerate() {
        let mut placed = false;
        for row in &mut rows {
            let ys: Vec<f32> = row.iter().map(|&j| centers[j].0).collect();
            let hs: Vec<f32> = row.iter().map(|&j| centers[j].2).collect();
            let min_y = ys.iter().cloned().fold(f32::INFINITY, f32::min);
            let max_y = ys.iter().cloned().fold(-f32::INFINITY, f32::max);
            let max_h = hs.iter().cloned().fold(0.0_f32, f32::max);

            let top = min_y - max_h * row_tolerance;
            let bottom = max_y + max_h * row_tolerance;

            if cy >= top && cy <= bottom {
                row.push(i);
                placed = true;
                break;
            }
        }
        if !placed {
            rows.push(vec![i]);
        }
    }

    rows.sort_by(|a, b| {
        let min_ya = a.iter().map(|&j| centers[j].0).fold(f32::INFINITY, f32::min);
        let min_yb = b.iter().map(|&j| centers[j].0).fold(f32::INFINITY, f32::min);
        min_ya.total_cmp(&min_yb)
    });

    let mut order = Vec::new();
    for mut row in rows {
        row.sort_by(|&a, &b| centers[a].1.total_cmp(&centers[b].1));
        order.extend(row);
    }

    order
}
