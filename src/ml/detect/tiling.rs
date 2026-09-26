//! TALL-PAGE DETECTOR TILING (FEAT-004 PHASE 5, ADR-003).
//!
//! THE LAYOUT DETECTORS SQUASH EVERY PAGE TO A SQUARE INPUT, SO A 690x2264 PAGE IS DISTORTED 3.3x AND A LONG STRIP
//! SO MUCH THAT NOTHING IS FOUND. ABOVE AN ASPECT TRIGGER THE PAGE IS CUT INTO OVERLAPPING FULL-WIDTH TILES, EACH
//! DETECTED ON ITS OWN, AND THE BOXES ARE MERGED BACK PER CLASS. WIDE PAGES ARE NOT TILED (FOLLOW-UP).

use crate::ml::schemas::BoxRect;

use super::detector::DetectResult;

/// TILE ONLY WHEN h > TRIGGER * w.
pub const TILING_TRIGGER_ASPECT: f32 = 2.5;
/// TILE HEIGHT = TILE_ASPECT * w.
pub const TILING_TILE_ASPECT: f32 = 1.5;
/// OVERLAP BETWEEN TILES AS A FRACTION OF THE TILE HEIGHT.
pub const TILING_OVERLAP_FRAC: f32 = 0.25;
/// OVERLAP FLOOR IN PIXELS.
pub const TILING_MIN_OVERLAP_PX: u32 = 128;
/// HARD CAP ON THE TILE COUNT; ABOVE IT THE TILES GROW TALLER.
pub const TILING_MAX_TILES: u32 = 24;
/// A BOX WITHIN THIS MANY PIXELS OF AN INTERNAL TILE EDGE COUNTS AS CUT BY THE SEAM.
const SEAM_TOUCH_PX: i32 = 4;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TilingConfig {
    pub enabled: bool,
    pub trigger_aspect: f32,
    pub tile_aspect: f32,
    pub overlap_frac: f32,
    pub min_overlap_px: u32,
    pub max_tiles: u32,
}

/// OFF BY DEFAULT UNTIL THE OWNER REVIEWS THE A/B (ADR-003): ON 77 TALL FIXTURES TILING FOUND 11 NEW BOXES BUT LOST 8
/// AND COST 2 TO 3 TIMES THE DETECTOR TIME. `recommended()` HOLDS THE ADR VALUES WITH TILING ON.
impl Default for TilingConfig {
    fn default() -> Self {
        Self { enabled: TILING_ENABLED_BY_DEFAULT, ..Self::recommended() }
    }
}

/// WHETHER DETECTION TILES TALL PAGES OUT OF THE BOX.
pub const TILING_ENABLED_BY_DEFAULT: bool = false;

impl TilingConfig {
    /// THE ADR-003 VALUES WITH TILING ON.
    pub fn recommended() -> Self {
        Self {
            enabled: true,
            trigger_aspect: TILING_TRIGGER_ASPECT,
            tile_aspect: TILING_TILE_ASPECT,
            overlap_frac: TILING_OVERLAP_FRAC,
            min_overlap_px: TILING_MIN_OVERLAP_PX,
            max_tiles: TILING_MAX_TILES,
        }
    }

    /// TILING SWITCHED OFF: EVERY PAGE IS ONE PASS.
    pub fn disabled() -> Self {
        Self { enabled: false, ..Self::default() }
    }
}

/// ONE FULL-WIDTH HORIZONTAL BAND OF THE PAGE.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Tile {
    pub y0: u32,
    pub h: u32,
}

/// THE BANDS TO DETECT. ONE TILE (THE WHOLE PAGE) BELOW THE TRIGGER OR WHEN TILING IS OFF. OTHERWISE THE FIRST TILE
/// STARTS AT 0, EACH NEXT ONE A STEP OF (TILE - OVERLAP) LOWER, AND THE LAST IS ALIGNED TO THE BOTTOM SO THERE IS NO
/// THIN REMAINDER. MORE THAN max_tiles MAKES THE TILES TALLER.
pub fn plan_tiles(w: u32, h: u32, cfg: &TilingConfig) -> Vec<Tile> {
    let whole = vec![Tile { y0: 0, h }];
    if !cfg.enabled || w == 0 || h == 0 || (h as f32) <= cfg.trigger_aspect * w as f32 {
        return whole;
    }
    let mut tile_h = ((cfg.tile_aspect * w as f32).round() as u32).max(1);
    loop {
        if tile_h >= h {
            return whole;
        }
        let overlap = ((tile_h as f32 * cfg.overlap_frac).round() as u32).max(cfg.min_overlap_px).min(tile_h - 1);
        let step = tile_h - overlap;
        let n = (h - tile_h).div_ceil(step) + 1;
        if n <= cfg.max_tiles.max(1) {
            let mut tiles: Vec<Tile> = (0..n - 1).map(|i| Tile { y0: i * step, h: tile_h }).collect();
            tiles.push(Tile { y0: h - tile_h, h: tile_h });
            return tiles;
        }
        tile_h = ((tile_h as f32 * 1.25).ceil() as u32).max(tile_h + 1);
    }
}

fn area(b: &BoxRect) -> f32 {
    (b.w.max(0) as f32) * (b.h.max(0) as f32)
}

fn inter(a: &BoxRect, b: &BoxRect) -> f32 {
    let x0 = a.x.max(b.x) as i64;
    let y0 = a.y.max(b.y) as i64;
    let x1 = (a.x as i64 + a.w as i64).min(b.x as i64 + b.w as i64);
    let y1 = (a.y as i64 + a.h as i64).min(b.y as i64 + b.h as i64);
    ((x1 - x0).max(0) * (y1 - y0).max(0)) as f32
}

fn iou(a: &BoxRect, b: &BoxRect) -> f32 {
    let i = inter(a, b);
    let u = area(a) + area(b) - i;
    if u <= 0.0 { 0.0 } else { i / u }
}

fn containment(a: &BoxRect, b: &BoxRect) -> f32 {
    let smaller = area(a).min(area(b));
    if smaller <= 0.0 { 0.0 } else { inter(a, b) / smaller }
}

/// A BOX FROM ONE TILE, IN PAGE COORDINATES.
#[derive(Debug, Clone)]
struct Tagged {
    b: BoxRect,
    score: f32,
    tile: usize,
}

fn touches_top_seam(t: &Tagged, tiles: &[Tile]) -> bool {
    let tile = tiles[t.tile];
    tile.y0 > 0 && t.b.y <= tile.y0 as i32 + SEAM_TOUCH_PX
}

fn touches_bottom_seam(t: &Tagged, tiles: &[Tile], page_h: u32) -> bool {
    let tile = tiles[t.tile];
    let bottom = tile.y0 + tile.h;
    bottom < page_h && t.b.y + t.b.h >= bottom as i32 - SEAM_TOUCH_PX
}

fn union(a: &BoxRect, b: &BoxRect) -> BoxRect {
    let x0 = a.x.min(b.x);
    let y0 = a.y.min(b.y);
    let x1 = (a.x + a.w).max(b.x + b.w);
    let y1 = (a.y + a.h).max(b.y + b.h);
    BoxRect { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/// MERGES ONE CLASS LIST. 1: A BOX CUT BY A SEAM GOES WHEN ANOTHER TILE HAS AN UNCUT COPY (IoU >= 0.5). 2: DUPLICATES
/// (IoU >= 0.5 OR CONTAINMENT >= 0.85) KEEP THE HIGHER SCORE. 3: TWO HALVES OF ONE OBJECT CUT BY A SEAM IN ADJACENT
/// TILES (HORIZONTAL OVERLAP >= 0.6 OF THE NARROWER, TOUCHING OR OVERLAPPING VERTICALLY) ARE JOINED.
fn merge_class(mut items: Vec<Tagged>, tiles: &[Tile], page_h: u32) -> Vec<(BoxRect, f32)> {
    let cut = |t: &Tagged| touches_top_seam(t, tiles) || touches_bottom_seam(t, tiles, page_h);

    // 1. DROP SEAM-CUT COPIES THAT ANOTHER TILE SAW WHOLE
    let keep: Vec<bool> = items
        .iter()
        .map(|t| !(cut(t) && items.iter().any(|o| o.tile != t.tile && !cut(o) && iou(&o.b, &t.b) >= 0.5)))
        .collect();
    items = items.into_iter().zip(keep).filter_map(|(t, k)| k.then_some(t)).collect();

    // 2. DUPLICATE SUPPRESSION, HIGHER SCORE FIRST (STABLE, SO EQUAL SCORES KEEP THE EARLIER TILE)
    let mut order: Vec<usize> = (0..items.len()).collect();
    order.sort_by(|&a, &b| items[b].score.partial_cmp(&items[a].score).unwrap_or(std::cmp::Ordering::Equal));
    let mut alive = vec![true; items.len()];
    for (pos, &i) in order.iter().enumerate() {
        if !alive[i] {
            continue;
        }
        for &j in &order[pos + 1..] {
            if alive[j] && (iou(&items[i].b, &items[j].b) >= 0.5 || containment(&items[i].b, &items[j].b) >= 0.85) {
                alive[j] = false;
            }
        }
    }
    let mut kept: Vec<Tagged> = items.into_iter().zip(alive).filter_map(|(t, a)| a.then_some(t)).collect();

    // 3. JOIN SEAM-SPLIT HALVES FROM ADJACENT TILES
    let mut merged = true;
    while merged {
        merged = false;
        'outer: for i in 0..kept.len() {
            for j in 0..kept.len() {
                if i == j || kept[j].tile != kept[i].tile + 1 {
                    continue;
                }
                let (upper, lower) = (&kept[i], &kept[j]);
                let narrower = upper.b.w.min(lower.b.w).max(1) as f32;
                let h_overlap = ((upper.b.x + upper.b.w).min(lower.b.x + lower.b.w) - upper.b.x.max(lower.b.x)).max(0) as f32;
                let seam_cut = touches_bottom_seam(upper, tiles, page_h) || touches_top_seam(lower, tiles);
                let meets = lower.b.y <= upper.b.y + upper.b.h + SEAM_TOUCH_PX && upper.b.y <= lower.b.y;
                if seam_cut && meets && h_overlap >= 0.6 * narrower {
                    let joined = Tagged { b: union(&upper.b, &lower.b), score: upper.score.max(lower.score), tile: lower.tile };
                    kept[i] = joined;
                    kept.remove(j);
                    merged = true;
                    break 'outer;
                }
            }
        }
    }
    kept.into_iter().map(|t| (t.b, t.score)).collect()
}

fn tag(per_tile: &[(Tile, Vec<(BoxRect, f32)>)]) -> Vec<Tagged> {
    per_tile
        .iter()
        .enumerate()
        .flat_map(|(i, (tile, list))| {
            list.iter().map(move |(b, s)| Tagged { b: BoxRect { x: b.x, y: b.y + tile.y0 as i32, w: b.w, h: b.h }, score: *s, tile: i })
        })
        .collect()
}

/// MERGES PER-TILE DETECTIONS (BOXES IN TILE COORDINATES) INTO ONE PAGE RESULT WITH THE SAME SHAPE AS A SINGLE PASS.
/// `boxes` / `scores` ARE REBUILT FROM THE MERGED LISTS IN THE BACKEND'S ORDER (text_bubbles, text_free, THEN
/// onomatopoeia FOR RF-DETR).
pub fn merge_tiled(per_tile: Vec<(Tile, DetectResult)>, page_w: u32, page_h: u32) -> DetectResult {
    let tiles: Vec<Tile> = per_tile.iter().map(|(t, _)| *t).collect();
    let backend = per_tile.first().map(|(_, r)| r.backend.clone()).unwrap_or_default();
    let scored = |pick: &dyn Fn(&DetectResult) -> Vec<(BoxRect, f32)>| -> Vec<(BoxRect, f32)> {
        let lists: Vec<(Tile, Vec<(BoxRect, f32)>)> = per_tile.iter().map(|(t, r)| (*t, pick(r))).collect();
        merge_class(tag(&lists), &tiles, page_h)
    };
    let unscored = |pick: &dyn Fn(&DetectResult) -> Vec<BoxRect>| -> Vec<BoxRect> {
        scored(&|r| pick(r).into_iter().map(|b| (b, 1.0)).collect()).into_iter().map(|(b, _)| b).collect()
    };
    let text_bubbles = scored(&|r| r.text_bubbles.clone());
    let text_free = scored(&|r| r.text_free.clone());
    let onomatopoeia = scored(&|r| r.onomatopoeia.clone());
    let bubbles = unscored(&|r| r.bubbles.clone());
    let panels = unscored(&|r| r.panels.clone());

    let mut boxes = Vec::new();
    let mut scores = Vec::new();
    let mut push = |src: &[(BoxRect, f32)]| {
        for (b, s) in src {
            boxes.push(vec![[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]);
            scores.push(*s);
        }
    };
    push(&text_bubbles);
    push(&text_free);
    if backend.starts_with("rfdetr") {
        push(&onomatopoeia);
    }

    DetectResult {
        boxes,
        scores,
        panels,
        bubbles,
        onomatopoeia,
        text_bubbles,
        text_free,
        mask: Vec::new(),
        mask_width: page_w,
        mask_height: page_h,
        backend,
    }
}
