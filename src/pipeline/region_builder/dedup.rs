// -- CRATE / EXTERNAL IMPORTS -- //
use image::DynamicImage;

// -- INTERNAL IMPORTS -- //
use crate::ml::schemas::{BoxRect, Region};
use super::geometry::expand_box;

// -- FUNCTIONS & ALGORITHMS -- //

/// DEDUPLICATE OVERLAPPING REGIONS AND UNIFY SLANTED STATUS CARD SLICES
pub fn deduplicate_and_unify_regions(
    regions: Vec<Region>,
    img: &DynamicImage,
    page_w: u32,
    page_h: u32,
    inpaint_pct: f32,
    typeset_pct: f32,
) -> Vec<Region> {
    let mut deduped_regions: Vec<Region> = Vec::new();

    for r in regions {
        let clean_r = r.text.trim();
        let r_rect = &r.box_;
        let (rx, ry, rw, rh) = (r_rect.x, r_rect.y, r_rect.w, r_rect.h);
        let r_area = (rw * rh).max(1);

        let mut is_duplicate = false;
        for existing in &mut deduped_regions {
            let clean_e = existing.text.trim();
            let e_rect = &existing.box_;
            let (ex, ey, ew, eh) = (e_rect.x, e_rect.y, e_rect.w, e_rect.h);
            let e_area = (ew * eh).max(1);

            let ix = (rx + rw).min(ex + ew) - rx.max(ex);
            let iy = (ry + rh).min(ey + eh) - ry.max(ey);
            let inter_area = if ix > 0 && iy > 0 { ix * iy } else { 0 };
            let overlap_r = inter_area as f32 / r_area as f32;
            let overlap_e = inter_area as f32 / e_area as f32;
            let iou = if inter_area > 0 { inter_area as f32 / (r_area + e_area - inter_area) as f32 } else { 0.0 };

            // A. STANDARD DUPLICATE / CONTAINMENT DEDUPLICATION
            let lines_r: Vec<&str> = r.text.lines().map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
            let lines_e: Vec<&str> = existing.text.lines().map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
            let has_shared_major_line = lines_r.iter().any(|lr| lr.chars().count() >= 3 && lines_e.iter().any(|le| le == lr || le.contains(lr) || lr.contains(le)));
            let clean_r_no_space: String = clean_r.chars().filter(|c| !c.is_whitespace()).collect();
            let clean_e_no_space: String = clean_e.chars().filter(|c| !c.is_whitespace()).collect();
            let is_contained_text = clean_r_no_space == clean_e_no_space
                || clean_e_no_space.contains(&clean_r_no_space)
                || clean_r_no_space.contains(&clean_e_no_space);
            let has_cjk_sub = (clean_r_no_space.chars().count() >= 2 && clean_e_no_space.contains(&clean_r_no_space))
                || (clean_e_no_space.chars().count() >= 2 && clean_r_no_space.contains(&clean_e_no_space));
            let has_shared_char_subset = (clean_r_no_space.chars().count() <= clean_e_no_space.chars().count() && clean_r_no_space.chars().all(|c| clean_e_no_space.contains(c)))
                || (clean_e_no_space.chars().count() <= clean_r_no_space.chars().count() && clean_e_no_space.chars().all(|c| clean_r_no_space.contains(c)));

            let text_contains = clean_r == clean_e || clean_e.contains(clean_r) || clean_r.contains(clean_e) || has_shared_major_line || is_contained_text || has_cjk_sub || has_shared_char_subset;

            let is_bubble_subset = (existing.bubble_box.is_some() || r.bubble_box.is_some())
                && text_contains
                && inter_area > 0
                && (overlap_r >= 0.40 || overlap_e >= 0.40 || iou >= 0.30);

            let is_spatial_containment_subset = text_contains
                && inter_area > 0
                && (overlap_r >= 0.40 || overlap_e >= 0.40 || iou >= 0.30);

            let is_high_spatial_overlap = inter_area > 0 && (iou >= 0.50 || overlap_r >= 0.60 || overlap_e >= 0.60);

            if (is_high_spatial_overlap && text_contains)
                || is_bubble_subset
                || is_spatial_containment_subset
            {
                is_duplicate = true;
                let clean_r_chars = clean_r_no_space.chars().count();
                let clean_e_chars = clean_e_no_space.chars().count();
                if existing.bubble_box.is_some() && r.bubble_box.is_none() {
                    // KEEP EXISTING BUBBLE-BACKED REGION OVER NON-BUBBLE CANDIDATE
                } else if r.bubble_box.is_some() && existing.bubble_box.is_none() {
                    *existing = r.clone();
                } else if clean_r_chars > clean_e_chars || (clean_r_chars == clean_e_chars && r.confidence > existing.confidence) {
                    *existing = r.clone();
                }
                break;
            }

            // B. SLANTED STATUS CARD / PARAGRAPH SLICE UNIFICATION
            let angle_diff = (r.angle - existing.angle).abs();
            let is_slanted_card_slice = r.bubble_box.is_none()
                && existing.bubble_box.is_none()
                && r.angle.abs() >= 6.0
                && existing.angle.abs() >= 6.0
                && angle_diff <= 5.0;

            if is_slanted_card_slice {
                let is_r_timestamp = crate::ml::detect::is_timestamp_or_date_line(clean_r);
                let is_e_timestamp = crate::ml::detect::is_timestamp_or_date_line(clean_e);

                if !is_r_timestamp && !is_e_timestamp {
                    let angle_rad = existing.angle * (std::f32::consts::PI / 180.0);
                    let cos_m = angle_rad.cos();
                    let sin_m = angle_rad.sin();

                    // Project existing polygon points into rotated frame
                    let mut e_min_u = f32::MAX;
                    let mut e_max_u = f32::MIN;
                    let mut e_min_v = f32::MAX;
                    let mut e_max_v = f32::MIN;
                    for p in &existing.polygon {
                        let px = p[0] as f32;
                        let py = p[1] as f32;
                        let u = px * cos_m + py * sin_m;
                        let v = -px * sin_m + py * cos_m;
                        e_min_u = e_min_u.min(u);
                        e_max_u = e_max_u.max(u);
                        e_min_v = e_min_v.min(v);
                        e_max_v = e_max_v.max(v);
                    }

                    // Project candidate region r's polygon points into rotated frame
                    let mut r_min_u = f32::MAX;
                    let mut r_max_u = f32::MIN;
                    let mut r_min_v = f32::MAX;
                    let mut r_max_v = f32::MIN;
                    for p in &r.polygon {
                        let px = p[0] as f32;
                        let py = p[1] as f32;
                        let u = px * cos_m + py * sin_m;
                        let v = -px * sin_m + py * cos_m;
                        r_min_u = r_min_u.min(u);
                        r_max_u = r_max_u.max(u);
                        r_min_v = r_min_v.min(v);
                        r_max_v = r_max_v.max(v);
                    }

                    let e_h_v = (e_max_v - e_min_v).max(1.0);
                    let r_h_v = (r_max_v - r_min_v).max(1.0);
                    let min_line_h = e_h_v.min(r_h_v);

                    let e_w_u = (e_max_u - e_min_u).max(1.0);
                    let r_w_u = (r_max_u - r_min_u).max(1.0);

                    // Distance in perpendicular/inter-row direction v
                    let v_gap = (e_min_v.max(r_min_v) - e_max_v.min(r_max_v)).max(0.0);
                    let v_overlap = (e_max_v.min(r_max_v) - e_min_v.max(r_min_v)).max(0.0);

                    // Horizontal overlap along reading line u
                    let u_overlap = (e_max_u.min(r_max_u) - e_min_u.max(r_min_u)).max(0.0);
                    let u_gap = (e_min_u.max(r_min_u) - e_max_u.min(r_max_u)).max(0.0);
                    let u_overlap_ratio = u_overlap / e_w_u.min(r_w_u);

                    let existing_lines_count = existing.text.lines().count();
                    let r_lines_count = r.text.lines().count();
                    let is_short_label = (clean_e.chars().count() <= 5 && existing_lines_count == 1)
                        || (clean_r.chars().count() <= 5 && r_lines_count == 1);

                    let is_left_aligned = (e_min_u - r_min_u).abs() <= 25.0;
                    let max_v_gap = if is_short_label {
                        25.0
                    } else if u_overlap_ratio >= 0.50 || (is_left_aligned && u_overlap > 0.0) {
                        48.0
                    } else {
                        (min_line_h * 1.15).min(32.0)
                    };

                    let is_adjacent_v = v_overlap > 0.0 || (v_gap <= max_v_gap);
                    let is_aligned_u = u_overlap_ratio >= 0.20 || u_gap <= 25.0;

                    let is_multi_line_guard = (existing_lines_count >= 3 || r_lines_count >= 3) && v_gap >= 55.0;

                    if is_adjacent_v && is_aligned_u && !is_multi_line_guard {
                        is_duplicate = true;

                        let mut min_u = e_min_u.min(r_min_u);
                        let mut max_u = e_max_u.max(r_max_u);
                        let mut min_v = e_min_v.min(r_min_v);
                        let mut max_v = e_max_v.max(r_max_v);

                        if let Some((bu_min, bu_max, bv_min, bv_max)) =
                            super::geometry::extract_slanted_bubble_envelope(img, min_u, max_u, min_v, max_v, existing.angle)
                        {
                            min_u = bu_min;
                            max_u = bu_max;
                            min_v = bv_min;
                            max_v = bv_max;
                        }

                        let u_v_corners = [
                            (min_u, min_v),
                            (max_u, min_v),
                            (max_u, max_v),
                            (min_u, max_v),
                        ];
                        existing.polygon = u_v_corners
                            .iter()
                            .map(|&(u, v)| {
                                let rx = u * cos_m - v * sin_m;
                                let ry = u * sin_m + v * cos_m;
                                [rx.round() as i32, ry.round() as i32]
                            })
                            .collect();

                        let mut min_x = i32::MAX;
                        let mut min_y = i32::MAX;
                        let mut max_x = i32::MIN;
                        let mut max_y = i32::MIN;
                        for p in &existing.polygon {
                            min_x = min_x.min(p[0]);
                            min_y = min_y.min(p[1]);
                            max_x = max_x.max(p[0]);
                            max_y = max_y.max(p[1]);
                        }
                        existing.box_ = BoxRect {
                            x: min_x.max(0),
                            y: min_y.max(0),
                            w: (max_x - min_x).max(1).min(page_w as i32 - min_x.max(0)),
                            h: (max_y - min_y).max(1).min(page_h as i32 - min_y.max(0)),
                        };
                        existing.inpaint_box = Some(expand_box(&existing.box_, inpaint_pct, page_w, page_h));
                        existing.typeset_box = Some(expand_box(&existing.box_, typeset_pct, page_w, page_h));

                        let mut combined_lines: Vec<(f32, String)> = Vec::new();
                        for line in existing.text.lines() {
                            let l_trim = line.trim();
                            if !l_trim.is_empty() {
                                combined_lines.push((e_min_v, l_trim.to_string()));
                            }
                        }
                        for line in r.text.lines() {
                            let l_trim = line.trim();
                            if !l_trim.is_empty() && !combined_lines.iter().any(|(_, cl)| cl == l_trim || cl.contains(l_trim)) {
                                combined_lines.push((r_min_v, l_trim.to_string()));
                            }
                        }
                        combined_lines.sort_by(|a, b| a.0.total_cmp(&b.0));
                        existing.text = combined_lines.into_iter().map(|(_, t)| t).collect::<Vec<_>>().join("\n");
                        break;
                    }
                }
            }
        }
        if !is_duplicate {
            deduped_regions.push(r);
        }
    }

    // CLEAN UI HEADER NAVIGATION CHEVRONS & RE-INDEX REGION IDS
    for (i, r) in deduped_regions.iter_mut().enumerate() {
        r.text = crate::ml::detect::clean_ui_header_text(&r.text);
        r.id = format!("r{}", i);
    }

    deduped_regions
}
