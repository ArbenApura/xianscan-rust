// -- CRATE / EXTERNAL IMPORTS -- //
// (NO EXTERNAL CRATE IMPORTS)

// -- INTERNAL IMPORTS -- //
use crate::ml::geometry::box_iou;
use crate::ml::schemas::{BoxRect, Region, RegionKind};
use super::geometry::expand_box;

// -- CONSTANTS -- //
// SAFE INTERIOR INSET FROM THE STROKED BUBBLE OUTLINE (INSCRIBED CORE THE TEXT MAY FILL)
const BUBBLE_INSET_FRAC: f32 = 0.12;
const BUBBLE_INSET_MIN: i32 = 8;
const BUBBLE_INSET_MAX: i32 = 48;
// MIN GAP KEPT BETWEEN A BUBBLE TEXT BOX AND ITS SIBLING TEXT (FUSED 2-3 TEXT BUBBLES)
const SIBLING_GAP: i32 = 5;
// THRESHOLDS: ONLY SCALE AN AXIS WHEN THE UNUSED ROOM EXCEEDS THESE (NO-OP ON CRAMPED BUBBLES)
const MIN_UNUSED_RATIO: f32 = 0.10;
const MIN_SCALE: f32 = 1.10;
const EXPANSION_SLACK_DAMPING: f32 = 0.50;
const MAX_EXPANSION_SCALE: f32 = 1.30;
const MAX_EXPANSION_SCALE_VERTICAL: f32 = 2.00;

// -- FUNCTIONS & ALGORITHMS -- //

/// INSCRIBED SAFE CORE OF A BUBBLE (THE STROKED OUTLINE IS AVOIDED). RETURNS (LEFT, RIGHT, TOP, BOTTOM).
pub fn bubble_core(b: &BoxRect) -> Option<(i32, i32, i32, i32)> {
    let mx = ((b.w as f32 * BUBBLE_INSET_FRAC) as i32).clamp(BUBBLE_INSET_MIN, BUBBLE_INSET_MAX);
    let my = ((b.h as f32 * BUBBLE_INSET_FRAC) as i32).clamp(BUBBLE_INSET_MIN, BUBBLE_INSET_MAX);
    let left = b.x + mx;
    let right = b.x + b.w - mx;
    let top = b.y + my;
    let bottom = b.y + b.h - my;
    if right - left <= 8 || bottom - top <= 8 {
        None
    } else {
        Some((left, right, top, bottom))
    }
}

/// CLAMP A BOX SO IT STAYS WITHIN THE BUBBLE'S SAFE CORE.
pub fn clamp_box_to_core(b: &mut BoxRect, left: i32, right: i32, top: i32, bottom: i32) {
    let mut x = b.x.max(left);
    let mut r = (b.x + b.w).min(right);
    if r < x + 1 {
        r = (x + 1).min(right);
    }
    if r < x + 1 {
        x = r - 1;
    }
    b.x = x.max(0);
    b.w = (r - x).max(1);

    let mut y = b.y.max(top);
    let mut bot = (b.y + b.h).min(bottom);
    if bot < y + 1 {
        bot = (y + 1).min(bottom);
    }
    if bot < y + 1 {
        y = bot - 1;
    }
    b.y = y.max(0);
    b.h = (bot - y).max(1);
}

/// EXPAND DIALOGUE-BUBBLE TEXT BASE BOUNDARY TO BETTER UTILIZE THE UNUSED AREA WITHIN ITS BUBBLE.
///
/// KEEPS THE TEXT ANCHOR (BOX CENTROID) STRICTLY FIXED AND SCALES EACH AXIS SYMMETRICALLY ABOUT IT.
/// EVERY SCALED BOX IS BOUNDED BY (A) THE BUBBLE'S INSCRIBED SAFE CORE AND (B) THE NEAREST SIBLING
/// TEXT REGION INSIDE THE SAME COMBINED BUBBLE. IT IS A NO-OP WHEN THE UNUSED ROOM FALLS BELOW
/// THRESHOLD, SO CRAMPED BUBBLES ARE NEVER ALTERED. THE INPAINT MASK POLYGON IS LEFT TIGHT.
pub fn expand_bubble_text_boxes(regions: &mut Vec<Region>, page_w: u32, page_h: u32, inpaint_pct: f32, typeset_pct: f32) {
    if regions.is_empty() {
        return;
    }

    let is_bubble = |r: &Region| r.kind == RegionKind::DialogueBubble && r.bubble_box.is_some();
    let indexes: Vec<usize> = (0..regions.len()).filter(|&i| is_bubble(&regions[i])).collect();
    if indexes.is_empty() {
        return;
    }

    // PHASE 1: COMPUTE TARGET BASE BOXES FROM ORIGINAL GEOMETRY ONLY.
    // SIBLING LIMITS READ ORIGINAL (UNSCALED) BOXES SO THEY NEVER DEPEND ON ALREADY-SCALED NEIGHBORS.
    let mut targets: Vec<Option<BoxRect>> = vec![None; regions.len()];

    for &i in &indexes {
        let r = &regions[i];
        let (bx, by, bw, bh) = (r.box_.x, r.box_.y, r.box_.w, r.box_.h);
        if bw <= 2 || bh <= 2 {
            continue;
        }
        let b = match r.bubble_box.as_ref() {
            Some(b) => b,
            None => continue,
        };
        let (left, right, top, bottom) = match bubble_core(b) {
            Some(c) => c,
            None => continue,
        };

        let cx = bx + bw / 2;
        let cy = by + bh / 2;

        // PER-EDGE LIMITS START AT THE BUBBLE SAFE CORE, THEN SHRINK TOWARD THE NEAREST SIBLING.
        let mut left_limit = left;
        let mut right_limit = right;
        let mut top_limit = top;
        let mut bottom_limit = bottom;

        for &j in &indexes {
            if i == j {
                continue;
            }
            let bi = regions[i].bubble_box.as_ref().unwrap();
            let bj = match regions[j].bubble_box.as_ref() {
                Some(bj) => bj,
                None => continue,
            };
            if box_iou(bi, bj) < 0.5 {
                continue;
            }
            let s = &regions[j].box_;
            // HORIZONTAL INFLUENCE (VERTICAL SPANS OVERLAP)
            let y_overlap = (by + bh) > s.y && (s.y + s.h) > by;
            if y_overlap {
                if (s.x + s.w) <= cx && (s.x + s.w) > left_limit - SIBLING_GAP {
                    left_limit = (s.x + s.w + SIBLING_GAP).min(right);
                }
                if s.x >= cx && s.x < right_limit + SIBLING_GAP {
                    right_limit = (s.x - SIBLING_GAP).max(left);
                }
            }
            // VERTICAL INFLUENCE (HORIZONTAL SPANS OVERLAP)
            let x_overlap = (bx + bw) > s.x && (s.x + s.w) > bx;
            if x_overlap {
                if (s.y + s.h) <= cy && (s.y + s.h) > top_limit - SIBLING_GAP {
                    top_limit = (s.y + s.h + SIBLING_GAP).min(bottom);
                }
                if s.y >= cy && s.y < bottom_limit + SIBLING_GAP {
                    bottom_limit = (s.y - SIBLING_GAP).max(top);
                }
            }
        }

        let mut new_box = r.box_.clone();

        // WIDTH AXIS: STRICT CENTROID ANCHOR WITH DAMPED SLACK EXPANSION
        {
            let center = cx as f32;
            let half = bw as f32 / 2.0;
            let max_safe_half = (center - left_limit as f32).min(right_limit as f32 - center);
            if max_safe_half > half {
                let raw_scale = max_safe_half / half;
                let usable = (right_limit as f32 - left_limit as f32) - bw as f32;
                if usable >= bw as f32 * MIN_UNUSED_RATIO && raw_scale >= MIN_SCALE {
                    let is_narrow_vertical = r.vertical && bw < bh / 2;
                    let damping = if is_narrow_vertical { 1.0 } else { EXPANSION_SLACK_DAMPING };
                    let cap = if is_narrow_vertical { MAX_EXPANSION_SCALE_VERTICAL } else { MAX_EXPANSION_SCALE };
                    let damped_scale = 1.0 + (raw_scale - 1.0) * damping;
                    let final_scale = damped_scale.min(cap).min(raw_scale);
                    let nh = (half * final_scale).round() as i32;
                    let nx = cx - nh;
                    let nr = cx + nh;
                    if nr > nx && nx >= left_limit && nr <= right_limit {
                        new_box.x = nx;
                        new_box.w = nr - nx;
                    }
                }
            }
        }

        // HEIGHT AXIS: STRICT CENTROID ANCHOR WITH DAMPED SLACK EXPANSION
        {
            let center = cy as f32;
            let half = bh as f32 / 2.0;
            let max_safe_half = (center - top_limit as f32).min(bottom_limit as f32 - center);
            if max_safe_half > half {
                let raw_scale = max_safe_half / half;
                let usable = (bottom_limit as f32 - top_limit as f32) - bh as f32;
                if usable >= bh as f32 * MIN_UNUSED_RATIO && raw_scale >= MIN_SCALE {
                    let damped_scale = 1.0 + (raw_scale - 1.0) * EXPANSION_SLACK_DAMPING;
                    let final_scale = damped_scale.min(MAX_EXPANSION_SCALE).min(raw_scale);
                    let nh = (half * final_scale).round() as i32;
                    let ny = cy - nh;
                    let nb = cy + nh;
                    if nb > ny && ny >= top_limit && nb <= bottom_limit {
                        new_box.y = ny;
                        new_box.h = nb - ny;
                    }
                }
            }
        }

        if new_box != r.box_ {
            targets[i] = Some(new_box);
        }
    }

    // PHASE 2: APPLY TARGETS AND GUARANTEE BASE BOX STAYS WITHIN BUBBLE BOUNDARY.
    for &i in &indexes {
        let b = regions[i].bubble_box.clone().unwrap();
        let (outer_l, outer_r, outer_t, outer_b) = (b.x, b.x + b.w, b.y, b.y + b.h);

        if let Some(new_box) = &targets[i] {
            // COLLISION ROLLBACK AGAINST NON-SIBLING REGIONS (FREE TEXT / SFX / OTHER BUBBLES)
            let collides = regions.iter().enumerate().any(|(j, o)| {
                j != i
                    && o.box_.w > 0
                    && o.box_.h > 0
                    && {
                        let ax1 = (new_box.x + new_box.w).min(o.box_.x + o.box_.w);
                        let ay1 = (new_box.y + new_box.h).min(o.box_.y + o.box_.h);
                        let ix = (ax1 - new_box.x.max(o.box_.x)).max(0);
                        let iy = (ay1 - new_box.y.max(o.box_.y)).max(0);
                        let inter = (ix * iy) as f32;
                        let area = (new_box.w * new_box.h).max(1) as f32;
                        inter / area >= 0.35
                    }
            });
            if !collides {
                regions[i].box_ = new_box.clone();
            }
        }

        // GUARANTEE: BASE BOX MUST NEVER EXCEED OUTER BUBBLE BOUNDARY
        clamp_box_to_core(&mut regions[i].box_, outer_l, outer_r, outer_t, outer_b);

        // SAFE-CORE CENTERING FOR SOLE-OCCUPANT HORIZONTAL BUBBLES
        let is_sole_occupant = indexes.iter().all(|&j| {
            if i == j {
                return true;
            }
            match regions[j].bubble_box.as_ref() {
                Some(bj) => box_iou(&b, bj) < 0.5,
                None => true,
            }
        });

        let is_horizontal_bubble = (b.w as f32) >= (b.h as f32) * 1.35;
        let vertical_fill_ratio = regions[i].box_.h as f32 / b.h.max(1) as f32;
        let has_healthy_vertical_fill = vertical_fill_ratio >= 0.45 && vertical_fill_ratio <= 0.85;

        let dx = ((regions[i].box_.x + regions[i].box_.w / 2) - (b.x + b.w / 2)).abs() as f32;
        let dy = ((regions[i].box_.y + regions[i].box_.h / 2) - (b.y + b.h / 2)).abs() as f32;
        let is_near_center = dx <= (b.w as f32 * 0.055) && dy <= (b.h as f32 * 0.055);

        if is_sole_occupant && is_horizontal_bubble && has_healthy_vertical_fill && is_near_center {
            let mut typeset_box = expand_box(&regions[i].box_, typeset_pct, page_w, page_h);
            let bubble_cx = b.x + b.w / 2;
            let bubble_cy = b.y + b.h / 2;
            typeset_box.x = bubble_cx - typeset_box.w / 2;
            typeset_box.y = bubble_cy - typeset_box.h / 2;
            clamp_box_to_core(&mut typeset_box, outer_l, outer_r, outer_t, outer_b);
            regions[i].typeset_box = Some(typeset_box);
        } else {
            let mut typeset_box = expand_box(&regions[i].box_, typeset_pct, page_w, page_h);
            clamp_box_to_core(&mut typeset_box, outer_l, outer_r, outer_t, outer_b);
            regions[i].typeset_box = Some(typeset_box);
        }

        let mut inpaint_box = expand_box(&regions[i].box_, inpaint_pct, page_w, page_h);
        clamp_box_to_core(&mut inpaint_box, outer_l, outer_r, outer_t, outer_b);
        regions[i].inpaint_box = Some(inpaint_box);
    }
}
