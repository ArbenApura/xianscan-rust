use image::{DynamicImage, ImageBuffer, Rgb};
use xianscan_rust::ml::reslice::{
    is_point_forbidden, merge_intervals, stitch_images_vertically,
};

#[test]
fn test_stitch_images_vertically() {
    let img1 = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(200, 100, Rgb([0, 0, 0])));
    let img2 = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(200, 150, Rgb([255, 255, 255])));

    let stitched = stitch_images_vertically(&[img1, img2]);
    assert_eq!(stitched.width(), 200);
    assert_eq!(stitched.height(), 250);
}

#[test]
fn test_stitch_images_mismatched_width() {
    let img1 = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(200, 100, Rgb([0, 0, 0])));
    let img2 = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(400, 100, Rgb([0, 0, 0])));

    let stitched = stitch_images_vertically(&[img1, img2]);
    assert_eq!(stitched.width(), 400);
    assert_eq!(stitched.height(), 300);
}

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

#[test]
fn test_merge_intervals() {
    let raw = vec![(100, 200), (150, 250), (400, 500)];
    let merged = merge_intervals(raw);
    assert_eq!(merged, vec![(100, 250), (400, 500)]);
}

#[test]
fn test_find_optimal_cut_points() {
    let canvas = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(400, 3000, Rgb([100, 100, 100])));
    let forbidden = vec![(1700, 1900)];
    let cuts = xianscan_rust::ml::reslice::find_optimal_cut_points(&canvas, 1800, 1200, 2400, &forbidden);
    assert!(!cuts.is_empty());
}
