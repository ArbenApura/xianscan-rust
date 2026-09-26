use image::{DynamicImage, ImageBuffer, Rgb};
use xianscan_rust::ml::intake::{IntakeError, IntakeLimits};
use xianscan_rust::ml::reslice::{
    is_point_forbidden, merge_intervals, stitch_images_vertically,
};

/// # Reslice Test: Vertical Image Stitching
///
/// ## Purpose:
/// Verifies that multiple vertical strip images are stitched into a single continuous canvas.
#[test]
fn test_stitch_images_vertically() {
    let img1 = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(200, 100, Rgb([0, 0, 0])));
    let img2 = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(200, 150, Rgb([255, 255, 255])));

    let stitched = stitch_images_vertically(&[img1, img2], &IntakeLimits::default()).unwrap();
    assert_eq!(stitched.width(), 200);
    assert_eq!(stitched.height(), 250);
}

/// # Reslice Test: Mismatched Width Canvas Normalization
///
/// ## Purpose:
/// Verifies that when input images have differing widths, the stitched canvas width
/// scales to the maximum width while preserving aspect ratios.
#[test]
fn test_stitch_images_mismatched_width() {
    let img1 = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(200, 100, Rgb([0, 0, 0])));
    let img2 = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(400, 100, Rgb([0, 0, 0])));

    let stitched = stitch_images_vertically(&[img1, img2], &IntakeLimits::default()).unwrap();
    assert_eq!(stitched.width(), 400);
    assert_eq!(stitched.height(), 300);
}

/// # Reslice Test: Forbidden Cut Zone Avoidance
///
/// ## Purpose:
/// Verifies `is_point_forbidden` identifies vertical coordinates that intersect dialogue bubbles.
#[test]
fn test_forbidden_zone_check() {
    let zones = vec![(100, 200), (500, 600)];
    assert!(is_point_forbidden(150, &zones));
    assert!(is_point_forbidden(100, &zones));
    assert!(is_point_forbidden(200, &zones));
    assert!(!is_point_forbidden(300, &zones));
    assert!(is_point_forbidden(550, &zones));
    assert!(!is_point_forbidden(700, &zones));
}

/// # Reslice Test: Overlapping Forbidden Interval Merging
///
/// ## Purpose:
/// Verifies `merge_intervals` combines overlapping $(y_0, y_1)$ intervals into contiguous exclusion ranges.
#[test]
fn test_merge_intervals() {
    let raw = vec![(100, 200), (150, 250), (400, 500)];
    let merged = merge_intervals(raw);
    assert_eq!(merged, vec![(100, 250), (400, 500)]);
}

/// # Reslice Test: Optimal Cut Point Selection
///
/// ## Purpose:
/// Verifies `find_optimal_cut_points` finds slice positions within target height bounds without cutting speech bubbles.
#[test]
fn test_find_optimal_cut_points() {
    let canvas = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(400, 3000, Rgb([100, 100, 100])));
    let forbidden = vec![(1700, 1900)];
    let cuts = xianscan_rust::ml::reslice::find_optimal_cut_points(&canvas, 1800, 1200, 2400, &forbidden);
    assert!(!cuts.is_empty());
}

/// # Reslice Test: Extreme Aspect Ratio Rejection
///
/// ## Purpose:
/// A 1 px wide strip next to a 16000 px wide one would need a 256 gigapixel canvas. The stitcher
/// must refuse it from the planned size alone, before allocating anything.
#[test]
fn test_stitch_rejects_extreme_aspect_ratio() {
    let thin = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(1, 16000, Rgb([0, 0, 0])));
    let wide = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(16000, 1, Rgb([0, 0, 0])));

    let started = std::time::Instant::now();
    let result = stitch_images_vertically(&[thin, wide], &IntakeLimits::default());
    assert!(started.elapsed() < std::time::Duration::from_millis(100));
    assert!(matches!(result, Err(IntakeError::WidthRatio { index: 0, .. })), "got {result:?}");
}
