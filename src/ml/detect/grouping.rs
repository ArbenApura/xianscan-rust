use regex::Regex;
use crate::ml::geometry::{box_iou_f32, box_to_xywh_f32};
use super::text_clean::{is_watermark_line, ALL_ELLIPSIS, CHINESE_RE, PUNCT_ONLY};

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
