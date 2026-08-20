use image::{DynamicImage, GenericImageView, ImageBuffer, Rgb};
use xianscan_rust::ml::reslice::{
    find_optimal_cut_points, find_optimal_cut_points_with_detectors, is_point_forbidden,
    smart_reslice_chapter, stitch_images_vertically,
};

/// # Reslice Test: Vertical Strip Canvas Stitching
///
/// ## Purpose:
/// Verifies vertical concatenation of image strips with exact dimension checking.
#[test]
fn test_stitch_images_vertically() {
    let img1 = DynamicImage::new_rgb8(200, 100);
    let img2 = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(200, 150, Rgb([255, 255, 255])));

    let stitched = stitch_images_vertically(&[img1, img2]);
    assert_eq!(stitched.dimensions(), (200, 250));
}

/// # Reslice Test: Width Discrepancy Resizing
///
/// ## Purpose:
/// Verifies strip images with mismatched widths expand to the maximum canvas width.
#[test]
fn test_stitch_images_mismatched_width() {
    let img1 = DynamicImage::new_rgb8(200, 100);
    let img2 = DynamicImage::new_rgb8(400, 100);

    let stitched = stitch_images_vertically(&[img1, img2]);
    assert_eq!(stitched.width(), 400);
    assert_eq!(stitched.height(), 300);
}

/// # Reslice Test: Blank Gutter Cut Point Optimization
///
/// ## Purpose:
/// Verifies that vertical slicing algorithms choose the solid white panel gutter
/// ($Y=1750..1850$) instead of slicing through textured manga artwork.
#[test]
fn test_find_optimal_cut_points_blank_gutters() {
    let mut canvas_buf = ImageBuffer::from_pixel(400, 3000, Rgb([100_u8, 100, 100]));

    // Textured panels above and below gutter
    for y in 0..3000 {
        for x in 0..400 {
            if y < 1750 || y >= 1850 {
                let v = ((x * 13 + y * 7) % 200) as u8;
                canvas_buf.put_pixel(x, y, Rgb([v, v, v]));
            }
        }
    }

    // Solid white gutter at Y=1750..1850
    for y in 1750..1850 {
        for x in 0..400 {
            canvas_buf.put_pixel(x, y, Rgb([255, 255, 255]));
        }
    }

    let canvas = DynamicImage::ImageRgb8(canvas_buf);
    let forbidden_zones = Vec::new();
    let cuts = find_optimal_cut_points(&canvas, 1800, 1200, 2400, &forbidden_zones);
    println!("Cuts in test: {:?}", cuts);

    assert!(cuts.len() >= 2);
    assert!(cuts[0] >= 1750 && cuts[0] <= 1850);
    assert_eq!(*cuts.last().unwrap(), 3000);
}

/// # Reslice Test: Forbidden Coordinate Exclusions
///
/// ## Purpose:
/// Verifies boundary condition handling in forbidden cut intervals.
#[test]
fn test_forbidden_zone_check() {
    let zones = [(100, 200), (500, 600)];
    assert!(is_point_forbidden(150, &zones));
    assert!(is_point_forbidden(100, &zones));
    assert!(is_point_forbidden(200, &zones));
    assert!(!is_point_forbidden(300, &zones));
    assert!(is_point_forbidden(550, &zones));
    assert!(!is_point_forbidden(700, &zones));
}

/// # Reslice Test: Smart Webtoon Chapter Reslicing
///
/// ## Purpose:
/// Verifies that long webtoon chapters are divided into standardized page slices
/// with conserved total pixel height ($\sum h_i = 3200\text{px}$).
#[test]
fn test_smart_reslice_chapter() {
    let slice1 = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(300, 800, Rgb([120, 120, 120])));
    let mut slice2_buf = ImageBuffer::from_pixel(300, 800, Rgb([120, 120, 120]));
    // Gutter at 700..800 of slice2
    for y in 700..800 {
        for x in 0..300 {
            slice2_buf.put_pixel(x, y, Rgb([255, 255, 255]));
        }
    }
    let slice2 = DynamicImage::ImageRgb8(slice2_buf);
    let slice3 = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(300, 800, Rgb([120, 120, 120])));
    let slice4 = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(300, 800, Rgb([120, 120, 120])));

    let pages = smart_reslice_chapter(&[slice1, slice2, slice3, slice4], 1600, 1000, 2200, None, None, None, None, 0);
    assert!(pages.len() >= 2);
    let total_h: u32 = pages.iter().map(|p| p.height()).sum();
    assert_eq!(total_h, 3200);
}

/// # Reslice Test: Dialogue Bubble Exclusion Zone Avoidance
///
/// ## Purpose:
/// Verifies that cut points never fall inside dialogue bubble exclusion ranges,
/// even when a dialogue bubble is positioned right at target_height.
#[test]
fn test_find_optimal_cut_points_avoids_dialogue_bubbles() {
    let canvas_buf = ImageBuffer::from_pixel(400, 3200, Rgb([200_u8, 200, 200]));
    let canvas = DynamicImage::ImageRgb8(canvas_buf);

    // SPEECH BUBBLE LOCATED PRECISELY AT TARGET_HEIGHT (1550..1650)
    let forbidden_zones = vec![(1550, 1650)];
    let cuts = find_optimal_cut_points(&canvas, 1600, 1000, 2200, &forbidden_zones);

    assert!(cuts.len() >= 2);
    for &cut_y in &cuts {
        if cut_y < 3200 {
            assert!(
                !is_point_forbidden(cut_y as i32, &forbidden_zones),
                "Cut point {} fell inside forbidden dialogue bubble zone!",
                cut_y
            );
        }
    }
}

/// # Reslice Test: Clear-Airspace Gutter Guard (Fake-Gutter Rejection)
///
/// ## Purpose:
/// A flat band alone is not proof of a safe cut — the inter-line gap inside an
/// undetected dialogue / narration box is flat yet sits in the middle of text.
/// The cut-point search must reject such a "fake gutter" (text close above AND
/// below) and snap to a genuinely clear, wide gutter instead. This directly
/// reproduces the reported bug where a cut landed in the gap between two text
/// lines of a wide narration box that the detector had missed.
#[test]
fn test_cut_avoids_fake_gutter_between_text_lines() {
    fn whiten(buf: &mut ImageBuffer<Rgb<u8>, Vec<u8>>, y0: u32, y1: u32) {
        for y in y0..y1 {
            for x in 0..buf.width() {
                buf.put_pixel(x, y, Rgb([255, 255, 255]));
            }
        }
    }

    let w = 400;
    let h = 2600;
    let mut buf = ImageBuffer::from_pixel(w, h, Rgb([0_u8, 0, 0]));

    // Textured "art / text" everywhere so the whole canvas has high row variance,
    // except where we explicitly cut flat white gutters.
    for y in 0..h {
        for x in 0..w {
            let v = ((x * 13 + y * 7) % 200) as u8;
            buf.put_pixel(x, y, Rgb([v, v, v]));
        }
    }

    // FAKE GUTTER: a narrow white band (1210..1220) between two "text" regions.
    // Text lines are only ~0-10px away above AND below, so a cut here would split
    // dialogue across pages — exactly the reported failure.
    whiten(&mut buf, 1210, 1220);

    // REAL GUTTER: a wide, clearly-blank band with generous blank airspace.
    whiten(&mut buf, 1590, 1660);

    let canvas = DynamicImage::ImageRgb8(buf);
    let cuts = find_optimal_cut_points_with_detectors(&canvas, 1200, 800, 2000, None, None, None, None, 0);

    assert!(!cuts.is_empty());
    let first = cuts[0];
    assert!(
        !(1180..=1250).contains(&first),
        "cut {first} landed in the fake gutter inside the text block (must be rejected by clear-airspace guard)"
    );
    assert!(
        (1590..=1660).contains(&first),
        "cut {first} did not snap to the real, clearly-blank gutter"
    );
}
