use std::io::Cursor;

use image::{DynamicImage, ImageBuffer, ImageFormat, Rgb};
use xianscan_rust::ml::intake::{
    decode_image_limited, plan_canvas, probe_dimensions, validate_heights, IntakeError, IntakeLimits,
};

fn png_bytes(width: u32, height: u32) -> Vec<u8> {
    let img = DynamicImage::ImageRgb8(ImageBuffer::from_pixel(width, height, Rgb([200, 200, 200])));
    let mut out = Cursor::new(Vec::new());
    img.write_to(&mut out, ImageFormat::Png).unwrap();
    out.into_inner()
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFF_u32;
    for &b in bytes {
        crc ^= u32::from(b);
        for _ in 0..8 {
            crc = if crc & 1 != 0 { (crc >> 1) ^ 0xEDB8_8320 } else { crc >> 1 };
        }
    }
    !crc
}

/// A PNG SIGNATURE, A VALID IHDR CLAIMING `width x height` AND THE START OF A TRUNCATED IDAT CHUNK.
fn png_header_only(width: u32, height: u32) -> Vec<u8> {
    let mut chunk = b"IHDR".to_vec();
    chunk.extend_from_slice(&width.to_be_bytes());
    chunk.extend_from_slice(&height.to_be_bytes());
    chunk.extend_from_slice(&[8, 2, 0, 0, 0]); // 8-BIT RGB, DEFAULT COMPRESSION / FILTER / NO INTERLACE

    let mut out = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    out.extend_from_slice(&13_u32.to_be_bytes());
    out.extend_from_slice(&chunk);
    out.extend_from_slice(&crc32(&chunk).to_be_bytes());
    out.extend_from_slice(&65_536_u32.to_be_bytes());
    out.extend_from_slice(b"IDAT");
    out.extend_from_slice(&[0x78, 0x9C, 0x00, 0x00]); // ZLIB HEADER, THEN THE FILE ENDS
    out
}

#[test]
fn test_probe_reads_header_only() {
    let bytes = png_header_only(60_000, 60_000);
    assert_eq!(probe_dimensions(&bytes), Ok((60_000, 60_000)));
}

#[test]
fn test_decode_limited_rejects_over_pixel_cap() {
    let limits = IntakeLimits { max_image_pixels: 1_000_000, ..IntakeLimits::default() };
    let result = decode_image_limited(&png_bytes(2000, 2000), 3, &limits);
    assert_eq!(result.unwrap_err(), IntakeError::TooLarge { index: 3, width: 2000, height: 2000 });
}

#[test]
fn test_decode_limited_rejects_header_over_edge_cap() {
    // THE 60000 PX CLAIM IS REFUSED FROM THE HEADER, SO THE MISSING PIXEL DATA IS NEVER READ
    let limits = IntakeLimits { max_edge: 50_000, ..IntakeLimits::default() };
    let result = decode_image_limited(&png_header_only(60_000, 10), 0, &limits);
    assert!(matches!(result, Err(IntakeError::TooLarge { index: 0, .. })), "got {result:?}");
}

#[test]
fn test_decode_limited_accepts_within_cap() {
    let img = decode_image_limited(&png_bytes(800, 1200), 0, &IntakeLimits::default()).unwrap();
    assert_eq!((img.width(), img.height()), (800, 1200));
}

#[test]
fn test_decode_limited_rejects_garbage() {
    let garbage: Vec<u8> = (0..4096_u32).map(|i| (i.wrapping_mul(2_654_435_761) >> 13) as u8).collect();
    let result = decode_image_limited(&garbage, 7, &IntakeLimits::default());
    assert!(matches!(result, Err(IntakeError::Undecodable { index: 7, .. })), "got {result:?}");
    assert!(result.unwrap_err().to_string().contains("Image 7"));
}

#[test]
fn test_plan_canvas_checked_math() {
    // NO WIDTH RATIO CAP, SO THIS REACHES THE SIZE MATH: 300000 * 300000 * 300000 WOULD WRAP u32 AND u64 PIXEL COUNTS
    let limits = IntakeLimits { max_width_ratio: u32::MAX, ..IntakeLimits::default() };
    let result = plan_canvas(&[(1, 300_000), (300_000, 1)], &limits);
    assert!(matches!(result, Err(IntakeError::CanvasTooLarge { .. })), "got {result:?}");

    let result = plan_canvas(&[(1, 300_000), (300_000, 1)], &IntakeLimits::default());
    assert!(result.is_err());
}

#[test]
fn test_plan_canvas_width_ratio() {
    let result = plan_canvas(&[(800, 2000), (1, 2000)], &IntakeLimits::default());
    assert_eq!(result.unwrap_err(), IntakeError::WidthRatio { index: 1, width: 1, max_w: 800 });
}

#[test]
fn test_plan_canvas_matches_stitch_rounding() {
    // 200 x 100 SCALED TO 400 WIDE IS 200 TALL, PLUS 400 x 100: THE SAME 400 x 300 THE STITCHER BUILDS
    assert_eq!(plan_canvas(&[(200, 100), (400, 100)], &IntakeLimits::default()), Ok((400, 300)));
}

#[test]
fn test_plan_canvas_rejects_too_many_images() {
    let limits = IntakeLimits { max_images: 2, ..IntakeLimits::default() };
    let err = plan_canvas(&[(10, 10); 3], &limits).unwrap_err();
    assert_eq!(err, IntakeError::TooManyImages { count: 3, max: 2 });
    assert_eq!(err.status().as_u16(), 413);
}

#[test]
fn test_validate_heights_rejects_bad_order() {
    assert!(validate_heights(1600, 1200, 2000).is_ok());
    assert!(matches!(validate_heights(1000, 1200, 2000), Err(IntakeError::InvalidHeights(_)))); // min > target
    assert!(matches!(validate_heights(1600, 1200, 20_001), Err(IntakeError::InvalidHeights(_)))); // max over cap
    assert!(matches!(validate_heights(1600, 255, 2000), Err(IntakeError::InvalidHeights(_)))); // min under floor
    assert!(matches!(validate_heights(2500, 1200, 2000), Err(IntakeError::InvalidHeights(_)))); // target > max
    assert_eq!(validate_heights(1600, 100, 2000).unwrap_err().status().as_u16(), 422);
}
