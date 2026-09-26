//! LAMA PASS PLANNING (FEAT-004 PHASE 6, ADR-005).
//!
//! EVERY INPAINT MODE IS PLANNED AS A LIST OF PASSES, EACH UNDER ONE PIXEL BUDGET, SO NO PAGE SIZE CAN ALLOCATE AN
//! UNBOUNDED TENSOR. A PASS UNDER THE BUDGET IS TODAY'S PASS, UNCHANGED. AN OVERSIZED AREA IS SPLIT INTO OVERLAPPING
//! TILES; EACH PIXEL OF AN OVERLAP IS WRITTEN BY THE PASS IT IS FARTHEST FROM THE EDGE OF (THE MIDPOINT OF THE OVERLAP),
//! WITH NO BLENDING, SO THE OUTPUT STAYS DETERMINISTIC.

use image::{GrayImage, Luma};

use super::patch::find_mask_components;

/// PIXELS PER PASS.
pub const LAMA_MAX_PIXELS: u64 = 2048 * 2048;
/// LONGEST SIDE PER PASS.
pub const LAMA_MAX_SIDE: u32 = 4096;
/// OVERLAP BETWEEN SPLIT TILES.
pub const LAMA_BAND_OVERLAP: u32 = 64;
/// LONGEST SIDE OF A `scaled` PASS.
pub const LAMA_SCALED_TARGET: u32 = 512;
/// PADDING AROUND A MASK COMPONENT IN `patch` MODE.
pub const LAMA_PATCH_PAD: i32 = 24;

/// A RECT AS (x, y, w, h).
pub type Rect = (u32, u32, u32, u32);

/// ONE LAMA PASS: THE SOURCE RECT IT READS, THE FACTOR IT IS RESIZED BY, AND THE RECT IT WRITES BACK (MASKED PIXELS
/// ONLY).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Pass {
    pub src: Rect,
    pub scale: f32,
    pub own: Rect,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum InpaintMode {
    Patch { pad: i32 },
    Scaled { target: u32 },
    Full,
}

impl InpaintMode {
    /// THE SAME ALIASES THE SETTING HAS ALWAYS ACCEPTED; UNKNOWN VALUES MEAN `patch`.
    pub fn parse(s: &str) -> Self {
        match s.to_lowercase().trim() {
            "scaled" | "balanced" => Self::Scaled { target: LAMA_SCALED_TARGET },
            "full" | "dynamic" => Self::Full,
            _ => Self::Patch { pad: LAMA_PATCH_PAD },
        }
    }
}

fn within_budget(w: u32, h: u32) -> bool {
    (w as u64) * (h as u64) <= LAMA_MAX_PIXELS && w <= LAMA_MAX_SIDE && h <= LAMA_MAX_SIDE
}

/// SPLITS [start, start + len) INTO SPANS OF `tile` WITH `overlap`, THE LAST ONE ALIGNED TO THE END. RETURNS
/// (span_start, span_len, own_start, own_len); OWN SPANS TILE THE RANGE EXACTLY, SPLITTING EACH OVERLAP AT ITS MIDPOINT.
fn spans(start: u32, len: u32, tile: u32, overlap: u32) -> Vec<(u32, u32, u32, u32)> {
    let tile = tile.max(1);
    if len <= tile {
        return vec![(start, len, start, len)];
    }
    let overlap = overlap.min(tile / 2);
    let step = (tile - overlap).max(1);
    let mut pos: Vec<u32> = Vec::new();
    let mut p = 0;
    while p + tile < len {
        pos.push(p);
        p += step;
    }
    pos.push(len - tile);
    let mut out = Vec::with_capacity(pos.len());
    for (i, &p) in pos.iter().enumerate() {
        let own_start = if i == 0 { 0 } else { (p + pos[i - 1] + tile) / 2 };
        let own_end = if i + 1 == pos.len() { len } else { (pos[i + 1] + p + tile) / 2 };
        out.push((start + p, tile, start + own_start, own_end.saturating_sub(own_start)));
    }
    out
}

/// SPLITS A RECT INTO A GRID OF TILES NO LARGER THAN (tile_w, tile_h), EACH WITH ITS OWN RECT.
fn grid(r: Rect, tile_w: u32, tile_h: u32) -> Vec<(Rect, Rect)> {
    let (x, y, w, h) = r;
    let mut out = Vec::new();
    for (sy, sh, oy, oh) in spans(y, h, tile_h, LAMA_BAND_OVERLAP) {
        for (sx, sw, ox, ow) in spans(x, w, tile_w, LAMA_BAND_OVERLAP) {
            out.push(((sx, sy, sw, sh), (ox, oy, ow, oh)));
        }
    }
    out
}

/// A RECT SPLIT SO EVERY TILE FITS THE PIXEL BUDGET AND THE SIDE CAP.
fn budget_tiles(r: Rect) -> Vec<(Rect, Rect)> {
    if within_budget(r.2, r.3) {
        return vec![(r, r)];
    }
    let tile_w = r.2.min(LAMA_MAX_SIDE).max(1);
    let tile_h = ((LAMA_MAX_PIXELS / tile_w as u64) as u32).min(LAMA_MAX_SIDE).max(1);
    grid(r, tile_w, tile_h)
}

fn has_mask(mask: &GrayImage, r: Rect) -> bool {
    let (x, y, w, h) = r;
    (y..y + h).any(|yy| (x..x + w).any(|xx| mask.get_pixel(xx, yy)[0] > 0))
}

fn keep_masked(mask: &GrayImage, tiles: Vec<(Rect, Rect)>, scale: impl Fn(Rect) -> f32) -> Vec<Pass> {
    tiles
        .into_iter()
        .filter(|(_, own)| own.2 > 0 && own.3 > 0 && has_mask(mask, *own))
        .map(|(src, own)| Pass { src, scale: scale(src), own })
        .collect()
}

fn plan_patch(img_w: u32, img_h: u32, mask: &GrayImage, pad: i32) -> Vec<Pass> {
    let mut passes = Vec::new();
    for (bx, by, bw, bh) in find_mask_components(mask) {
        let x0 = (bx as i32 - pad).max(0) as u32;
        let y0 = (by as i32 - pad).max(0) as u32;
        let x1 = ((bx + bw) as i32 + pad).min(img_w as i32) as u32;
        let y1 = ((by + bh) as i32 + pad).min(img_h as i32) as u32;
        let (pw, ph) = (x1 - x0, y1 - y0);
        if pw < 4 || ph < 4 {
            continue;
        }
        let rect = (x0, y0, pw, ph);
        if within_budget(pw, ph) {
            if has_mask(mask, rect) {
                passes.push(Pass { src: rect, scale: 1.0, own: rect });
            }
        } else {
            passes.extend(keep_masked(mask, budget_tiles(rect), |_| 1.0));
        }
    }
    passes
}

/// THE PASSES FOR ONE PAGE. `mask` MUST MATCH THE PAGE SIZE (THE CALLER CHECKS).
pub fn plan_inpaint(img_w: u32, img_h: u32, mask: &GrayImage, mode: InpaintMode) -> Vec<Pass> {
    if img_w == 0 || img_h == 0 {
        return Vec::new();
    }
    let page = (0, 0, img_w, img_h);
    match mode {
        InpaintMode::Patch { pad } => plan_patch(img_w, img_h, mask, pad),
        InpaintMode::Full => {
            if within_budget(img_w, img_h) {
                return vec![Pass { src: page, scale: 1.0, own: page }];
            }
            if img_w as u64 > LAMA_MAX_PIXELS / 64 {
                tracing::info!("inpaint: {}x{} page is too wide for full-mode bands, using patch mode", img_w, img_h);
                return plan_patch(img_w, img_h, mask, LAMA_PATCH_PAD);
            }
            keep_masked(mask, budget_tiles(page), |_| 1.0)
        }
        InpaintMode::Scaled { target } => {
            // SQUARE-ISH TILES ALONG THE LONG AXIS, EACH SCALED SO ITS LONGEST SIDE IS `target` (ASPECT KEPT)
            let side = img_w.min(img_h);
            let tiles = grid(page, if img_w > img_h { side } else { img_w }, if img_h > img_w { side } else { img_h });
            let scale = move |r: Rect| target as f32 / r.2.max(r.3) as f32;
            keep_masked(mask, tiles, scale)
        }
    }
}

/// A MASK CROP (0 / 255, AS find_mask_components AND THE MODEL EXPECT).
pub fn crop_mask(mask: &GrayImage, r: Rect) -> GrayImage {
    let (x, y, w, h) = r;
    GrayImage::from_fn(w, h, |px, py| if mask.get_pixel(x + px, y + py)[0] > 0 { Luma([255]) } else { Luma([0]) })
}
