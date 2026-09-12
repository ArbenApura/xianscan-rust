# Text Base Region Decoupling and Typeset Bubble Anchor Centering

This reference document details how `xianscan-rust` separates text region boundaries, inpainting boundaries, and centered typesetting on speech bubble anchors. Subsequent sessions can base pipeline adjustments, geometry tweaks, or typeset rendering changes directly on these specifications.

---

## 1. System Topology Overview

Region geometry and typesetting anchor alignment operate across three strictly decoupled layers.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Tight Base Text Anchor (`src/pipeline/region_builder/builder.rs`)         │
│    • Line clustering and orientation detection                              │
│    • Uninflated raw polygon bounding envelope (`tight_box`)                 │
│    • Unified Base and OCR anchor (`box_ == ocr_box`) with 0 dilation         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                   ┌───────────────────┴───────────────────┐
                   │                                       │
                   ▼                                       ▼
┌──────────────────────────────────────┐┌──────────────────────────────────────┐
│ 2. Inpaint Region Boundary           ││ 3. Typeset Chamber Geometry          │
│    (`src/pipeline/region_builder/`)  ││    (`expansion.rs`, `typeset.ts`)    │
│    • Derived directly from tight base││    • Centered on carrier chamber     │
│    • Fixed 3% isotropic expansion    ││    • Available bubble room expansion │
│    • Clamped to canvas and bubble    ││    • Multi-line wrapping headroom    │
└──────────────────────────────────────┘└──────────────────────────────────────┘
```

---

## 2. Tight Base Text Region (`box_` / `ocr_box`)

The base bounding box (`box_`) and the raw OCR bounding box (`ocr_box`) are permanently unified as one tight, uninflated text anchor.

### A. Zero Container Dilation
Located in [`src/pipeline/region_builder/builder.rs`](src/pipeline/region_builder/builder.rs).

1. The initial text bounding box is derived directly from the bounding rectangle enclosing recognized line polygons or cluster crop lines.
2. Single-utterance container dilation toward candidate speech bubble bounds is completely removed.
3. The base box represents the actual ink of the original text without artificial margins or inflation.
4. If polygon coordinates overflow the bubble envelope due to detector jitter, safe-core clamping in [`expansion.rs`](src/pipeline/region_builder/expansion.rs) ensures text vertices are contained without altering the pristine uninflated text anchor.

---

## 3. Inpaint Region Boundary (`inpaint_box`)

The inpainting bounding box (`inpaint_box`) and polygon define the area cleaned by neural inpainting.

### A. Fixed 3% Isotropic Expansion
Located in [`src/pipeline/region_builder/geometry.rs`](src/pipeline/region_builder/geometry.rs) and [`src/pipeline/region_builder/builder.rs`](src/pipeline/region_builder/builder.rs).

1. Derived directly from the tight base box using `DEFAULT_INPAINT_EXPANSION_PCT = 0.03`.
2. Adds a 3% padding buffer on all sides, ensuring full glyph coverage and preventing anti-aliasing edge halos during inpainting:
   ```rust
   // FIXED 3% EXPANSION DERIVED DIRECTLY FROM TIGHT BASE TEXT ANCHOR
   pub const DEFAULT_INPAINT_EXPANSION_PCT: f32 = 0.03;
   pub fn expand_box(b: &BoxRect, pad_pct: f32, page_w: u32, page_h: u32) -> BoxRect
   ```
3. Clamped strictly to the page dimensions and to the outer bubble boundary, ensuring inpainting never spills into surrounding line art.

---

## 4. Typeset Centered on Bubble Anchor (`typeset_box`)

The typeset bounding box (`typeset_box`) defines the target rectangular canvas where translated lines are wrapped and rendered.

### A. Carrier Chamber Derivation
Located in [`src/pipeline/region_builder/expansion.rs`](src/pipeline/region_builder/expansion.rs) and [`src/pipeline/region_builder/geometry.rs`](src/pipeline/region_builder/geometry.rs).

Centering dialogue directly inside the full bubble bounding box misaligns text when the bubble has a prominent pointer or tail. The system isolates the true balloon body (carrier):

1. **Image Morphology**:
   [`extract_carrier_box_from_image`](src/pipeline/region_builder/geometry.rs) applies multi-scale disk erosion (radii 14px to 34px) on the binarized bubble mask, finds the connected component containing or nearest to the text centroid, and dilates it back by the same radius. Narrow tails and bulbous protrusions disconnect and disappear.
2. **Geometric Margin Skew**:
   [`derive_carrier_box`](src/pipeline/region_builder/expansion.rs) checks margin asymmetry. If the bottom margin exceeds the top margin by at least 1.30x and 26px, the bottom tail excess is trimmed away. Horizontal tails are trimmed if one margin exceeds the other by 1.50x and 22px.
3. **Tail Cut Validation**:
   [`valid_tail_cut_carrier`](src/pipeline/region_builder/expansion.rs) confirms that a genuine directional cut occurred (dominant edge trim at least 14px with opposite edge trim <= 14px). Symmetrical shrinkage, edge-cut slice boundaries, and micro-bodies under 20px are rejected.

### B. Centering Eligibility Guards
Centering text on the carrier anchor activates only when all conditions are satisfied:
- **Sole Occupant**: No other dialogue regions or candidate obstacles share the bubble (`box_iou < 0.50`).
- **Slice Margin Guard**: Bubbles severed by canvas split seams (`b.y <= 12` or `b.y + b.h >= page_h - 12`) are excluded.
- **Healthy Vertical Fill**: The ratio of text height to carrier height must fall between 0.15 and 0.90.
- **Centering Asymmetry Guard**: In elongated bubbles without a validated tail cut, if text is heavily offset toward one side (ratio of maximum to minimum margin >= 2.5 with a difference >= 35px vertically or 45px horizontally), centroid snapping is skipped to avoid crossing balloon chambers.

### C. Anchor Snapping and Size Adjustment
All bubble available space expansion and scaling are applied exclusively to `typeset_box`.
1. **Available Space Slack Expansion**:
   In Phase 1, `typeset_target` expands into available bubble safe core slack symmetrically around the text centroid. Single-column vertical text widens horizontally by up to 2.0x to accommodate Western translation lines.
2. **Vertical Headroom Expansion**:
   For short horizontal text in spacious bubbles (`(typeset_box.h <= 45 || fill <= 0.35) && fill <= 0.45`), height expands up to 2.2x (capped at 75% of carrier height) to provide multi-line wrapping headroom.
3. **Tall Narrow Free Text Scaling**:
   `scale_tall_narrow_free_text_base_box` scales the width of non-bubble tall-narrow vertical columns by 1.35x directly on `typeset_box`, keeping `box_` tight.
4. **Centroid Snapping**:
   ```rust
   typeset_box.x = carrier_cx - typeset_box.w / 2;
   typeset_box.y = carrier_cy - typeset_box.h / 2;
   ```
5. **Anti-Clipping Symmetry Expansion**:
   If shifting to the carrier center creates a deficit greater than 4px relative to original OCR text bounds, the box expands symmetrically on both sides (`x -= clip; w += clip * 2`). This guarantees no characters are clipped while preserving the exact center point.
6. **Tail Protection Clamping**:
   Clamped to the carrier safe core, ensuring text never leaks into the severed tail.

When ineligible for carrier centering, `typeset_box` defaults to `typeset_target` clamped to the outer bubble boundary, preserving individual sibling anchors.

### D. Web Typesetting Execution
Located in [`web/src/lib/server/chapter-pipeline.ts`](web/src/lib/server/chapter-pipeline.ts) and [`web/src/lib/server/typeset.ts`](web/src/lib/server/typeset.ts).

1. The pipeline maps regions using `box: r.typeset_box ?? r.box`.
2. `typesetPage` fits text lines and font sizes inside `w` and `h` using `fitFontSizeWithLines`.
3. For unrotated text, line baselines are centered horizontally and vertically:
   ```ts
   const tx = align === 'left' ? x + (w - maxW) / 2 : x + w / 2;
   let ty = y + (h - visualH) / 2 + size * 0.75;
   ```
4. For rotated text (`hasRotation`), the canvas context translates to `(x + w / 2, y + h / 2)`, rotates by `angleDeg`, and renders text relative to that origin.
