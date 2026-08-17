use image::{DynamicImage, GenericImageView, ImageBuffer, Rgb};
use xianscan_rust::ml::reslice::{
    find_optimal_cut_points, is_point_forbidden, smart_reslice_chapter, stitch_images_vertically,
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

    let pages = smart_reslice_chapter(&[slice1, slice2, slice3, slice4], 1600, 1000, 2200);
    assert!(pages.len() >= 2);
    let total_h: u32 = pages.iter().map(|p| p.height()).sum();
    assert_eq!(total_h, 3200);
}
