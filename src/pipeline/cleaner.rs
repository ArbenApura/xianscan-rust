// -- CRATE / EXTERNAL IMPORTS -- //
use anyhow::Result;
use image::{DynamicImage, GenericImageView};

// -- INTERNAL IMPORTS -- //
use crate::ml::geometry::box_iou;
use crate::ml::inpaint::{build_mask, clean_white_bubble_shrinkwrap, LamaInpainter};
use crate::ml::schemas::{BoxRect, CleanRequestRegion};

// -- FUNCTIONS & ALGORITHMS -- //

/// CLEANS AN IMAGE BY INPAINTING SPECIFIED TEXT REGIONS USING TIGHT GLYPH POLYGONS,
/// FOLLOWED BY OUTSIDE-IN SHRINKWRAP CAVITY CLEANING ON WHITE DIALOGUE BUBBLES.
pub fn clean_image(
    inpainter: &mut Option<LamaInpainter>,
    img: &DynamicImage,
    regions: &[CleanRequestRegion],
    mode: &str,
) -> Result<DynamicImage> {
    let (w, h) = img.dimensions();
    let mut polygons = Vec::new();

    for r in regions {
        if let Some(ref poly) = r.polygon {
            if poly.len() >= 3 {
                polygons.push(poly.clone());
                continue;
            }
        }
        if let Some(ref b) = r.box_ {
            // TIGHT INSET FALLBACK IF ONLY BOX_ IS PROVIDED TO PROTECT SPEECH BUBBLE BORDERS
            let inset_x = ((b.w as f32) * 0.05).clamp(2.0, 8.0) as i32;
            let inset_y = ((b.h as f32) * 0.05).clamp(2.0, 6.0) as i32;
            let ix1 = (b.x + inset_x).min(b.x + b.w);
            let iy1 = (b.y + inset_y).min(b.y + b.h);
            let ix2 = (b.x + b.w - inset_x).max(ix1);
            let iy2 = (b.y + b.h - inset_y).max(iy1);
            polygons.push(vec![
                [ix1, iy1],
                [ix2, iy1],
                [ix2, iy2],
                [ix1, iy2],
            ]);
        }
    }

    let mask = build_mask(h, w, &polygons, 3);
    let cleaned_img = if let Some(ref mut inp) = inpainter {
        inp.inpaint(img, &mask, mode)?
    } else {
        img.clone()
    };

    // AFTER INPAINTING: RUN OUTSIDE-IN SHRINKWRAP CAVITY CLEANING ON CONFIRMED WHITE BUBBLES
    // TO ERASE RESIDUAL DUST, SMUDGES, AND INTERNAL WATERMARKS WHILE PRESERVING BORDER GRAPHICS
    let mut rgb_buf = cleaned_img.to_rgb8();
    let mut modified = false;

    // COLLECT UNIQUE BUBBLE BOXES AND AGGREGATE ALL ASSOCIATED TEXT REGION SEEDS AND CLEAN BOXES
    let mut bubble_groups: Vec<(BoxRect, Vec<[i32; 2]>, Vec<BoxRect>)> = Vec::new();
    for r in regions {
        if let Some(ref bb) = r.bubble_box {
            let mut seed = None;
            if let Some(ref poly) = r.polygon {
                if !poly.is_empty() {
                    let mut cx = 0i32;
                    let mut cy = 0i32;
                    for pt in poly {
                        cx += pt[0];
                        cy += pt[1];
                    }
                    seed = Some([cx / poly.len() as i32, cy / poly.len() as i32]);
                }
            }
            if seed.is_none() {
                if let Some(ref b) = r.box_ {
                    seed = Some([b.x + b.w / 2, b.y + b.h / 2]);
                }
            }

            let cbox = r.box_.clone().or_else(|| {
                r.polygon.as_ref().and_then(|p| {
                    if p.is_empty() { return None; }
                    let (min_x, min_y, max_x, max_y) = p.iter().fold(
                        (i32::MAX, i32::MAX, i32::MIN, i32::MIN),
                        |acc, pt| (acc.0.min(pt[0]), acc.1.min(pt[1]), acc.2.max(pt[0]), acc.3.max(pt[1]))
                    );
                    Some(BoxRect { x: min_x, y: min_y, w: (max_x - min_x).max(1), h: (max_y - min_y).max(1) })
                })
            });

            if let Some(existing) = bubble_groups.iter_mut().find(|(b, _, _)| box_iou(b, bb) >= 0.70) {
                if let Some(s) = seed {
                    existing.1.push(s);
                }
                if let Some(cb) = cbox {
                    existing.2.push(cb);
                }
            } else {
                let mut seeds = Vec::new();
                if let Some(s) = seed {
                    seeds.push(s);
                }
                let mut cboxes = Vec::new();
                if let Some(cb) = cbox {
                    cboxes.push(cb);
                }
                bubble_groups.push((bb.clone(), seeds, cboxes));
            }
        }
    }

    for (bb, seeds, cboxes) in &bubble_groups {
        if clean_white_bubble_shrinkwrap(&mut rgb_buf, bb, seeds, cboxes) {
            modified = true;
        }
    }

    if modified {
        Ok(DynamicImage::ImageRgb8(rgb_buf))
    } else {
        Ok(cleaned_img)
    }
}

