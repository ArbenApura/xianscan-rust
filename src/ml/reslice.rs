// -- CRATE / EXTERNAL IMPORTS -- //
use image::{DynamicImage, GenericImageView, ImageBuffer, Rgb, RgbImage};
use rayon::prelude::*;
use std::sync::atomic::{AtomicU64, Ordering};

// -- INTERNAL IMPORTS -- //
use super::detect::ComicTextDetector;
use super::geometry::polygon_bounds;
use super::ocr::RapidOcr;

// -- TYPES -- //

/// PRECOMPUTED HORIZONTAL ROW STATISTICS ACROSS CONTINUOUS CANVAS
struct RowProfile {
    row_variances: Vec<f32>,
    max_col_var: Vec<f32>,
    row_diffs: Vec<f32>,
    row_edge_energy: Vec<f32>,
}

/// PROGRESS CALLBACK SIGNATURE: RECEIVES A NORMALIZED 0..=100 PERCENTAGE.
/// USED TO STREAM REALTIME FEEDBACK TO THE WEB UI (MIRRORING PAGE TRANSLATION).
pub type ResliceProgressFn = dyn Fn(u32) + Send + Sync;

/// CHECK WHETHER THE GIVEN RUN HAS BEEN CANCELLED BY THE CLIENT. THE FLAG
/// HOLDS THE CANCELLED RUN ID, SO A STALE CANCEL CAN NEVER KILL A NEWER RUN.
/// CALLED AT PHASE / TILE / PAGE BOUNDARIES — THE WORK ITSELF IS SYNCHRONOUS
/// AND CANNOT BE INTERRUPTED MID-INFERENCE.
fn is_run_cancelled(cancel: Option<&AtomicU64>, run_id: u64) -> bool {
    cancel.is_some_and(|c| c.load(Ordering::Relaxed) == run_id)
}

// -- FUNCTIONS & ALGORITHMS -- //

/// PARALLEL ROW STATISTICAL PROFILING VIA RAYON
///
/// `on_progress` IS CALLED WITH AN ESTIMATED PERCENTAGE (0..=100) AS ROWS ARE
/// PROCESSED. THIS IS A FAST MEMORY-BOUND PHASE, SO THE CALLER MAPS IT INTO A
/// SMALL BAR BAND AND RESERVES THE BULK OF THE BAR FOR THE SLOW DETECTION PHASE.
fn compute_row_profile(
    rgb: &RgbImage,
    on_progress: Option<&(dyn Fn(u32) + Sync + Send)>,
) -> RowProfile {
    let (w, total_h) = rgb.dimensions();
    let w_third = (w / 3).max(1);
    let row_stride = w as usize * 3;
    let raw_bytes = rgb.as_raw();

    // PARALLEL COMPUTATION OF EACH ROW'S VARIANCE, 3-COLUMN VARIANCE & MEANS
    let progress_counter = std::sync::atomic::AtomicU32::new(0);
    let last_reported_pct = std::sync::atomic::AtomicU32::new(0);
    let total_rows = total_h.max(1) as u32;

    let rows_data: Vec<(f32, f32, f32)> = (0..total_h)
        .into_par_iter()
        .map(|y| {
            let row_offset = y as usize * row_stride;
            let row_slice = &raw_bytes[row_offset..row_offset + row_stride];

            let mut sum_g = 0.0_f32;
            let mut sum_sq_g = 0.0_f32;
            let mut c1_sum = 0.0_f32;
            let mut c1_sq = 0.0_f32;
            let mut c2_sum = 0.0_f32;
            let mut c2_sq = 0.0_f32;
            let mut c3_sum = 0.0_f32;
            let mut c3_sq = 0.0_f32;

            for x in 0..w as usize {
                let px = x * 3;
                let r = row_slice[px] as f32;
                let g = row_slice[px + 1] as f32;
                let b = row_slice[px + 2] as f32;
                let gray = r * 0.299 + g * 0.587 + b * 0.114;

                sum_g += gray;
                sum_sq_g += gray * gray;

                if (x as u32) < w_third {
                    c1_sum += gray;
                    c1_sq += gray * gray;
                } else if (x as u32) < 2 * w_third {
                    c2_sum += gray;
                    c2_sq += gray * gray;
                } else {
                    c3_sum += gray;
                    c3_sq += gray * gray;
                }
            }

            let mean = sum_g / w as f32;
            let variance = ((sum_sq_g / w as f32) - (mean * mean)).max(0.0);

            let c1_m = c1_sum / w_third as f32;
            let c1_v = ((c1_sq / w_third as f32) - (c1_m * c1_m)).max(0.0);

            let c2_m = c2_sum / w_third as f32;
            let c2_v = ((c2_sq / w_third as f32) - (c2_m * c2_m)).max(0.0);

            let c3_cnt = (w - 2 * w_third).max(1) as f32;
            let c3_m = c3_sum / c3_cnt;
            let c3_v = ((c3_sq / c3_cnt) - (c3_m * c3_m)).max(0.0);

            let max_c_var = c1_v.max(c2_v).max(c3_v);

            let result = (mean, variance, max_c_var);

            // THROTTLED PROGRESS: REPORT ONLY AT ~1% GRANULARITY TO AVOID CALLBACK STORMS
            if let Some(cb) = on_progress {
                let done = progress_counter.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
                let pct = (done as f32 / total_rows as f32 * 100.0).min(100.0) as u32;
                let last = last_reported_pct.load(std::sync::atomic::Ordering::Relaxed);
                if pct > last && (pct - last >= 2 || pct == 100) {
                    last_reported_pct.store(pct, std::sync::atomic::Ordering::Relaxed);
                    cb(pct);
                }
            }

            result
        })
        .collect();

    let mut row_means = Vec::with_capacity(total_h as usize);
    let mut row_variances = Vec::with_capacity(total_h as usize);
    let mut max_col_var = Vec::with_capacity(total_h as usize);

    for (m, v, c) in rows_data {
        row_means.push(m);
        row_variances.push(v);
        max_col_var.push(c);
    }

    let mut row_diffs = vec![0.0_f32; total_h as usize];
    let mut row_edge_energy = vec![0.0_f32; total_h as usize];
    for y in 1..total_h as usize {
        let diff = (row_means[y] - row_means[y - 1]).abs();
        row_diffs[y] = diff;
        row_edge_energy[y] = diff;
    }

    RowProfile {
        row_variances,
        max_col_var,
        row_diffs,
        row_edge_energy,
    }
}

/// MERGE OVERLAPPING EXCLUSION INTERVALS INTO CONTIGUOUS RANGES
pub fn merge_intervals(mut intervals: Vec<(i32, i32)>) -> Vec<(i32, i32)> {
    if intervals.is_empty() {
        return Vec::new();
    }
    intervals.sort_by_key(|k| k.0);
    let mut merged = Vec::new();
    let mut current = intervals[0];

    for next in intervals.into_iter().skip(1) {
        if next.0 <= current.1 {
            current.1 = current.1.max(next.1);
        } else {
            merged.push(current);
            current = next;
        }
    }
    merged.push(current);
    merged
}

/// CHECK IF A GIVEN VERTICAL PIXEL COORDINATE OVERLAPS ANY FORBIDDEN ZONE
pub fn is_point_forbidden(y: i32, intervals: &[(i32, i32)]) -> bool {
    intervals.iter().any(|&(start, end)| y >= start && y <= end)
}

/// MINIMUM CLEAN (INK-FREE) ROWS REQUIRED IMMEDIATELY ABOVE AND BELOW A CANDIDATE
/// CUT. THE DETECTOR + OCR FORBIDDEN ZONES ARE NOT GUARANTEED TO BE EXHAUSTIVE, SO
/// A FLAT ROW ALONE IS NOT PROOF OF A SAFE CUT: THE INTER-LINE GAP INSIDE AN
/// UNDETECTED BUBBLE / TEXT BOX IS FLAT YET SITS IN THE MIDDLE OF A DIALOGUE.
/// REQUIRING CLEAR AIRSPACE ON BOTH SIDES REJECTS SUCH "FAKE GUTTERS".
const CUT_AIRSPACE_PX: u32 = 10;

/// TRUE WHEN THE ROW IS VISUALLY BLANK (LOW VARIANCE & EDGE ENERGY). USED TO
/// VERIFY A CANDIDATE CUT IS SURROUNDED BY A CLEAR GUTTER RATHER THAN ART / TEXT.
fn row_is_blank(profile: &RowProfile, y: usize) -> bool {
    profile.row_variances[y] < 30.0 && profile.row_edge_energy[y] < 15.0
}

/// A CUT AT `y` IS ACCEPTABLE ONLY IF THERE IS A BLANK AIRSPACE OF AT LEAST
/// `CUT_AIRSPACE_PX` ROWS IMMEDIATELY ABOVE AND BELOW IT. THE FLAT BAND ITSELF IS
/// GUARANTEED BLANK; THIS CHECKS THE ROWS BEYOND IT, SO A CUT CANNOT SLICE THROUGH
/// THE NARROW GAP BETWEEN TWO TEXT LINES INSIDE ONE MISSED DIALOGUE BOX.
fn has_clear_airspace(profile: &RowProfile, y: u32, total_h: u32) -> bool {
    for dy in 1..=CUT_AIRSPACE_PX {
        if y >= dy {
            let r = (y - dy) as usize;
            if !row_is_blank(profile, r) {
                return false;
            }
        }
        if y + dy < total_h {
            let r = (y + dy) as usize;
            if !row_is_blank(profile, r) {
                return false;
            }
        }
    }
    true
}

/// DETECT DIALOGUE BUBBLES AND TEXT REGIONS IN A CANDIDATE CUT WINDOW
pub fn detect_forbidden_zones_in_window(
    canvas: &DynamicImage,
    window_top: u32,
    window_bottom: u32,
    safety_margin: i32,
    mut detector: Option<&mut ComicTextDetector>,
    mut ocr: Option<&mut RapidOcr>,
) -> Vec<(i32, i32)> {
    let (_w, total_h) = canvas.dimensions();
    let y_min = (window_top as i32 - safety_margin).max(0) as u32;
    let y_max = (window_bottom as i32 + safety_margin).min(total_h as i32) as u32;
    let h = y_max.saturating_sub(y_min);
    if h < 32 {
        return Vec::new();
    }

    let tile = canvas.crop_imm(0, y_min, canvas.width(), h);
    let mut raw_intervals: Vec<(i32, i32)> = Vec::new();

    // 1. FAST COMIC TEXT DETECTOR (RT-DETR / DBNET) — FINDS BOTH BUBBLES AND TEXT POLYGONS.
    // NOTE: THIS DOES **NOT** RETURN EARLY ON SUCCESS — OCR BELOW RUNS AS A RECALL
    // SUPPLEMENT SO TEXT REGIONS MISSED BY THE COMIC DETECTOR (E.G. WIDE OR UNUSUAL
    // NARRATION / DIALOGUE BOXES) ARE STILL PROTECTED FROM BEING CUT IN HALF.
    if let Some(ref mut det) = detector {
        if let Ok(res) = det.detect(&tile) {
            for box_poly in &res.boxes {
                let (_, by, _, bh) = polygon_bounds(box_poly);
                let z_min = (by + y_min as i32 - safety_margin).max(0);
                let z_max = (by + bh + y_min as i32 + safety_margin).min(total_h as i32);
                raw_intervals.push((z_min, z_max));
            }
            for bubble in &res.bubbles {
                let z_min = (bubble.y + y_min as i32 - safety_margin).max(0);
                let z_max = (bubble.y + bubble.h + y_min as i32 + safety_margin).min(total_h as i32);
                raw_intervals.push((z_min, z_max));
            }
            for (tb, _) in &res.text_bubbles {
                let z_min = (tb.y + y_min as i32 - safety_margin).max(0);
                let z_max = (tb.y + tb.h + y_min as i32 + safety_margin).min(total_h as i32);
                raw_intervals.push((z_min, z_max));
            }
            for (tf, _) in &res.text_free {
                let z_min = (tf.y + y_min as i32 - safety_margin).max(0);
                let z_max = (tf.y + tf.h + y_min as i32 + safety_margin).min(total_h as i32);
                raw_intervals.push((z_min, z_max));
            }
        }
    }

    // 2. RAPIDOCR DETECTOR — RECALL SUPPLEMENT. PREVIOUSLY USED ONLY AS A FALLBACK
    // WHEN THE COMIC DETECTOR WAS ABSENT OR ERRORED; NOW ALWAYS RUNS SO ITS TEXT
    // REGIONS ARE MERGED INTO THE FORBIDDEN ZONES ALONGSIDE THE DETECTOR'S.
    if let Some(ref mut o) = ocr {
        if let Ok(lines) = o.detect_and_recognize_tiled(&tile, false) {
            for line in &lines {
                let (_, by, _, bh) = polygon_bounds(&line.polygon);
                let z_min = (by + y_min as i32 - safety_margin).max(0);
                let z_max = (by + bh + y_min as i32 + safety_margin).min(total_h as i32);
                raw_intervals.push((z_min, z_max));
            }
        }
    }

    merge_intervals(raw_intervals)
}

/// DETECT DIALOGUE BUBBLES AND TEXT REGIONS ACROSS ENTIRE CANVAS
pub fn find_forbidden_text_zones(
    canvas: &DynamicImage,
    safety_margin: i32,
    mut detector: Option<&mut ComicTextDetector>,
    mut ocr: Option<&mut RapidOcr>,
    on_progress: Option<&(dyn Fn(u32) + Sync + Send)>,
    cancel: Option<&AtomicU64>,
    run_id: u64,
) -> Vec<(i32, i32)> {
    let (_w, total_h) = canvas.dimensions();
    let mut raw_intervals: Vec<(i32, i32)> = Vec::new();

    let tile_height = 2000_u32;
    let tile_step = 1400_u32;
    let mut y_top = 0_u32;

    // TOTAL TILE COUNT (UPPER BOUND) FOR GRANULAR DETECTION PROGRESS.
    let total_tiles = (total_h as f32 / tile_step as f32).ceil().max(1.0) as u32;
    let mut tile_idx = 0_u32;

    while y_top < total_h {
        // CANCELLATION CHECKPOINT — DETECTION IS THE LONGEST PHASE, SO CHECK
        // PER-TILE TO RELEASE THE ENGINE LOCK PROMPTLY AFTER A CANCEL.
        if is_run_cancelled(cancel, run_id) {
            break;
        }
        let y_bottom = (y_top + tile_height).min(total_h);
        let cur_tile_h = y_bottom - y_top;

        if cur_tile_h >= 32 {
            let zones = detect_forbidden_zones_in_window(
                canvas,
                y_top,
                y_bottom,
                safety_margin,
                detector.as_deref_mut(),
                ocr.as_deref_mut(),
            );
            raw_intervals.extend(zones);
        }

        if let Some(cb) = on_progress {
            tile_idx += 1;
            let pct = ((tile_idx as f32 / total_tiles as f32) * 100.0).min(100.0) as u32;
            cb(pct);
        }

        if y_bottom >= total_h {
            break;
        }
        y_top += tile_step;
    }

    merge_intervals(raw_intervals)
}

/// SEARCH CONTINUOUS CANVAS FOR OPTIMAL CUT POINTS AVOIDING ART & FORBIDDEN TEXT
pub fn find_optimal_cut_points(
    canvas: &DynamicImage,
    target_height: u32,
    min_height: u32,
    max_height: u32,
    forbidden_zones: &[(i32, i32)],
) -> Vec<u32> {
    let (_w, total_h) = canvas.dimensions();
    if total_h <= max_height {
        return vec![total_h];
    }

    let rgb = canvas.to_rgb8();
    let profile = compute_row_profile(&rgb, None);

    let mut cut_points = Vec::new();
    let mut current_y = 0_u32;

    while current_y < total_h {
        let remaining = total_h - current_y;
        if remaining <= max_height {
            cut_points.push(total_h);
            break;
        }

        let search_start = (current_y + min_height).min(total_h - 1);
        let search_end = (current_y + max_height).min(total_h - 1);
        let ideal_cut = (current_y + target_height) as f32;

        // 1ST PASS: SOLID GUTTER BANDS (ROW_VAR < 12.0 && MAX_COL_VAR < 15.0 && EDGE < 8.0)
        let mut gutter_candidates = Vec::new();
        for y in search_start..=search_end {
            if !is_point_forbidden(y as i32, forbidden_zones) {
                let yi = y as usize;
                if profile.row_variances[yi] < 12.0
                    && profile.max_col_var[yi] < 15.0
                    && profile.row_edge_energy[yi] < 8.0
                {
                    gutter_candidates.push(y);
                }
            }
        }

        let mut best_y = None;

        if !gutter_candidates.is_empty() {
            let mut bands: Vec<Vec<u32>> = Vec::new();
            let mut curr_band = vec![gutter_candidates[0]];

            for &gy in gutter_candidates.iter().skip(1) {
                if gy == *curr_band.last().unwrap() + 1 {
                    curr_band.push(gy);
                } else {
                    bands.push(curr_band);
                    curr_band = vec![gy];
                }
            }
            bands.push(curr_band);

            let mut best_band_score = -f32::INFINITY;
            for band in bands {
                let mid_y = band[band.len() / 2];
                let band_len = band.len() as f32;
                let dist_penalty = (mid_y as f32 - ideal_cut).abs() * 0.05;
                let band_score = (band_len * 2.5) - dist_penalty;
                if band_score > best_band_score {
                    best_band_score = band_score;
                    best_y = Some(mid_y);
                }
            }
        }

        // 2ND PASS: LOWEST VISUAL ENERGY ROW OUTSIDE FORBIDDEN TEXT
        if best_y.is_none() {
            let mut best_score = -f32::INFINITY;
            for y in search_start..=search_end {
                if !is_point_forbidden(y as i32, forbidden_zones) {
                    let yi = y as usize;
                    let var_val = profile.row_variances[yi];
                    let diff_val = profile.row_diffs[yi];
                    let edge_val = profile.row_edge_energy[yi];
                    let dist = (y as f32 - ideal_cut).abs();

                    let flatness = -(var_val * 0.1 + diff_val * 2.0 + edge_val * 1.5);
                    let score = flatness - (dist * 0.02);
                    if score > best_score {
                        best_score = score;
                        best_y = Some(y);
                    }
                }
            }
        }

        // 3RD PASS: EXPAND SEARCH OUTWARDS TO FIND ANY NON-FORBIDDEN ROW BEFORE DEFAULTING
        let selected_y = best_y.unwrap_or_else(|| {
            let mut fallback_y = None;
            for offset in 1..=600 {
                if search_start >= offset + current_y + 100 {
                    let y = search_start - offset;
                    if !is_point_forbidden(y as i32, forbidden_zones) {
                        fallback_y = Some(y);
                        break;
                    }
                }
                if search_end + offset < total_h {
                    let y = search_end + offset;
                    if !is_point_forbidden(y as i32, forbidden_zones) {
                        fallback_y = Some(y);
                        break;
                    }
                }
            }
            fallback_y.unwrap_or_else(|| (current_y + target_height).min(search_end).max(search_start))
        });

        cut_points.push(selected_y);
        current_y = selected_y;
    }

    cut_points
}

/// SEARCH CONTINUOUS CANVAS FOR OPTIMAL CUT POINTS WITH HIERARCHICAL FAST-PASS & ON-DEMAND TEXT DETECTION
pub fn find_optimal_cut_points_with_detectors(
    canvas: &DynamicImage,
    target_height: u32,
    min_height: u32,
    max_height: u32,
    mut detector: Option<&mut ComicTextDetector>,
    mut ocr: Option<&mut RapidOcr>,
    on_progress: Option<&ResliceProgressFn>,
    cancel: Option<&AtomicU64>,
    run_id: u64,
) -> Vec<u32> {
    let (_w, total_h) = canvas.dimensions();
    if total_h <= max_height {
        // SINGLE PAGE — NO CUTS NEEDED; HAND OFF TO THE ENCODING PHASE (90).
        if let Some(cb) = on_progress {
            cb(90);
        }
        return vec![total_h];
    }

    if is_run_cancelled(cancel, run_id) {
        return Vec::new();
    }

    let rgb = canvas.to_rgb8();

    // PHASE A (2..=10%): ROW PROFILE — FAST PARALLEL ROW STATS, SO IT ONLY OWNS
    // A SMALL BAR BAND. GIVING IT MORE MAKES THE BAR SPRINT THEN CRAWL UNNATURALLY.
    if let Some(cb) = on_progress {
        cb(2);
    }
    let profile = if let Some(cb) = on_progress {
        let row_progress = |p: u32| cb(2 + (p as f32 * 0.08) as u32);
        compute_row_profile(&rgb, Some(&row_progress))
    } else {
        compute_row_profile(&rgb, None)
    };

    // PHASE B (10..=80%): FORBIDDEN TEXT ZONE DETECTION OVER THE FULL CANVAS (TILED).
    if let Some(cb) = on_progress {
        cb(10);
    }
    // COMPUTE FORBIDDEN TEXT ZONES ONCE UPFRONT OVER THE FULL CANVAS (TILED)
    // THIS MUST BE ENFORCED IN *EVERY* PASS — INCLUDING THE "PURE GUTTER" FAST-PATH.
    // A HORIZONTALLY FLAT BAND IS NOT PROOF OF A SAFE CUT: THE INTER-LINE GAP INSIDE
    // A TYPED CHAT / TEXT BLOCK IS FLAT YET SITS IN THE MIDDLE OF A DIALOGUE.
    // THE DETECTOR (RT-DETR) FINDS THOSE TEXT REGIONS SO NO GUTTER INSIDE A DIALOGUE
    // IS EVER ACCEPTED.
    let forbidden_zones: Vec<(i32, i32)> = if detector.is_some() || ocr.is_some() {
        // GRANULAR DETECTION PROGRESS MAPPED INTO THE 10..=80 BAND (LIKE ROW_PROFILE ABOVE).
        let det_progress = if let Some(cb) = on_progress {
            let mapped = |p: u32| cb(10 + (p as f32 * 0.70) as u32);
            Some(mapped)
        } else {
            None
        };
        let det_cb: Option<&(dyn Fn(u32) + Sync + Send)> = det_progress.as_ref().map(|c| c as &(dyn Fn(u32) + Sync + Send));
        find_forbidden_text_zones(
            canvas,
            30,
            detector.as_deref_mut(),
            ocr.as_deref_mut(),
            det_cb,
            cancel,
            run_id,
        )
    } else {
        Vec::new()
    };
    if is_run_cancelled(cancel, run_id) {
        return Vec::new();
    }
    if let Some(cb) = on_progress {
        cb(80);
    }

    let mut cut_points = Vec::new();
    let mut current_y = 0_u32;

    while current_y < total_h {
        if is_run_cancelled(cancel, run_id) {
            return Vec::new();
        }
        let remaining = total_h - current_y;
        if remaining <= max_height {
            cut_points.push(total_h);
            break;
        }

        let search_start = (current_y + min_height).min(total_h - 1);
        let search_end = (current_y + max_height).min(total_h - 1);
        let ideal_cut = (current_y + target_height) as f32;

        // 1ST PASS (FAST-PATH): SOLID GUTTER BANDS OUTSIDE FORBIDDEN TEXT ZONES.
        // FORBIDDEN ZONES ARE CHECKED HERE TOO — FLAT BANDS CANNOT BE TRUSTED TO BE
        // FREE OF DIALOGUE (THE INTER-LINE GAP INSIDE TYPED TEXT IS FLAT).
        let mut pure_gutter_candidates = Vec::new();
        for y in search_start..=search_end {
            if !is_point_forbidden(y as i32, &forbidden_zones) {
                let yi = y as usize;
                if profile.row_variances[yi] < 10.0
                    && profile.max_col_var[yi] < 12.0
                    && profile.row_edge_energy[yi] < 6.0
                {
                    pure_gutter_candidates.push(y);
                }
            }
        }

        let mut best_y = None;

        if !pure_gutter_candidates.is_empty() {
            let mut bands: Vec<Vec<u32>> = Vec::new();
            let mut curr_band = vec![pure_gutter_candidates[0]];

            for &gy in pure_gutter_candidates.iter().skip(1) {
                if gy == *curr_band.last().unwrap() + 1 {
                    curr_band.push(gy);
                } else {
                    bands.push(curr_band);
                    curr_band = vec![gy];
                }
            }
            bands.push(curr_band);

            // ONLY ACCEPT BANDS WITH AT LEAST 8 PIXELS OF CONTINUOUS FLAT GUTTER
            let valid_bands: Vec<_> = bands.into_iter().filter(|b| b.len() >= 8).collect();
            if !valid_bands.is_empty() {
                let mut best_band_score = -f32::INFINITY;
                for band in valid_bands {
                    let mid_y = band[band.len() / 2];
                    // REJECT "FAKE GUTTERS": A FLAT BAND IS ONLY A SAFE CUT IF IT IS
                    // SURROUNDED BY CLEAR AIRSPACE. OTHERWISE IT IS JUST AN INTER-LINE
                    // GAP INSIDE A BUBBLE / TEXT BOX THE DETECTOR & OCR MISSED.
                    if !has_clear_airspace(&profile, mid_y, total_h) {
                        continue;
                    }
                    let band_len = band.len() as f32;
                    let dist_penalty = (mid_y as f32 - ideal_cut).abs() * 0.05;
                    let band_score = (band_len * 2.5) - dist_penalty;
                    if band_score > best_band_score {
                        best_band_score = band_score;
                        best_y = Some(mid_y);
                    }
                }
            }
        }

        // 2ND PASS (RELAXED GUTTER OR LOWEST VISUAL ENERGY ROW OUTSIDE FORBIDDEN ZONES).
        // FORBIDDEN ZONES WERE COMPUTED ONCE UPFRONT — NO PER-WINDOW RE-INFERENCE NEEDED.
        if best_y.is_none() {
            let mut fallback_gutter_candidates = Vec::new();
            for y in search_start..=search_end {
                if !is_point_forbidden(y as i32, &forbidden_zones) {
                    let yi = y as usize;
                    if profile.row_variances[yi] < 15.0
                        && profile.max_col_var[yi] < 20.0
                        && has_clear_airspace(&profile, y, total_h)
                    {
                        fallback_gutter_candidates.push(y);
                    }
                }
            }

            if !fallback_gutter_candidates.is_empty() {
                let mut best_band_score = -f32::INFINITY;
                for y in fallback_gutter_candidates {
                    let dist = (y as f32 - ideal_cut).abs();
                    let score = -dist;
                    if score > best_band_score {
                        best_band_score = score;
                        best_y = Some(y);
                    }
                }
            }

            if best_y.is_none() {
                let mut best_score = -f32::INFINITY;
                for y in search_start..=search_end {
                    if !is_point_forbidden(y as i32, &forbidden_zones) && has_clear_airspace(&profile, y, total_h) {
                        let yi = y as usize;
                        let var_val = profile.row_variances[yi];
                        let diff_val = profile.row_diffs[yi];
                        let edge_val = profile.row_edge_energy[yi];
                        let dist = (y as f32 - ideal_cut).abs();

                        let flatness = -(var_val * 0.1 + diff_val * 2.0 + edge_val * 1.5);
                        let score = flatness - (dist * 0.02);
                        if score > best_score {
                            best_score = score;
                            best_y = Some(y);
                        }
                    }
                }
            }

            // EXPAND OUTWARDS BEFORE DEFAULTING
            if best_y.is_none() {
                for offset in 1..=600 {
                    if search_start >= offset + current_y + 100 {
                        let y = search_start - offset;
                        if !is_point_forbidden(y as i32, &forbidden_zones) && has_clear_airspace(&profile, y, total_h) {
                            best_y = Some(y);
                            break;
                        }
                    }
                    if search_end + offset < total_h {
                        let y = search_end + offset;
                        if !is_point_forbidden(y as i32, &forbidden_zones) && has_clear_airspace(&profile, y, total_h) {
                            best_y = Some(y);
                            break;
                        }
                    }
                }
            }
        }

        let selected_y = best_y.unwrap_or_else(|| {
            fallback_cut(&profile, &forbidden_zones, search_start, search_end, ideal_cut, total_h)
        });

        cut_points.push(selected_y);
        current_y = selected_y;
    }

    cut_points
}

/// LAST-RESORT CUT SELECTION WHEN NO CLEAN GUTTER EXISTS IN THE SEARCH WINDOW.
///
/// THE PREVIOUS BLIND DEFAULT — `clamp(current_y + target_height)` — IGNORED THE
/// FORBIDDEN ZONES ENTIRELY, SO WHEN A WINDOW HAD NO ACCEPTABLE GUTTER (E.G. A
/// DARK PANEL WITH NO CLEAN HORIZONTAL BAND) IT CUT STRAIGHT THROUGH DETECTED
/// DIALOGUE, SPLITTING TEXT ACROSS PAGES. THIS FALLBACK ALWAYS AVOIDS FORBIDDEN
/// (TEXT / BUBBLE) ZONES, AND PREFERS CLEAR AIRSPACE / LOW VISUAL ENERGY WHEN
/// AVAILABLE, ONLY DEFAULTING TO `target_height` IF *EVERY* ROW IS FORBIDDEN.
fn fallback_cut(
    profile: &RowProfile,
    forbidden_zones: &[(i32, i32)],
    search_start: u32,
    search_end: u32,
    ideal_cut: f32,
    total_h: u32,
) -> u32 {
    // PASS A: NON-FORBIDDEN ROW WITH CLEAR AIRSPACE, CLOSEST TO THE IDEAL CUT.
    let mut best: Option<u32> = None;
    let mut best_dist = f32::INFINITY;
    for y in search_start..=search_end {
        if !is_point_forbidden(y as i32, forbidden_zones) && has_clear_airspace(profile, y, total_h) {
            let d = (y as f32 - ideal_cut).abs();
            if d < best_dist {
                best_dist = d;
                best = Some(y);
            }
        }
    }
    if let Some(y) = best {
        return y;
    }

    // PASS B: ANY NON-FORBIDDEN ROW (NO AIRSPACE REQUIRED — NONE EXISTS IN DARK
    // ART), CLOSEST TO IDEAL, TIE-BROKEN BY LOWEST VISUAL ENERGY.
    let mut best: Option<u32> = None;
    let mut best_dist = f32::INFINITY;
    let mut best_energy = f32::INFINITY;
    for y in search_start..=search_end {
        if !is_point_forbidden(y as i32, forbidden_zones) {
            let yi = y as usize;
            let energy = profile.row_variances[yi] + profile.row_edge_energy[yi] * 5.0;
            let d = (y as f32 - ideal_cut).abs();
            // STRICTEST CLOSEST-TO-IDEAL WINS; EXACT DISTANCE TIES BROKEN BY LOWER ENERGY.
            if d < best_dist || (d == best_dist && energy < best_energy) {
                best_dist = d;
                best_energy = energy;
                best = Some(y);
            }
        }
    }
    if let Some(y) = best {
        return y;
    }

    // PASS C: EXPAND OUTWARD FOR THE NEAREST NON-FORBIDDEN ROW BEFORE DEFAULTING.
    for offset in 1..=600 {
        if search_start >= offset + 100 {
            let y = search_start - offset;
            if !is_point_forbidden(y as i32, forbidden_zones) {
                return y;
            }
        }
        if search_end + offset < total_h {
            let y = search_end + offset;
            if !is_point_forbidden(y as i32, forbidden_zones) {
                return y;
            }
        }
    }

    // LAST RESORT: EVERY CANDIDATE ROW IS FORBIDDEN — CUT AT THE IDEAL HEIGHT.
    ideal_cut.min(search_end as f32).max(search_start as f32) as u32
}

/// STITCH MULTIPLE VERTICAL IMAGE STRIPS INTO A SINGLE UNIFIED CANVAS VIA CONTIGUOUS BYTE COPIES
pub fn stitch_images_vertically(images: &[DynamicImage]) -> DynamicImage {
    if images.is_empty() {
        return DynamicImage::new_rgb8(0, 0);
    }
    if images.len() == 1 {
        return images[0].clone();
    }

    let max_w = images.iter().map(|img| img.width()).max().unwrap_or(0);
    if max_w == 0 {
        return DynamicImage::new_rgb8(0, 0);
    }

    let mut total_h = 0;
    let mut rgb_buffers = Vec::with_capacity(images.len());

    for img in images {
        let (w, h) = img.dimensions();
        if w != max_w {
            let new_h = (h as f32 * (max_w as f32 / w as f32)).round() as u32;
            let rgb_img = img.to_rgb8();
            let resized = image::imageops::resize(
                &rgb_img,
                max_w,
                new_h,
                image::imageops::FilterType::Triangle,
            );
            total_h += new_h;
            rgb_buffers.push(resized.into_raw());
        } else {
            let rgb_img = img.to_rgb8();
            total_h += h;
            rgb_buffers.push(rgb_img.into_raw());
        }
    }

    // CONTIGUOUS ALLOCATION AND FAST SLICE COPY
    let mut canvas_raw = vec![0_u8; (max_w as usize) * (total_h as usize) * 3];
    let mut curr_offset = 0;

    for raw_buf in rgb_buffers {
        let len = raw_buf.len();
        canvas_raw[curr_offset..curr_offset + len].copy_from_slice(&raw_buf);
        curr_offset += len;
    }

    if let Some(buf) = ImageBuffer::<Rgb<u8>, Vec<u8>>::from_raw(max_w, total_h, canvas_raw) {
        DynamicImage::ImageRgb8(buf)
    } else {
        DynamicImage::new_rgb8(max_w, total_h)
    }
}

/// SMART RESLICE CHAPTER WITH DIALOGUE BUBBLE & TEXT PROTECTION
///
/// `cancel` (WHEN PROVIDED) HOLDS THE RUN ID THE CLIENT ASKED TO STOP; THE
/// WORK BAILS AT THE NEXT CHECKPOINT WHEN IT MATCHES `run_id`. A CANCELLED
/// RUN RETURNS A PARTIAL/EMPTY PAGE LIST — THE CALLER MUST CHECK THE FLAG.
pub fn smart_reslice_chapter(
    images: &[DynamicImage],
    target_height: u32,
    min_height: u32,
    max_height: u32,
    detector: Option<&mut ComicTextDetector>,
    ocr: Option<&mut RapidOcr>,
    on_progress: Option<&ResliceProgressFn>,
    cancel: Option<&AtomicU64>,
    run_id: u64,
) -> Vec<DynamicImage> {
    if images.is_empty() {
        return Vec::new();
    }
    if let Some(cb) = on_progress {
        cb(0);
    }

    let stitched = stitch_images_vertically(images);
    if is_run_cancelled(cancel, run_id) {
        return Vec::new();
    }
    let (w, total_h) = stitched.dimensions();
    if total_h <= max_height {
        // SINGLE PAGE — SKIP ANALYSIS & SLICING; HAND STRAIGHT TO THE ENCODING
        // PHASE (90) SO THE BAR NEVER MOVES BACKWARDS.
        if let Some(cb) = on_progress {
            cb(90);
        }
        return vec![stitched];
    }

    let cut_points = find_optimal_cut_points_with_detectors(
        &stitched,
        target_height,
        min_height,
        max_height,
        detector,
        ocr,
        on_progress,
        cancel,
        run_id,
    );
    if is_run_cancelled(cancel, run_id) {
        return Vec::new();
    }

    // PHASE C (80..=90%): SLICE THE CANVAS INTO PAGES AT THE CHOSEN CUT POINTS.
    // FAST CROPS ONLY — SMALL BAND. THE ENCODING PHASE IN THE HANDLER OWNS 90..=99.
    let mut pages = Vec::new();
    let mut prev_y = 0_u32;
    let total_cuts = cut_points.len().max(1) as u32;

    for (idx, cut_y) in cut_points.into_iter().enumerate() {
        if is_run_cancelled(cancel, run_id) {
            break;
        }
        if cut_y <= prev_y {
            continue;
        }
        let slice_h = cut_y - prev_y;
        if slice_h > 0 {
            let slice = stitched.crop_imm(0, prev_y, w, slice_h);
            pages.push(slice);
        }
        prev_y = cut_y;
        if let Some(cb) = on_progress {
            let frac = (idx as u32 + 1) as f32 / total_cuts as f32;
            cb(80 + (frac * 10.0) as u32);
        }
    }

    if let Some(cb) = on_progress {
        cb(90);
    }

    pages
}

#[cfg(test)]
mod tests {
    use super::*;

    fn textured_profile(total_h: u32) -> RowProfile {
        let n = total_h as usize;
        // EVERY ROW IS "TEXTURED ART": HIGH VARIANCE & EDGE ENERGY SO NO CLEAR
        // AIRSPACE EXISTS ANYWHERE (MIMICS A DARK PANEL WITH NO CLEAN GUTTER).
        RowProfile {
            row_variances: vec![200.0; n],
            max_col_var: vec![200.0; n],
            row_diffs: vec![100.0; n],
            row_edge_energy: vec![100.0; n],
        }
    }

    /// THE LAST-RESORT FALLBACK MUST NEVER CUT THROUGH A FORBIDDEN (TEXT) ZONE.
    /// REGRESSION FOR A DARK PANEL WHERE NO GUTTER EXISTS AND THE CUT USED TO
    /// LAND BLINDLY AT `target_height`, SPLITTING DETECTED DIALOGUE.
    #[test]
    fn fallback_cut_avoids_forbidden_zones() {
        let total_h = 2600;
        let profile = textured_profile(total_h);
        let forbidden = vec![(1590, 1610)]; // COVERS THE IDEAL CUT (1600)

        let cut = fallback_cut(&profile, &forbidden, 800, 2200, 1600.0, total_h);

        assert!(
            !is_point_forbidden(cut as i32, &forbidden),
            "fallback cut {cut} landed inside a forbidden dialogue zone!"
        );
        // CLOSEST NON-FORBIDDEN ROW TO THE IDEAL (TIE-BROKEN BY ENERGY — ALL EQUAL).
        assert!(
            cut == 1589 || cut == 1611,
            "fallback cut {cut} is not the closest non-forbidden row to ideal (expected 1589 or 1611)"
        );
    }

    /// WHEN A WIDE CLEAN GUTTER EXISTS, THE FALLBACK PREFERS IT (CLEAR AIRSPACE)
    /// OVER TEXTURED ART — EVEN IF IT IS FURTHER FROM THE IDEAL CUT.
    #[test]
    fn fallback_cut_prefers_clean_gutter() {
        let total_h = 2600;
        let mut profile = textured_profile(total_h);
        // ADD A WIDE FLAT GUTTER (1680..1720) WITH CLEAR AIRSPACE ON BOTH SIDES.
        for y in 1680..1720 {
            profile.row_variances[y] = 1.0;
            profile.max_col_var[y] = 1.0;
            profile.row_diffs[y] = 0.0;
            profile.row_edge_energy[y] = 0.0;
        }
        let forbidden: Vec<(i32, i32)> = Vec::new();

        let cut = fallback_cut(&profile, &forbidden, 800, 2200, 1600.0, total_h);

        assert!(
            (1680..=1720).contains(&cut),
            "fallback should prefer the wide clean gutter, got {cut}"
        );
    }
}
