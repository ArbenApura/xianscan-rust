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
    is_sfx: bool,
    is_vertical: bool,
    sin_a: f32,
    cos_a: f32,
) -> Vec<Vec<&'a OcrLine>> {
    if lines.len() <= 1 || !is_cjk || is_sfx || is_vertical || sin_a.abs() > 0.05 {
        return vec![lines.to_vec()];
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

    // 1. CHECK FOR SIDE-BY-SIDE ADJACENT BUBBLE COLUMNS IN CJK DIALOGUE
    let mut has_side_by_side = false;
    for r in &rows {
        if r.len() >= 2 {
            let mut sorted_r = r.clone();
            sorted_r.sort_by_key(|s| polygon_bounds(&s.polygon).0);
            for i in 0..sorted_r.len() - 1 {
                let (ax, _, aw, _) = polygon_bounds(&sorted_r[i].polygon);
                let (bx, _, _, _) = polygon_bounds(&sorted_r[i + 1].polygon);
                if bx - (ax + aw) >= 20 {
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

    // 2. CHECK FOR VERTICAL PARAGRAPH GAPS AND SENTENCE BOUNDARIES BETWEEN ROWS
    let mut paragraph_clusters: Vec<Vec<&'a OcrLine>> = Vec::new();
    let mut current_cluster: Vec<&'a OcrLine> = Vec::new();

    for (r_idx, row) in rows.iter().enumerate() {
        if r_idx > 0 {
            let prev_row = &rows[r_idx - 1];
            let prev_max_y = prev_row.iter().map(|l| {
                let (_, ly, _, lh) = polygon_bounds(&l.polygon);
                (ly + lh) as f32
            }).fold(f32::MIN, f32::max);

            let curr_min_y = row.iter().map(|l| {
                let (_, ly, _, _) = polygon_bounds(&l.polygon);
                ly as f32
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
            // Split if vertical gap is large (>= 35px), sentence ends with punctuation, or row font height changes drastically from caption to large title header (curr_height >= 1.6x prev_height and positive gap)
            let is_caption_to_title = prev_height > 0.0 && curr_height >= prev_height * 1.60 && vert_gap >= 5.0;
            let should_split = vert_gap >= 35.0 || (ends_with_punct && vert_gap >= 10.0) || is_caption_to_title;

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
        // DEDUPLICATE VERTICAL LINES WHERE ONE LINE IS A SUBSTRING FRAGMENT OR DUPLICATE PREFIX/SUFFIX
        let mut deduped_sorted: Vec<&OcrLine> = Vec::new();
        for l in sorted {
            let clean_l = l.text.trim();
            let is_sub_or_fragment = deduped_sorted.iter().any(|existing| {
                let clean_e = existing.text.trim();
                let is_sub = clean_e.contains(clean_l) && clean_e.chars().count() > clean_l.chars().count();
                let has_overlap_chars = clean_l.chars().filter(|c| !c.is_alphanumeric() || !c.is_ascii_digit()).all(|c| clean_e.contains(c));
                is_sub || (has_overlap_chars && clean_l.chars().count() <= clean_e.chars().count() / 2 && clean_e.chars().count() >= 6)
            });
            if !is_sub_or_fragment {
                deduped_sorted.retain(|existing| {
                    let clean_e = existing.text.trim();
                    let is_sub = clean_l.contains(clean_e) && clean_l.chars().count() > clean_e.chars().count();
                    let has_overlap_chars = clean_e.chars().filter(|c| !c.is_alphanumeric() || !c.is_ascii_digit()).all(|c| clean_e.contains(c));
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
