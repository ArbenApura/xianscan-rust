use image::DynamicImage;
use crate::ml::detect::{
    clean_stray_ocr_artifacts, has_alphanumeric_characters, has_cjk_characters,
    is_standalone_alphanumeric_without_cjk, PUNCT_ONLY,
};
use crate::ml::ocr::RapidOcr;
use crate::ml::schemas::{BoxRect, Region};

pub fn post_process_regions(
    ocr: &mut Option<RapidOcr>,
    img: &DynamicImage,
    regions: Vec<Region>,
    page_w: u32,
    page_h: u32,
    is_cjk: bool,
    is_latin: bool,
    source_lang: Option<&str>,
) -> Vec<Region> {
    let mut final_regions: Vec<Region> = Vec::new();

    // 1. Lone punctuation merging into preceding region
    for r in regions {
        let r_strip = r.text.trim();
        let is_lone_punct = PUNCT_ONLY.is_match(r_strip);
        let is_vert_stroke = ["一", "1", "丨", "I", "l", "|", "！", "!"].contains(&r_strip);

        if !final_regions.is_empty() && (is_lone_punct || is_vert_stroke) {
            let prev = final_regions.last_mut().unwrap();
            let v_gap = r.box_.y - (prev.box_.y + prev.box_.h);
            let x_overlap = (r.box_.x + r.box_.w).min(prev.box_.x + prev.box_.w) - r.box_.x.max(prev.box_.x);

            if v_gap >= 0 && v_gap <= 150 && x_overlap >= 0 {
                let p_text = prev.text.trim_end();
                let append_t = if is_vert_stroke && ["一", "1", "丨", "I", "l", "|"].contains(&r_strip) {
                    "！"
                } else {
                    r_strip
                };
                prev.text = format!("{}{}", p_text, append_t);
                prev.box_.w = (prev.box_.x + prev.box_.w).max(r.box_.x + r.box_.w) - prev.box_.x.min(r.box_.x);
                prev.box_.h = (prev.box_.y + prev.box_.h).max(r.box_.y + r.box_.h) - prev.box_.y.min(r.box_.y);
                prev.box_.x = prev.box_.x.min(r.box_.x);
                prev.box_.y = prev.box_.y.min(r.box_.y);
                prev.polygon = vec![
                    [prev.box_.x, prev.box_.y],
                    [prev.box_.x + prev.box_.w, prev.box_.y],
                    [prev.box_.x + prev.box_.w, prev.box_.y + prev.box_.h],
                    [prev.box_.x, prev.box_.y + prev.box_.h],
                ];
                continue;
            }
        }
        final_regions.push(r);
    }

    // 1b. Duplicate / Subsumed Sub-Box Deduplication
    let mut deduped_regions: Vec<Region> = Vec::new();
    for r in final_regions {
        let r_text = r.text.trim();
        let mut is_subsumed = false;

        for existing in &mut deduped_regions {
            let ex_text = existing.text.trim();
            let x_overlap = ((r.box_.x + r.box_.w).min(existing.box_.x + existing.box_.w) - r.box_.x.max(existing.box_.x)).max(0);
            let y_overlap = ((r.box_.y + r.box_.h).min(existing.box_.y + existing.box_.h) - r.box_.y.max(existing.box_.y)).max(0);
            let min_w = r.box_.w.min(existing.box_.w);
            let min_h = r.box_.h.min(existing.box_.h);

            let x_ratio = x_overlap as f32 / min_w as f32;
            let y_ratio = y_overlap as f32 / min_h as f32;

            let is_exact = r_text == ex_text;
            let is_sub = ex_text.contains(r_text) && ex_text.chars().count() > r_text.chars().count();
            let is_sup = r_text.contains(ex_text) && r_text.chars().count() > ex_text.chars().count();
            let is_spatial_dup = (x_ratio >= 0.50 && y_ratio >= 0.50) || (x_ratio >= 0.70 && y_ratio >= 0.35) || (y_ratio >= 0.70 && x_ratio >= 0.35);

            if is_spatial_dup || (is_sub && x_ratio >= 0.40 && y_ratio >= 0.30) || (is_exact && x_ratio >= 0.40 && y_ratio >= 0.30) {
                let r_chars = r_text.chars().count();
                let ex_chars = ex_text.chars().count();
                let x0 = existing.box_.x.min(r.box_.x);
                let y0 = existing.box_.y.min(r.box_.y);
                let x1 = (existing.box_.x + existing.box_.w).max(r.box_.x + r.box_.w);
                let y1 = (existing.box_.y + existing.box_.h).max(r.box_.y + r.box_.h);
                existing.box_ = BoxRect { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
                existing.polygon = vec![
                    [x0, y0], [x1, y0], [x1, y1], [x0, y1],
                ];
                if r_chars > ex_chars || (r_chars == ex_chars && r.confidence > existing.confidence) || is_sup {
                    existing.text = r.text.clone();
                    existing.confidence = r.confidence;
                }
                is_subsumed = true;
                break;
            }
        }

        if !is_subsumed {
            deduped_regions.push(r);
        }
    }
    final_regions = deduped_regions;

    // 2. Post-merge: unify split double-cloud speech bubble monologues and narration blocks
    loop {
        let n = final_regions.len();
        let mut merged_pair: Option<(usize, usize)> = None;

        'outer: for i in 0..n {
            for j in (i + 1)..n {
                let a = &final_regions[i];
                let b = &final_regions[j];

                // Skip SFX/short-punctuation regions (they should never be merged here)
                let a_strip = a.text.trim();
                let b_strip = b.text.trim();
                let sfx_glyphs = "噗轰咚咳啪砰咔唰嘭哇嗷嘶呜呼哈哒嗒踏铛铮刷咻嗖哧嚓哐咕嗡吼鸣飒吱咯嘎喳沙";
                let a_is_sfx = (a_strip.chars().count() <= 4 && !a_strip.contains('\n') && (
                    PUNCT_ONLY.is_match(a_strip)
                    || a_strip.ends_with(['—', '―', '-', '~', '～', '!', '！'])
                    || a_strip.chars().any(|c| sfx_glyphs.contains(c))
                )) || (a_strip.chars().count() <= 5 && a_strip.ends_with(['—', '―', '-', '~', '～']));

                let b_is_sfx = (b_strip.chars().count() <= 4 && !b_strip.contains('\n') && (
                    PUNCT_ONLY.is_match(b_strip)
                    || b_strip.ends_with(['—', '―', '-', '~', '～', '!', '！'])
                    || b_strip.chars().any(|c| sfx_glyphs.contains(c))
                )) || (b_strip.chars().count() <= 5 && b_strip.ends_with(['—', '―', '-', '~', '～']));

                if a_is_sfx || b_is_sfx {
                    continue;
                }

                // Identify top vs bottom region
                let (ti, bi) = if a.box_.y <= b.box_.y { (i, j) } else { (j, i) };
                let top = &final_regions[ti];
                let bot = &final_regions[bi];

                let top_lines = top.text.split('\n').filter(|s| !s.trim().is_empty()).count();
                let bot_lines = bot.text.split('\n').filter(|s| !s.trim().is_empty()).count();
                let top_ends_with_terminal = top.text.trim().ends_with(['！', '!', '？', '?', '。']);

                let page_w_i = page_w as i32;
                let top_is_narration = top.box_.w >= page_w_i / 3
                    && !top.text.trim().starts_with(['！', '？', '诶', '嗖', '砰', '哒', '轰', '噗']);
                let bot_is_narration = bot.box_.w >= page_w_i / 3
                    && !bot.text.trim().starts_with(['！', '？', '诶', '嗖', '砰', '哒', '轰', '噗']);
                let is_both_narration = top_is_narration && bot_is_narration;

                // Dialogue Speech Invariant:
                // Distinct multi-line speech bubbles (>= 2 lines in both, or >= 3 lines in either)
                // represent independent dialogue utterances and must never be post-merged across bubbles.
                // Similarly, dialogue speeches ending with terminal punctuation (。！？) must not merge into the next bubble unless it's a tight continuous sentence in the same bubble.
                let x_lo_pre = top.box_.x.max(bot.box_.x);
                let x_hi_pre = (top.box_.x + top.box_.w).min(bot.box_.x + bot.box_.w);
                let x_overlap_pre = x_hi_pre - x_lo_pre;
                let min_w_pre = top.box_.w.min(bot.box_.w);
                let top_cx_pre = top.box_.x + top.box_.w / 2;
                let bot_cx_pre = bot.box_.x + bot.box_.w / 2;
                let is_same_bubble_continuation = !top_ends_with_terminal
                    && top_lines <= 1 && bot_lines <= 1
                    && x_overlap_pre >= min_w_pre * 3 / 5
                    && (top_cx_pre - bot_cx_pre).abs() <= min_w_pre * 2 / 5
                    && (bot.box_.y - (top.box_.y + top.box_.h)) <= ((top.box_.h + bot.box_.h) / 2) * 2 / 5;

                if !is_both_narration && !is_same_bubble_continuation {
                    if (top_lines >= 2 && bot_lines >= 2) || top_lines >= 2 || bot_lines >= 2 || top_ends_with_terminal {
                        continue;
                    }
                }

                let v_gap = bot.box_.y - (top.box_.y + top.box_.h);
                if v_gap < 0 {
                    // Overlapping vertically — skip (dedup already handled this)
                    continue;
                }

                let avg_h = (top.box_.h + bot.box_.h) / 2;

                // Wide (>1/3 page width) non-dialogue blocks get a relaxed gap limit
                // to allow narration blocks split by dark panel borders to merge.
                let gap_limit = if is_both_narration {
                    avg_h  // narration blocks: allow gap up to 100% of avg height
                } else {
                    avg_h * 9 / 20  // speech bubbles: gap <= 45% of avg height
                };

                // Side-by-side / column-split speech bubble check (e.g. 2-column vertical text inside same bubble)
                let is_side_by_side_bubble = {
                    let (left, right) = if a.box_.x <= b.box_.x { (a, b) } else { (b, a) };
                    let h_gap = right.box_.x - (left.box_.x + left.box_.w);
                    let v_inter_top = left.box_.y.max(right.box_.y);
                    let v_inter_bot = (left.box_.y + left.box_.h).min(right.box_.y + right.box_.h);
                    let v_inter = v_inter_bot - v_inter_top;
                    let min_h = left.box_.h.min(right.box_.h);
                    let v_overlap_ratio = v_inter.max(0) as f32 / min_h.max(1) as f32;
                    let same_bubble_bounds = (left.box_.w + right.box_.w <= 240) && (left.box_.h.max(right.box_.h) <= 150);
                    let both_short_utterance = top_lines <= 2 && bot_lines <= 2 && !top_ends_with_terminal;
                    (h_gap >= -30 && h_gap <= 25) && v_overlap_ratio >= 0.50 && same_bubble_bounds && both_short_utterance
                };

                if is_side_by_side_bubble {
                    let (first_i, second_i) = if a.box_.x <= b.box_.x { (i, j) } else { (j, i) };
                    merged_pair = Some((first_i, second_i));
                    break 'outer;
                }

                if v_gap > gap_limit {
                    continue;
                }

                // Horizontal overlap check: >= 35% of the narrower region's width
                let x_lo = top.box_.x.max(bot.box_.x);
                let x_hi = (top.box_.x + top.box_.w).min(bot.box_.x + bot.box_.w);
                let x_overlap = x_hi - x_lo;
                let min_w = top.box_.w.min(bot.box_.w);
                if x_overlap < min_w * 7 / 20 {
                    continue;
                }

                // X-centroid alignment check: <= 55% of the narrower width
                let top_cx = top.box_.x + top.box_.w / 2;
                let bot_cx = bot.box_.x + bot.box_.w / 2;
                if (top_cx - bot_cx).abs() > min_w * 11 / 20 {
                    continue;
                }

                merged_pair = Some((ti, bi));
                break 'outer;
            }
        }

        match merged_pair {
            None => break,
            Some((ti, bi)) => {
                let b_removed = final_regions.remove(bi);
                let a = &mut final_regions[ti];
                let mx  = a.box_.x.min(b_removed.box_.x);
                let my  = a.box_.y.min(b_removed.box_.y);
                let mx2 = (a.box_.x + a.box_.w).max(b_removed.box_.x + b_removed.box_.w);
                let my2 = (a.box_.y + a.box_.h).max(b_removed.box_.y + b_removed.box_.h);
                a.box_   = BoxRect { x: mx, y: my, w: mx2 - mx, h: my2 - my };
                a.polygon = vec![
                    [mx, my], [mx2, my], [mx2, my2], [mx, my2],
                ];

                let pad_x = 25;
                let pad_y = 20;
                let crop_x = (mx - pad_x).max(0) as u32;
                let crop_y = (my - pad_y).max(0) as u32;
                let crop_w = ((mx2 - mx + pad_x * 2) as u32).min(page_w - crop_x);
                let crop_h = ((my2 - my + pad_y * 2) as u32).min(page_h - crop_y);

                let total_chars = a.text.chars().count() + b_removed.text.chars().count();
                let is_vert_merge = is_cjk && (a.vertical || b_removed.vertical || a.box_.h > a.box_.w);
                let fallback_text = if is_vert_merge && (b_removed.box_.x > a.box_.x) {
                    format!("{}\n{}", b_removed.text.trim(), a.text.trim())
                } else {
                    format!("{}\n{}", a.text.trim(), b_removed.text.trim())
                };
                let mut unified_text = None;
                if crop_w >= 16 && crop_h >= 16 {
                    let crop = img.crop_imm(crop_x, crop_y, crop_w, crop_h);
                    if let Some(ref mut o) = ocr {
                        if let Ok(Some(res)) = o.recognize_crop_with_lang(&crop, source_lang) {
                            let clean_c = clean_stray_ocr_artifacts(&res.text);
                            if clean_c.chars().count() > total_chars || (clean_c.chars().count() >= total_chars && clean_c.contains('\n')) {
                                unified_text = Some(clean_c);
                            }
                        }
                    }
                }

                if let Some(ut) = unified_text {
                    a.text = ut;
                } else {
                    a.text = fallback_text;
                }
            }
        }
    }

    // 3. Final language-specific filtering pass
    let mut final_regions: Vec<Region> = final_regions
        .into_iter()
        .filter(|r| {
            let text = r.text.trim();
            if text.is_empty() {
                return false;
            }
            if is_cjk && is_standalone_alphanumeric_without_cjk(text) {
                return false;
            }
            if is_latin && has_cjk_characters(text) && !has_alphanumeric_characters(text) {
                return false;
            }
            true
        })
        .collect();

    // 4. Re-index region IDs
    for (idx, r) in final_regions.iter_mut().enumerate() {
        r.id = format!("r{}", idx);
    }

    final_regions
}
