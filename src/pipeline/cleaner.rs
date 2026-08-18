// -- CRATE / EXTERNAL IMPORTS -- //
use anyhow::Result;
use image::{DynamicImage, GenericImageView};

// -- INTERNAL IMPORTS -- //
use crate::ml::inpaint::{build_mask, LamaInpainter};
use crate::ml::schemas::CleanRequestRegion;

// -- FUNCTIONS & ALGORITHMS -- //

/// CLEANS AN IMAGE BY INPAINTING SPECIFIED TEXT REGIONS USING TIGHT GLYPH POLYGONS
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
    if let Some(ref mut inp) = inpainter {
        inp.inpaint(img, &mask, mode)
    } else {
        Ok(img.clone())
    }
}

