use anyhow::Result;
use image::{DynamicImage, GenericImageView};
use crate::ml::inpaint::{build_mask, LamaInpainter};
use crate::ml::schemas::CleanRequestRegion;

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
            polygons.push(vec![
                [b.x, b.y],
                [b.x + b.w, b.y],
                [b.x + b.w, b.y + b.h],
                [b.x, b.y + b.h],
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
