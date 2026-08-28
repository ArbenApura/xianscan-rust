// -- CRATE / EXTERNAL IMPORTS -- //
// (NO EXTERNAL CRATE IMPORTS)

// -- INTERNAL IMPORTS -- //
use crate::ml::geometry::box_iou;
use crate::ml::schemas::{BoxRect, Region, RegionKind};
use super::geometry::expand_box;

// -- CONSTANTS -- //
// SAFE INTERIOR INSET FROM THE STROKED BUBBLE OUTLINE (INSCRIBED CORE THE TEXT MAY FILL)
const BUBBLE_INSET_FRAC: f32 = 0.08;
const BUBBLE_INSET_MIN: i32 = 6;
const BUBBLE_INSET_MAX: i32 = 18;
// MIN GAP KEPT BETWEEN A BUBBLE TEXT BOX AND ITS SIBLING TEXT (FUSED 2-3 TEXT BUBBLES)
const SIBLING_GAP: i32 = 5;
// THRESHOLDS: ONLY SCALE AN AXIS WHEN THE UNUSED ROOM EXCEEDS THESE (NO-OP ON CRAMPED BUBBLES)
const MIN_UNUSED_RATIO: f32 = 0.10;
const MIN_SCALE: f32 = 1.10;
// PER-AXIS SAFE SCALE CAPS (PRIMARY = READING-DIRECTION AXIS, SECONDARY = CROSS AXIS)
const CAP_PRIMARY: f32 = 1.35;
const CAP_SECONDARY: f32 = 1.20;
// CROSS AXIS USES ONLY THIS FRACTION OF ITS AVAILABLE ROOM
const CROSS_AXIS_FRACTION: f32 = 0.70;

// -- FUNCTIONS & ALGORITHMS -- //

/// INSCRIBED SAFE CORE OF A BUBBLE (THE STROKED OUTLINE IS AVOIDED). RETURNS (LEFT, RIGHT, TOP, BOTTOM).
pub fn bubble_core(b: &BoxRect) -> Option<(i32, i32, i32, i32)> {
    let m = ((b.w.min(b.h) as f32 * BUBBLE_INSET_FRAC) as i32).clamp(BUBBLE_INSET_MIN, BUBBLE_INSET_MAX);
    let left = b.x + m;
    let right = b.x + b.w - m;
    let top = b.y + m;
    let bottom = b.y + b.h - m;
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
/// KEEPS THE TEXT ANCHOR (BOX CENTROID) EXACTLY FIXED AND SCALES EACH AXIS SYMMETRICALLY ABOUT IT.
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

        // TRUST VERTICAL ORIENTATION ONLY WHEN THE CONTAINER IS CLEARLY VERTICAL (STRONG ASPECT EVIDENCE).
        let vertical = r.vertical && (bh as f32) >= (bw as f32) * 1.25;

        let mut new_box = r.box_.clone();

        // WIDTH AXIS (PRIMARY FOR HORIZONTAL TEXT)
        {
            let center = cx as f32;
            let half = bw as f32 / 2.0;
            let lower_ext = (center - left_limit as f32).max(half);
            let upper_ext = (right_limit as f32 - center).max(half);
            let is_primary = !vertical;
            let cap = if is_primary { CAP_PRIMARY } else { CAP_SECONDARY };
            let mut scale = (lower_ext.min(upper_ext) / half).min(cap);
            if !is_primary {
                scale = 1.0 + (scale - 1.0) * CROSS_AXIS_FRACTION;
            }
            let usable = (right_limit as f32 - left_limit as f32) - bw as f32;
            if usable >= bw as f32 * MIN_UNUSED_RATIO && scale >= MIN_SCALE {
                let nh = (half * scale).round() as i32;
                let nx = cx - nh;
                let nr = cx + nh;
                if nr > nx {
                    new_box.x = nx.max(left);
                    new_box.w = (nr.min(right) - new_box.x).max(1);
                }
            }
        }

        // HEIGHT AXIS (PRIMARY FOR VERTICAL TEXT)
        {
            let center = cy as f32;
            let half = bh as f32 / 2.0;
            let lower_ext = (center - top_limit as f32).max(half);
            let upper_ext = (bottom_limit as f32 - center).max(half);
            let is_primary = vertical;
            let cap = if is_primary { CAP_PRIMARY } else { CAP_SECONDARY };
            let mut scale = (lower_ext.min(upper_ext) / half).min(cap);
            if !is_primary {
                scale = 1.0 + (scale - 1.0) * CROSS_AXIS_FRACTION;
            }
            let usable = (bottom_limit as f32 - top_limit as f32) - bh as f32;
            if usable >= bh as f32 * MIN_UNUSED_RATIO && scale >= MIN_SCALE {
                let nh = (half * scale).round() as i32;
                let ny = cy - nh;
                let nb = cy + nh;
                if nb > ny {
                    new_box.y = ny.max(top);
                    new_box.h = (nb.min(bottom) - new_box.y).max(1);
                }
            }
        }

        if new_box != r.box_ {
            targets[i] = Some(new_box);
        }
    }

    // PHASE 2: APPLY TARGETS AND RE-DERIVE INPAINT / TYPESET BOXES, THEN SANITY-ROLLBACK COLLISIONS.
    for &i in &indexes {
        let new_box = match &targets[i] {
            Some(nb) => nb.clone(),
            None => continue,
        };
        let b = regions[i].bubble_box.as_ref().unwrap();
        let (left, right, top, bottom) = (b.x, b.x + b.w, b.y, b.y + b.h);

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
        if collides {
            continue;
        }

        regions[i].box_ = new_box;

        let mut tb = expand_box(&regions[i].box_, typeset_pct, page_w, page_h);
        clamp_box_to_core(&mut tb, left, right, top, bottom);
        regions[i].typeset_box = Some(tb);

        let mut ib = expand_box(&regions[i].box_, inpaint_pct, page_w, page_h);
        clamp_box_to_core(&mut ib, left, right, top, bottom);
        regions[i].inpaint_box = Some(ib);
    }
}
