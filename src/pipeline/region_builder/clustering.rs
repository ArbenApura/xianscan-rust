// -- CRATE / EXTERNAL IMPORTS -- //
// (NO EXTERNAL CRATES NEEDED DIRECTLY)

// -- INTERNAL IMPORTS -- //
use crate::ml::geometry::polygon_bounds;
use crate::ml::ocr::OcrLine;

// -- FUNCTIONS & ALGORITHMS -- //

pub fn polygon_thickness(poly: &[[i32; 2]]) -> f32 {
    if poly.len() >= 4 {
        let dx01 = (poly[1][0] - poly[0][0]) as f32;
        let dy01 = (poly[1][1] - poly[0][1]) as f32;
        let len01 = (dx01 * dx01 + dy01 * dy01).sqrt();

        let dx12 = (poly[2][0] - poly[1][0]) as f32;
        let dy12 = (poly[2][1] - poly[1][1]) as f32;
        let len12 = (dx12 * dx12 + dy12 * dy12).sqrt();

        len01.min(len12).max(10.0)
    } else {
        let (_, _, _, lh) = polygon_bounds(poly);
        lh as f32
    }
}

pub fn cluster_lines_into_utterances<'a>(
    lines: &[&'a OcrLine],
    is_cjk: bool,
    is_vertical: bool,
    sin_a: f32,
    cos_a: f32,
) -> Vec<Vec<&'a OcrLine>> {
    if lines.len() <= 1 || !is_cjk {
        return vec![lines.to_vec()];
    }

    // PRECOMPUTE GEOMETRY & THICKNESS PER LINE ONCE (O(N))
    struct LineMeta<'a> {
        line: &'a OcrLine,
        bounds: (i32, i32, i32, i32),
        thickness: f32,
    }

    let metas: Vec<LineMeta<'a>> = lines
        .iter()
        .map(|&l| LineMeta {
            line: l,
            bounds: polygon_bounds(&l.polygon),
            thickness: polygon_thickness(&l.polygon),
        })
        .collect();

    let mut all_th: Vec<f32> = metas.iter().map(|m| m.thickness).collect();
    all_th.sort_by(|a, b| a.total_cmp(b));
    let median_th = all_th[all_th.len() / 2].max(8.0);

    // 1. VERTICAL TBRL CLUSTERING FOR JAPANESE / CJK
    if is_vertical {
        // FOR VERTICAL BUBBLES: MULTI-COLUMN BUBBLES SHARE Y-OVERLAP AND COHESIVE BOUNDS.
        // IF LINES NATURALLY FORM DISTINCT VERTICAL UTTERANCE CLUSTERS (Y-GAP >= 1.5 * median_th AND OVERLAP_Y == 0),
        // SPLIT THEM; OTHERWISE PRESERVE THE UNIFIED MULTI-COLUMN CONTAINER.
        let mut sorted_v = metas;
        sorted_v.sort_by(|a, b| {
            let (ax, ay, aw, _) = a.bounds;
            let (bx, by, bw, _) = b.bounds;
            let a_rx = (ax + aw / 2) as f32 * cos_a + (ay) as f32 * sin_a;
            let b_rx = (bx + bw / 2) as f32 * cos_a + (by) as f32 * sin_a;
            b_rx.total_cmp(&a_rx).then_with(|| ay.cmp(&by))
        });

        // SPATIAL Y-CONNECTED COMPONENT CLUSTERING FOR VERTICAL UTTERANCES
        let mut vert_clusters: Vec<Vec<&'a OcrLine>> = Vec::new();
        for m in sorted_v {
            let (lx, ly, lw, lh) = m.bounds;
            let mut merged_indices: Vec<usize> = Vec::new();
            for (c_idx, cluster) in vert_clusters.iter().enumerate() {
                let connects = cluster.iter().any(|c_line| {
                    let (cx, cy, cw, ch) = polygon_bounds(&c_line.polygon);
                    let overlap_y = (ly + lh).min(cy + ch) - ly.max(cy);
                    let vert_gap = if ly >= cy + ch { ly - (cy + ch) } else if cy >= ly + lh { cy - (ly + lh) } else { 0 };
                    let horiz_gap = if lx >= cx + cw { lx - (cx + cw) } else if cx >= lx + lw { cx - (lx + lw) } else { 0 };
                    let max_horiz_gap = (median_th * 1.80).max(24.0) as i32;
                    let max_vert_gap = (median_th * 0.80).max(12.0) as i32;

                    (overlap_y > 0 && horiz_gap <= max_horiz_gap) || (vert_gap <= max_vert_gap && horiz_gap <= max_horiz_gap)
                });
                if connects {
                    merged_indices.push(c_idx);
                }
            }

            if merged_indices.is_empty() {
                vert_clusters.push(vec![m.line]);
            } else {
                let first = merged_indices[0];
                vert_clusters[first].push(m.line);
                for &other in merged_indices.iter().skip(1).rev() {
                    let other_lines = vert_clusters.remove(other);
                    vert_clusters[first].extend(other_lines);
                }
            }
        }

        let mut final_vert_utterances: Vec<Vec<&'a OcrLine>> = Vec::new();
        for cluster in vert_clusters {
            if cluster.len() <= 1 {
                final_vert_utterances.push(cluster);
                continue;
            }

            // SORT LINES IN READING ORDER: TOP-TO-BOTTOM (Y ASCENDING)
            let mut col_sorted = cluster;
            col_sorted.sort_by_key(|l| polygon_bounds(&l.polygon).1);

            let mut sub_cluster: Vec<&'a OcrLine> = Vec::new();
            let mut sub_cluster_max_bot: Option<f32> = None;
            let mut prev_text = String::new();

            for l in col_sorted {
                let (_, ly, _, lh) = polygon_bounds(&l.polygon);
                let curr_top_y = ly as f32;
                let curr_bot_y = (ly + lh) as f32;

                if let Some(max_bot) = sub_cluster_max_bot {
                    let vert_gap = curr_top_y - max_bot;
                    let ends_with_term = prev_text.ends_with('！')
                        || prev_text.ends_with('!')
                        || prev_text.ends_with('？')
                        || prev_text.ends_with('?')
                        || prev_text.ends_with('。')
                        || prev_text.ends_with('…')
                        || prev_text.ends_with("..")
                        || prev_text.ends_with('」')
                        || prev_text.ends_with('』')
                        || prev_text.ends_with('）')
                        || prev_text.ends_with("んだ…");

                    let is_vert_lobe_split = vert_gap >= (median_th * 1.35).max(22.0)
                        || (ends_with_term && vert_gap >= (median_th * 0.45).max(6.0));

                    if is_vert_lobe_split && !sub_cluster.is_empty() {
                        final_vert_utterances.push(sub_cluster);
                        sub_cluster = Vec::new();
                        sub_cluster_max_bot = None;
                    }
                }

                sub_cluster.push(l);
                sub_cluster_max_bot = Some(sub_cluster_max_bot.map_or(curr_bot_y, |b| b.max(curr_bot_y)));
                prev_text = l.text.trim().to_string();
            }

            if !sub_cluster.is_empty() {
                final_vert_utterances.push(sub_cluster);
            }
        }

        if final_vert_utterances.len() >= 2 {
            return final_vert_utterances;
        } else {
            return vec![lines.to_vec()];
        }
    }

    let mut sorted_lines: Vec<&'a OcrLine> = lines.to_vec();
    sorted_lines.sort_by(|a, b| {
        let (ax, ay, aw, ah) = polygon_bounds(&a.polygon);
        let (bx, by, bw, bh) = polygon_bounds(&b.polygon);
        let a_my = -(ax + aw / 2) as f32 * sin_a + (ay + ah / 2) as f32 * cos_a;
        let b_my = -(bx + bw / 2) as f32 * sin_a + (by + bh / 2) as f32 * cos_a;
        a_my.total_cmp(&b_my)
    });

    let mut rows: Vec<Vec<&'a OcrLine>> = Vec::new();
    for l in sorted_lines {
        let (lx, ly, lw, _) = polygon_bounds(&l.polygon);
        let l_th = polygon_thickness(&l.polygon);
        let l_rot_y = -(lx + lw / 2) as f32 * sin_a + (ly + l_th as i32 / 2) as f32 * cos_a;
        let mut placed = false;
        for row in rows.iter_mut() {
            let (rx, ry, rw, _) = polygon_bounds(&row[0].polygon);
            let r_th = polygon_thickness(&row[0].polygon);
            let r_rot_y = -(rx + rw / 2) as f32 * sin_a + (ry + r_th as i32 / 2) as f32 * cos_a;
            let threshold = (l_th.min(r_th) * 0.45).max(4.0);
            if (l_rot_y - r_rot_y).abs() <= threshold {
                row.push(l);
                placed = true;
                break;
            }
        }
        if !placed {
            rows.push(vec![l]);
        }
    }

    // 2. CHECK FOR SIDE-BY-SIDE ADJACENT BUBBLE COLUMNS IN CJK DIALOGUE
    let mut has_side_by_side = false;
    for r in &rows {
        if r.len() >= 2 {
            let mut sorted_r = r.clone();
            sorted_r.sort_by_key(|s| polygon_bounds(&s.polygon).0);
            for i in 0..sorted_r.len() - 1 {
                let (ax, _, aw, _) = polygon_bounds(&sorted_r[i].polygon);
                let (bx, _, _, _) = polygon_bounds(&sorted_r[i + 1].polygon);
                let col_gap = (aw as f32 * 0.70).max(6.0) as i32;
                if bx - (ax + aw) >= col_gap {
                    has_side_by_side = true;
                    break;
                }
            }
        }
    }

    if has_side_by_side {
        let mut clusters: Vec<Vec<&'a OcrLine>> = Vec::new();
        for &l in lines {
            let (lx, ly, lw, lh) = polygon_bounds(&l.polygon);
            let mut merged_indices: Vec<usize> = Vec::new();
            for (c_idx, cluster) in clusters.iter().enumerate() {
                let connects = cluster.iter().any(|c_line| {
                    let (cx, cy, cw, ch) = polygon_bounds(&c_line.polygon);
                    let overlap_x = (lx + lw).min(cx + cw) - lx.max(cx);
                    let min_w = lw.min(cw);
                    let vert_gap = if ly >= cy + ch { ly - (cy + ch) } else if cy >= ly + lh { cy - (ly + lh) } else { 0 };
                    let horiz_overlap_ratio = overlap_x as f32 / min_w.max(1) as f32;
                    horiz_overlap_ratio >= 0.35 && vert_gap <= (lh.max(ch) as f32 * 1.5) as i32
                });
                if connects {
                    merged_indices.push(c_idx);
                }
            }

            if merged_indices.is_empty() {
                clusters.push(vec![l]);
            } else {
                let first = merged_indices[0];
                clusters[first].push(l);
                for &other in merged_indices.iter().skip(1).rev() {
                    let other_lines = clusters.remove(other);
                    clusters[first].extend(other_lines);
                }
            }
        }
        if clusters.len() >= 2 {
            return clusters;
        }
    }

    // 3. CHECK FOR VERTICAL PARAGRAPH GAPS AND SENTENCE BOUNDARIES BETWEEN ROWS
    let mut paragraph_clusters: Vec<Vec<&'a OcrLine>> = Vec::new();
    let mut current_cluster: Vec<&'a OcrLine> = Vec::new();

    for (r_idx, row) in rows.iter().enumerate() {
        if r_idx > 0 {
            let prev_row = &rows[r_idx - 1];
            let prev_max_y = prev_row.iter().map(|l| {
                let (lx, ly, lw, _lh) = polygon_bounds(&l.polygon);
                let l_th = polygon_thickness(&l.polygon);
                -(lx + lw / 2) as f32 * sin_a + (ly + l_th as i32) as f32 * cos_a
            }).fold(f32::MIN, f32::max);

            let curr_min_y = row.iter().map(|l| {
                let (lx, ly, lw, _) = polygon_bounds(&l.polygon);
                -(lx + lw / 2) as f32 * sin_a + ly as f32 * cos_a
            }).fold(f32::MAX, f32::min);

            let prev_row_text = prev_row.iter().map(|l| l.text.trim()).collect::<Vec<_>>().join("");
            let ends_with_punct = prev_row_text.ends_with('！')
                || prev_row_text.ends_with('!')
                || prev_row_text.ends_with('？')
                || prev_row_text.ends_with('?')
                || prev_row_text.ends_with('。')
                || prev_row_text.ends_with('…')
                || prev_row_text.ends_with("..");

            let prev_height = prev_row.iter().map(|l| {
                let (_, _, _, lh) = polygon_bounds(&l.polygon);
                lh as f32
            }).fold(f32::MIN, f32::max);

            let curr_height = row.iter().map(|l| {
                let (_, _, _, lh) = polygon_bounds(&l.polygon);
                lh as f32
            }).fold(f32::MIN, f32::max);

            let vert_gap = curr_min_y - prev_max_y;
            let is_caption_to_title = prev_height > 0.0 && curr_height >= prev_height * 1.60 && vert_gap >= (prev_height * 0.20).max(4.0);
            let curr_row_text = row.iter().map(|l| l.text.trim()).collect::<Vec<_>>().join("");
            let is_repeated_bracketed_tag = (prev_row_text.starts_with('[') || prev_row_text.starts_with('【'))
                && (curr_row_text.starts_with('[') || curr_row_text.starts_with('【'))
                && vert_gap >= (prev_height * 0.35).max(6.0);
            let min_line_h = prev_height.min(curr_height);
            let is_standalone_line_rank_split = prev_row.len() == 1
                && row.len() == 1
                && min_line_h >= 20.0
                && vert_gap >= (min_line_h * 0.60).max(15.0)
                && (prev_row_text.ends_with("弟子") || prev_row_text.ends_with("阶") || prev_row_text.ends_with("级") || prev_row_text.ends_with("层") || prev_row_text.ends_with("段") || prev_row_text.ends_with("境") || prev_row_text.ends_with("部"));
            let is_substantial_gap = vert_gap >= (min_line_h * 1.10).max(18.0) || is_standalone_line_rank_split;
            let is_ellipsis_split = (prev_row_text.ends_with('…') || prev_row_text.ends_with("..")) && vert_gap >= (min_line_h * 0.15).max(2.0);
            let is_multi_lobe_split = if current_cluster.len() >= 2 {
                let next_lobe_lines: Vec<&OcrLine> = rows[r_idx..r_idx.saturating_add(3).min(rows.len())]
                    .iter()
                    .flat_map(|r| r.iter().copied())
                    .collect();
                if next_lobe_lines.len() >= 2 {
                    let c_indents: Vec<i32> = current_cluster.iter().map(|l| polygon_bounds(&l.polygon).0).collect();
                    let r_indents: Vec<i32> = next_lobe_lines.iter().map(|l| polygon_bounds(&l.polygon).0).collect();
                    let c_min_indent = *c_indents.iter().min().unwrap_or(&0);
                    let c_max_indent = *c_indents.iter().max().unwrap_or(&0);
                    let r_min_indent = *r_indents.iter().min().unwrap_or(&0);
                    let r_max_indent = *r_indents.iter().max().unwrap_or(&0);

                    // WITHIN EACH LOBE, LINES ARE INTERNALLY ALIGNED (MARGIN VARIANCE <= 16PX)
                    let c_internally_aligned = (c_max_indent - c_min_indent) <= 16;
                    let r_internally_aligned = (r_max_indent - r_min_indent) <= 16;
                    // BETWEEN LOBES, THERE IS A CLEAR STRUCTURAL MARGIN STEP (>= 20PX)
                    let margin_shift = (c_min_indent - r_min_indent).abs();

                    c_internally_aligned && r_internally_aligned && margin_shift >= 20 && vert_gap >= -4.0
                } else {
                    false
                }
            } else {
                false
            };

            let should_split = is_substantial_gap || is_ellipsis_split || is_multi_lobe_split || (ends_with_punct && vert_gap >= (min_line_h * 0.30).max(4.0)) || is_caption_to_title || is_repeated_bracketed_tag;

            if should_split && !current_cluster.is_empty() {
                paragraph_clusters.push(current_cluster);
                current_cluster = Vec::new();
            }
        }

        current_cluster.extend(row.iter().copied());
    }

    if !current_cluster.is_empty() {
        paragraph_clusters.push(current_cluster);
    }

    if paragraph_clusters.is_empty() {
        vec![lines.to_vec()]
    } else {
        paragraph_clusters
    }
}

pub fn format_lines_cluster(
    lines: &[&OcrLine],
    is_cjk: bool,
    is_container_vert: bool,
    sin_a: f32,
    cos_a: f32,
) -> String {
    if is_container_vert {
        let mut sorted: Vec<&OcrLine> = lines.to_vec();
        sorted.sort_by(|a, b| {
            let (ax, ay, _, _) = polygon_bounds(&a.polygon);
            let (bx, by, _, _) = polygon_bounds(&b.polygon);
            bx.cmp(&ax).then_with(|| ay.cmp(&by))
        });
        // DEDUPLICATE VERTICAL LINES WHERE ONE LINE IS A SUBSTRING FRAGMENT OR DUPLICATE PREFIX/SUFFIX ON THE SAME COLUMN
        let mut deduped_sorted: Vec<&OcrLine> = Vec::new();
        for l in sorted {
            let clean_l = l.text.trim();
            let (lx, _, lw, _) = polygon_bounds(&l.polygon);
            let is_sub_or_fragment = deduped_sorted.iter().any(|existing| {
                let clean_e = existing.text.trim();
                let (ex, _, ew, _) = polygon_bounds(&existing.polygon);
                let overlap_x = (lx + lw).min(ex + ew) - lx.max(ex);
                let col_dist = ((lx + lw / 2) - (ex + ew / 2)).abs();
                let is_same_column = overlap_x >= 0 || col_dist <= 20;
                if !is_same_column {
                    return false;
                }
                let is_sub = clean_e.contains(clean_l) && clean_e.chars().count() > clean_l.chars().count();
                let is_l_punct = clean_l.chars().all(|c| c.is_ascii_punctuation() || matches!(c, '！' | '？' | '!' | '?' | '…'));
                let has_overlap_chars = !is_l_punct && clean_l.chars().filter(|c| !c.is_alphanumeric() || !c.is_ascii_digit()).all(|c| clean_e.contains(c));
                is_sub || (has_overlap_chars && clean_l.chars().count() <= clean_e.chars().count() / 2 && clean_e.chars().count() >= 6)
            });
            if !is_sub_or_fragment {
                deduped_sorted.retain(|existing| {
                    let clean_e = existing.text.trim();
                    let (ex, _, ew, _) = polygon_bounds(&existing.polygon);
                    let overlap_x = (lx + lw).min(ex + ew) - lx.max(ex);
                    let col_dist = ((lx + lw / 2) - (ex + ew / 2)).abs();
                    let is_same_column = overlap_x >= 0 || col_dist <= 20;
                    if !is_same_column {
                        return true;
                    }
                    let is_sub = clean_l.contains(clean_e) && clean_l.chars().count() > clean_e.chars().count();
                    let is_e_punct = clean_e.chars().all(|c| c.is_ascii_punctuation() || matches!(c, '！' | '？' | '!' | '?' | '…'));
                    let has_overlap_chars = !is_e_punct && clean_e.chars().filter(|c| !c.is_alphanumeric() || !c.is_ascii_digit()).all(|c| clean_l.contains(c));
                    !(is_sub || (has_overlap_chars && clean_e.chars().count() <= clean_l.chars().count() / 2 && clean_e.chars().count() >= 6))
                });
                deduped_sorted.push(l);
            }
        }
        deduped_sorted.iter().map(|l| l.text.trim()).collect::<Vec<_>>().join("\n")
    } else {
        let mut sorted_lines: Vec<&OcrLine> = lines.to_vec();
        sorted_lines.sort_by(|a, b| {
            let (ax, ay, aw, ah) = polygon_bounds(&a.polygon);
            let (bx, by, bw, bh) = polygon_bounds(&b.polygon);
            let a_my = -(ax + aw / 2) as f32 * sin_a + (ay + ah / 2) as f32 * cos_a;
            let b_my = -(bx + bw / 2) as f32 * sin_a + (by + bh / 2) as f32 * cos_a;
            a_my.total_cmp(&b_my)
        });

        let mut rows: Vec<Vec<&OcrLine>> = Vec::new();
        for l in sorted_lines {
            let (lx, ly, lw, _) = polygon_bounds(&l.polygon);
            let l_th = polygon_thickness(&l.polygon);
            let l_rot_y = -(lx + lw / 2) as f32 * sin_a + (ly + l_th as i32 / 2) as f32 * cos_a;
            let mut placed = false;
            for row in rows.iter_mut() {
                let (rx, ry, rw, _) = polygon_bounds(&row[0].polygon);
                let r_th = polygon_thickness(&row[0].polygon);
                let r_rot_y = -(rx + rw / 2) as f32 * sin_a + (ry + r_th as i32 / 2) as f32 * cos_a;
                let threshold = (l_th.min(r_th) * 0.45).max(5.0);
                if (l_rot_y - r_rot_y).abs() <= threshold {
                    row.push(l);
                    placed = true;
                    break;
                }
            }
            if !placed {
                rows.push(vec![l]);
            }
        }

        rows.sort_by(|a, b| {
            let (ax, ay, aw, ah) = polygon_bounds(&a[0].polygon);
            let (bx, by, bw, bh) = polygon_bounds(&b[0].polygon);
            let a_my = -(ax + aw / 2) as f32 * sin_a + (ay + ah / 2) as f32 * cos_a;
            let b_my = -(bx + bw / 2) as f32 * sin_a + (by + bh / 2) as f32 * cos_a;
            a_my.total_cmp(&b_my)
        });

        let mut row_strings: Vec<String> = Vec::new();
        for mut row in rows {
            row.sort_by(|a, b| {
                let (ax, ay, aw, ah) = polygon_bounds(&a.polygon);
                let (bx, by, bw, bh) = polygon_bounds(&b.polygon);
                let a_mx = (ax + aw / 2) as f32 * cos_a + (ay + ah / 2) as f32 * sin_a;
                let b_mx = (bx + bw / 2) as f32 * cos_a + (by + bh / 2) as f32 * sin_a;
                a_mx.total_cmp(&b_mx)
            });
            if is_cjk {
                let s = row.iter().map(|s| s.text.trim()).collect::<Vec<_>>().join("");
                if !s.is_empty() {
                    row_strings.push(s);
                }
            } else {
                let s = row.iter().map(|s| s.text.trim()).collect::<Vec<_>>().join(" ");
                if !s.is_empty() {
                    row_strings.push(s);
                }
            }
        }
        if is_cjk && row_strings.len() >= 2 {
            let last_idx = row_strings.len() - 1;
            let last = row_strings[last_idx].trim();
            if crate::ml::detect::is_standalone_noise_stroke(last) || (last.chars().count() <= 6 && last.chars().all(|c| c == '0' || c == 'o' || c == 'O')) {
                row_strings.remove(last_idx);
            }
        }
        row_strings.join("\n")
    }
}
