// -- CRATE / EXTERNAL IMPORTS -- //
use image::DynamicImage;

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

/// DERIVE CARRIER (BODY) BOX BY DETECTING AND TRIMMING DIRECTIONAL TAILS/POINTERS.
///
/// IN SOLE-OCCUPANT DIALOGUE BUBBLES, TEXT IS CENTERED IN THE MAIN BALLOON BODY (CARRIER).
/// IF AN ASYMMETRIC TAIL PROTRUDES (SKEW >= 2.0x AND DELTA >= 15PX), TRIMS THE TAIL SLACK
/// TO RESTORE THE VISUAL CARRIER CHAMBER.
pub fn derive_carrier_box(b: &BoxRect, t: &BoxRect, page_h: u32) -> BoxRect {
    let mut carrier = b.clone();

    let m_top = (t.y - b.y).max(0);
    let m_bot = ((b.y + b.h) - (t.y + t.h)).max(0);
    let m_left = (t.x - b.x).max(0);
    let m_right = ((b.x + b.w) - (t.x + t.w)).max(0);

    let m_side = m_left.min(m_right);
    let m_vert = m_top.min(m_bot);

    // VERTICAL TAILS:
    // SKEWED BY >= 1.30x AND MIN 26PX DELTA BETWEEN TOP AND BOTTOM MARGINS.
    // IF THE BUBBLE EXTENDS NEAR THE TOP OR BOTTOM CANVAS EDGE (b.y <= 12 OR b.y + b.h >= page_h - 12),
    // IT IS CUT/SEVERED BY THE SLICE SEAM RATHER THAN HAVING A TRUE ASYMMETRIC TAIL, SO BYPASS VERTICAL TAIL TRIMMING.
    let is_top_or_bottom_edge = b.y <= 12 || (b.y + b.h) as u32 >= page_h.saturating_sub(12);
    if !is_top_or_bottom_edge {
        if m_bot as f32 >= m_top as f32 * 1.30 && (m_bot - m_top) >= 26 {
            // DOWNWARD TAIL: TOP/LEFT/RIGHT ARE TRUE BUBBLE BOUNDARIES, TRIM BOTTOM EXCESS
            let safe_pad = (m_top as f32).min(m_side as f32 * 0.90).max(12.0).round() as i32;
            let eff_bottom = (t.y + t.h + safe_pad).min(b.y + b.h);
            carrier.h = (eff_bottom - b.y).max(t.h + 10);
        } else if m_top as f32 >= m_bot as f32 * 1.30 && (m_top - m_bot) >= 26 {
            // UPWARD TAIL: BOTTOM/LEFT/RIGHT ARE TRUE BUBBLE BOUNDARIES, TRIM TOP EXCESS
            let safe_pad = (m_bot as f32).min(m_side as f32 * 0.90).max(12.0).round() as i32;
            let eff_top = (t.y - safe_pad).max(b.y);
            carrier.h = (b.y + b.h - eff_top).max(t.h + 10);
            carrier.y = eff_top;
        }
    }

    // HORIZONTAL TAILS:
    // SKEWED BY >= 1.50x AND MIN 22PX DELTA BETWEEN LEFT AND RIGHT MARGINS
    if m_right as f32 >= m_left as f32 * 1.50 && (m_right - m_left) >= 22 {
        // RIGHTWARD TAIL: TOP/BOTTOM/LEFT ARE TRUE BUBBLE BOUNDARIES, TRIM RIGHT EXCESS
        let safe_pad = (m_left as f32).min(m_vert as f32 * 0.90).max(12.0).round() as i32;
        let eff_right = (t.x + t.w + safe_pad).min(b.x + b.w);
        carrier.w = (eff_right - b.x).max(t.w + 10);
    } else if m_left as f32 >= m_right as f32 * 1.50 && (m_left - m_right) >= 22 {
        // LEFTWARD TAIL: TOP/BOTTOM/RIGHT ARE TRUE BUBBLE BOUNDARIES, TRIM LEFT EXCESS
        let safe_pad = (m_right as f32).min(m_vert as f32 * 0.90).max(12.0).round() as i32;
        let eff_left = (t.x - safe_pad).max(b.x);
        carrier.w = (b.x + b.w - eff_left).max(t.w + 10);
        carrier.x = eff_left;
    }

    carrier
}

/// VALIDATES A DERIVED CARRIER AS A GENUINE TAIL-CUT BUBBLE BOUNDARY.
///
/// A CARRIER IS TRUSTWORTHY ONLY WHEN A GENUINE DIRECTIONAL TAIL WAS SEVERED
/// (SIGNIFICANT REDUCTION ON ONE DOMINANT PROTRUDING EDGE WITH NEGLIGIBLE TRIM ON THE OPPOSITE WALL).
/// UNIFORM MULTI-EDGE SHRINKAGE (SUCH AS EROSION OF RADIATING SPIKES ON A BURST/SHOUT BUBBLE,
/// OR PERIMETER ANTI-ALIASING VARIATIONS) DOES NOT CONSTITUTE A REAL TAIL CUT.
pub fn valid_tail_cut_carrier(carrier: &BoxRect, b: &BoxRect, page_h: u32) -> bool {
    // NO REAL CUT HAPPENED (SHARED BUBBLE, SYMMETRIC BODY, OR EXTRACTION FALLBACK TO B)
    if *carrier == *b {
        return false;
    }

    // DIRECTIONAL ASYMMETRY CHECK: A REAL TAIL CUT CUTS DEEPLY INTO ONE EDGE
    // WHILE LEAVING THE OPPOSITE CHAMBER BOUNDARY VIRTUALLY UNTOUCHED.
    // ON LARGE BUBBLES (>200PX), DETECTOR PADDING AND OVAL CURVATURE NATURALLY YIELD 8-13PX PERIMETER SLACK.
    let trim_left = (carrier.x - b.x).max(0);
    let trim_right = ((b.x + b.w) - (carrier.x + carrier.w)).max(0);
    let trim_top = (carrier.y - b.y).max(0);
    let trim_bot = ((b.y + b.h) - (carrier.y + carrier.h)).max(0);

    let max_opp_v = 6.max((b.h as f32 * 0.04).round() as i32);
    let max_opp_h = 6.max((b.w as f32 * 0.04).round() as i32);

    let is_h_cut = (trim_right >= 12 && trim_left <= max_opp_h && trim_right >= trim_left * 2)
        || (trim_left >= 12 && trim_right <= max_opp_h && trim_left >= trim_right * 2);

    let is_v_cut = (trim_bot >= 14 && trim_top <= max_opp_v && trim_bot >= trim_top * 2)
        || (trim_top >= 14 && trim_bot <= max_opp_v && trim_top >= trim_bot * 2);

    if !is_h_cut && !is_v_cut {
        return false;
    }

    // DEGENERATE CHAMBER GUARD: EROSION/DILATION ARTIFACTS OR MICRO BODIES ARE UNTRUSTWORTHY
    if carrier.w < 20 || carrier.h < 20 {
        return false;
    }
    // EDGE-CUT BUBBLES: THE SLICE SEAM MIMICS A TAIL, SO CARRIER DERIVATION IS UNRELIABLE
    if b.y <= 12 || (b.y + b.h) as u32 >= page_h.saturating_sub(12) {
        return false;
    }
    true
}

/// RESOLVE CARRIER (BODY) BOX BY COOPERATIVE CROSS-VALIDATION OF GEOMETRIC AND MORPHOLOGICAL ENGINES.
///
/// WHEN BOTH GEOMETRIC AND IMAGE MORPHOLOGY EXTRACTORS AGREE ON A GENUINE CUT, COMBINES THEIR BOUNDARIES
/// CONSERVATIVELY ALONG THE TRIMMED AXIS. WHEN IMAGE MORPHOLOGY MISSES AN ASYMMETRIC PROTRUSION (SUCH AS
/// BULBOUS THOUGHT LOBES WHOSE RADIUS EXCEEDS DISK EROSION KERNELS), THE GEOMETRIC MARGIN DETECTOR RESCUES
/// THE CUT CHAMBER.
pub fn resolve_carrier_box(
    b: &BoxRect,
    t: &BoxRect,
    img: Option<&DynamicImage>,
    page_h: u32,
) -> (BoxRect, bool) {
    let geom_carrier = derive_carrier_box(b, t, page_h);
    let geom_is_cut = valid_tail_cut_carrier(&geom_carrier, b, page_h);

    if let Some(image) = img {
        let img_carrier = super::geometry::extract_carrier_box_from_image(image, b, t);
        let img_is_cut = valid_tail_cut_carrier(&img_carrier, b, page_h);
        if img_is_cut && geom_is_cut {
            // BOTH ENGINES DETECTED A CUT:
            // IMAGE MORPHOLOGY SEGMENTS THE PHYSICAL BUBBLE PIXELS. IF IMAGE MORPHOLOGY HAS ALREADY
            // RESTORED A BALANCED BUBBLE CHAMBER ALONG THE CUT AXIS (REMAINING MARGIN IS WITHIN 1.35x
            // OF OPPOSITE NON-TAIL MARGIN), TRUST THE EXACT PIXEL BOUNDARY FROM IMAGE MORPHOLOGY.
            // ONLY IF IMAGE MORPHOLOGY UNDER-TRIMMED A WIDE BULBOUS LOBE (REMAINING MARGIN IS STILL SKEWED
            // BY >= 1.35x AND >= 10PX OVER OPPOSITE MARGIN), ALLOW GEOMETRIC MARGIN RESCUE TO TIGHTEN.
            let m_top_orig = (t.y - b.y).max(0);
            let m_bot_orig = ((b.y + b.h) - (t.y + t.h)).max(0);
            let m_left_orig = (t.x - b.x).max(0);
            let m_right_orig = ((b.x + b.w) - (t.x + t.w)).max(0);

            let eff_x = if carrier_trim_x(&img_carrier, b) >= 8 {
                let m_rem_left = (t.x - img_carrier.x).max(0);
                let left_still_skewed = m_rem_left as f32 >= m_right_orig as f32 * 1.35
                    && (m_rem_left - m_right_orig) >= 10;
                if left_still_skewed && carrier_trim_x(&geom_carrier, b) >= 8 {
                    img_carrier.x.max(geom_carrier.x)
                } else {
                    img_carrier.x
                }
            } else {
                b.x
            };

            let eff_y = if carrier_trim_y(&img_carrier, b) >= 8 {
                let m_rem_top = (t.y - img_carrier.y).max(0);
                let top_still_skewed = m_rem_top as f32 >= m_bot_orig as f32 * 1.35
                    && (m_rem_top - m_bot_orig) >= 10;
                if top_still_skewed && carrier_trim_y(&geom_carrier, b) >= 8 {
                    img_carrier.y.max(geom_carrier.y)
                } else {
                    img_carrier.y
                }
            } else {
                b.y
            };

            let eff_right = if carrier_trim_r(&img_carrier, b) >= 8 {
                let img_r = img_carrier.x + img_carrier.w;
                let m_rem_right = (img_r - (t.x + t.w)).max(0);
                let right_still_skewed = m_rem_right as f32 >= m_left_orig as f32 * 1.35
                    && (m_rem_right - m_left_orig) >= 10;
                if right_still_skewed && carrier_trim_r(&geom_carrier, b) >= 8 {
                    img_r.min(geom_carrier.x + geom_carrier.w)
                } else {
                    img_r
                }
            } else {
                b.x + b.w
            };

            let eff_bot = if carrier_trim_b(&img_carrier, b) >= 8 {
                let img_b = img_carrier.y + img_carrier.h;
                let m_rem_bot = (img_b - (t.y + t.h)).max(0);
                let bot_still_skewed = m_rem_bot as f32 >= m_top_orig as f32 * 1.35
                    && (m_rem_bot - m_top_orig) >= 10;
                if bot_still_skewed && carrier_trim_b(&geom_carrier, b) >= 8 {
                    img_b.min(geom_carrier.y + geom_carrier.h)
                } else {
                    img_b
                }
            } else {
                b.y + b.h
            };

            let eff_w = (eff_right - eff_x).max(t.w);
            let eff_h = (eff_bot - eff_y).max(t.h);
            let fused = BoxRect {
                x: eff_x,
                y: eff_y,
                w: eff_w,
                h: eff_h,
            };
            (fused, true)
        } else if img_is_cut {
            // IMAGE MORPHOLOGY CONFIRMED A GENUINE NARROW TAIL OR BULBOUS LOBE PROTRUSION
            (img_carrier, true)
        } else {
            // IMAGE MORPHOLOGY FOUND NO TAIL PROTRUSION; DO NOT PERMIT BLIND MARGIN ASYMMETRY TO SLICE BALLOON
            (b.clone(), false)
        }
    } else if geom_is_cut {
        (geom_carrier, true)
    } else {
        (b.clone(), false)
    }
}

#[inline]
fn carrier_trim_x(c: &BoxRect, b: &BoxRect) -> i32 {
    (c.x - b.x).max(0)
}

#[inline]
fn carrier_trim_y(c: &BoxRect, b: &BoxRect) -> i32 {
    (c.y - b.y).max(0)
}

#[inline]
fn carrier_trim_r(c: &BoxRect, b: &BoxRect) -> i32 {
    ((b.x + b.w) - (c.x + c.w)).max(0)
}

#[inline]
fn carrier_trim_b(c: &BoxRect, b: &BoxRect) -> i32 {
    ((b.y + b.h) - (c.y + c.h)).max(0)
}

/// EXPAND DIALOGUE-BUBBLE TEXT BASE BOUNDARY TO BETTER UTILIZE THE UNUSED AREA WITHIN ITS BUBBLE.
///
/// KEEPS THE TEXT ANCHOR (BOX CENTROID) STRICTLY FIXED AND SCALES EACH AXIS SYMMETRICALLY ABOUT IT.
/// EVERY SCALED BOX IS BOUNDED BY (A) THE ACTIVE LIMIT ENVELOPE AND (B) THE NEAREST SIBLING
/// TEXT REGION INSIDE THE SAME COMBINED BUBBLE. WHEN A TAIL-CUT CARRIER IS VALIDATED FOR A SOLE
/// OCCUPANT, THE LIMITS COME FROM THE CARRIER CHAMBER INSTEAD OF THE FULL BUBBLE, SO EXPANSION
/// NEVER LEAKS INTO THE SEVERED TAIL. IT IS A NO-OP WHEN THE UNUSED ROOM FALLS BELOW THRESHOLD,
/// SO CRAMPED BUBBLES ARE NEVER ALTERED. THE INPAINT MASK POLYGON IS LEFT TIGHT. THE VALIDATED
/// CARRIER IS PUBLISHED ON THE REGION (`carrier_box`) FOR INSPECT-PAGE BUBBLE VIEWERS.
pub fn expand_bubble_text_boxes(
    regions: &mut Vec<Region>,
    obstacles: &[(BoxRect, BoxRect)],
    img: Option<&DynamicImage>,
    page_w: u32,
    page_h: u32,
    inpaint_pct: f32,
    typeset_pct: f32,
) {
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
    let mut carrier_boxes: Vec<Option<BoxRect>> = vec![None; regions.len()];
    let mut carrier_valid: Vec<bool> = vec![false; regions.len()];

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

        // SOLE-OCCUPANT CHECK FOR CARRIER RECONSTRUCTION
        let has_obstacle = obstacles.iter().any(|(obs_b, _)| box_iou(b, obs_b) >= 0.5);
        let is_sole_occupant = !has_obstacle && indexes.iter().all(|&j| {
            if i == j {
                return true;
            }
            match regions[j].bubble_box.as_ref() {
                Some(bj) => box_iou(b, bj) < 0.5,
                None => true,
            }
        });

        let (carrier_box, valid_carrier) = if is_sole_occupant {
            resolve_carrier_box(b, &r.box_, img, page_h)
        } else {
            (b.clone(), false)
        };
        carrier_boxes[i] = Some(carrier_box.clone());
        carrier_valid[i] = valid_carrier;

        // PHASE 1 LIMIT ENVELOPE: VALIDATED TAIL-CUT CARRIER FIRST (TRUE TEXT CHAMBER),
        // FALLING BACK TO THE FULL BUBBLE SAFE CORE WHEN NO RELIABLE CUT EXISTS.
        let (left, right, top, bottom) = if valid_carrier {
            match bubble_core(&carrier_box) {
                Some(c) => c,
                None => match bubble_core(b) {
                    Some(c) => c,
                    None => continue,
                },
            }
        } else {
            match bubble_core(b) {
                Some(c) => c,
                None => continue,
            }
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

        // OBSTACLES INSIDE THE SAME BUBBLE ALSO CONSTRAIN EXPANSION LIMITS
        for (obs_b, s) in obstacles {
            if box_iou(b, obs_b) < 0.5 {
                continue;
            }
            let y_overlap = (by + bh) > s.y && (s.y + s.h) > by;
            if y_overlap {
                if (s.x + s.w) <= cx && (s.x + s.w) > left_limit - SIBLING_GAP {
                    left_limit = (s.x + s.w + SIBLING_GAP).min(right);
                }
                if s.x >= cx && s.x < right_limit + SIBLING_GAP {
                    right_limit = (s.x - SIBLING_GAP).max(left);
                }
            }
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
        let (mut outer_l, mut outer_r, mut outer_t, mut outer_b) = (b.x, b.x + b.w, b.y, b.y + b.h);

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

        // GUARANTEE: BASE BOX MUST NEVER EXCEED OUTER BUBBLE BOUNDARY UNLESS NEEDED TO COVER ITS OWN TEXT
        clamp_box_to_core(&mut regions[i].box_, outer_l, outer_r, outer_t, outer_b);
        if !regions[i].polygon.is_empty() {
            let mut text_min_x = i32::MAX;
            let mut text_min_y = i32::MAX;
            let mut text_max_x = i32::MIN;
            let mut text_max_y = i32::MIN;
            for p in &regions[i].polygon {
                text_min_x = text_min_x.min(p[0]);
                text_min_y = text_min_y.min(p[1]);
                text_max_x = text_max_x.max(p[0]);
                text_max_y = text_max_y.max(p[1]);
            }
            if text_min_x < regions[i].box_.x || text_max_x > regions[i].box_.x + regions[i].box_.w
                || text_min_y < regions[i].box_.y || text_max_y > regions[i].box_.y + regions[i].box_.h
            {
                let nx = regions[i].box_.x.min(text_min_x);
                let ny = regions[i].box_.y.min(text_min_y);
                let nw = (regions[i].box_.x + regions[i].box_.w).max(text_max_x) - nx;
                let nh = (regions[i].box_.y + regions[i].box_.h).max(text_max_y) - ny;
                regions[i].box_ = BoxRect { x: nx, y: ny, w: nw, h: nh };
            }
        }
        outer_l = outer_l.min(regions[i].box_.x);
        outer_r = outer_r.max(regions[i].box_.x + regions[i].box_.w);
        outer_t = outer_t.min(regions[i].box_.y);
        outer_b = outer_b.max(regions[i].box_.y + regions[i].box_.h);

        // SAFE-CORE CENTERING FOR SOLE-OCCUPANT BUBBLES WITHIN THEIR DERIVED CARRIER
        let has_obstacle = obstacles.iter().any(|(obs_b, _)| box_iou(&b, obs_b) >= 0.5);
        let is_sole_occupant = !has_obstacle && indexes.iter().all(|&j| {
            if i == j {
                return true;
            }
            match regions[j].bubble_box.as_ref() {
                Some(bj) => box_iou(&b, bj) < 0.5,
                None => true,
            }
        });

        // PUBLISH THE VALIDATED TAIL-CUT CARRIER SO THE INSPECT PAGE BUBBLE VIEWER CAN RENDER
        // THE TRUE BALLOON CHAMBER INSTEAD OF THE TAIL-INCLUSIVE ENVELOPE.
        regions[i].carrier_box = if carrier_valid[i] { carrier_boxes[i].clone() } else { None };

        let carrier = carrier_boxes[i].clone().unwrap_or_else(|| {
            if is_sole_occupant {
                let (cb, _) = resolve_carrier_box(&b, &regions[i].box_, img, page_h);
                cb
            } else {
                b.clone()
            }
        });

        let carrier_cx = carrier.x + carrier.w / 2;
        let carrier_cy = carrier.y + carrier.h / 2;

        let vertical_fill_ratio = regions[i].box_.h as f32 / carrier.h.max(1) as f32;
        let has_healthy_vertical_fill = vertical_fill_ratio >= 0.15 && vertical_fill_ratio <= 0.90;
        let is_vertical_edge_cut = b.y <= 12 || (b.y + b.h) as u32 >= page_h.saturating_sub(12);

        // CENTERING ASYMMETRY GUARD: IF AN UTTERANCE SITS SKEWED TOWARD ONE END OF THE CARRIER
        // (E.G. IN A MULTI-CHAMBER BALLOON WHERE THE COMPANION UTTERANCE WAS EXCLUDED/UNTRANSLATABLE),
        // SNAPPING IT TO CARRIER CENTROID DISPLACES IT ACROSS THE BALLOON SEAM.
        let top_m = (regions[i].box_.y - carrier.y).max(0);
        let bot_m = ((carrier.y + carrier.h) - (regions[i].box_.y + regions[i].box_.h)).max(0);
        let min_vm = top_m.min(bot_m) as f32;
        let max_vm = top_m.max(bot_m) as f32;
        let is_vertically_elongated = carrier.h as f32 >= carrier.w as f32 * 1.30;
        let is_heavily_offset_vertically = is_vertically_elongated && min_vm > 0.0 && (max_vm / min_vm >= 2.5) && (max_vm - min_vm >= 25.0);

        let left_m = (regions[i].box_.x - carrier.x).max(0);
        let right_m = ((carrier.x + carrier.w) - (regions[i].box_.x + regions[i].box_.w)).max(0);
        let min_hm = left_m.min(right_m) as f32;
        let max_hm = left_m.max(right_m) as f32;
        let is_horizontally_elongated = carrier.w as f32 >= carrier.h as f32 * 1.30;
        let is_heavily_offset_horizontally = is_horizontally_elongated && min_hm > 0.0 && (max_hm / min_hm >= 2.5) && (max_hm - min_hm >= 35.0);

        if is_sole_occupant
            && !is_vertical_edge_cut
            && has_healthy_vertical_fill
            && !is_heavily_offset_vertically
            && !is_heavily_offset_horizontally
        {
            let mut typeset_box = expand_box(&regions[i].box_, typeset_pct, page_w, page_h);
            typeset_box.x = carrier_cx - typeset_box.w / 2;
            typeset_box.y = carrier_cy - typeset_box.h / 2;
            if carrier_valid[i] {
                // VALIDATED TAIL-CUT CARRIER: THE TYPESET BOX MUST NOT SPILL INTO THE SEVERED TAIL
                clamp_box_to_core(&mut typeset_box, carrier.x, carrier.x + carrier.w, carrier.y, carrier.y + carrier.h);
            } else {
                clamp_box_to_core(&mut typeset_box, outer_l, outer_r, outer_t, outer_b);
            }
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
