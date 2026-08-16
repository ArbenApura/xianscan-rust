use image::{DynamicImage, GenericImageView, ImageBuffer, Rgb};
use xianscan_rust::ml::watermark::WatermarkRemover;

#[test]
fn test_create_bubble_watermark_mask_detects_colored_overlay() {
    let remover = WatermarkRemover::new();
    let mut img_buf = ImageBuffer::from_pixel(300, 300, Rgb([50_u8, 50, 50]));

    // White speech bubble
    for y in 50..250 {
        for x in 50..250 {
            img_buf.put_pixel(x, y, Rgb([255, 255, 255]));
        }
    }

    // Black text stroke
    for y in 120..140 {
        for x in 80..220 {
            img_buf.put_pixel(x, y, Rgb([0, 0, 0]));
        }
    }

    // Red watermark letters across bubble
    for y in 90..110 {
        for x in 70..230 {
            img_buf.put_pixel(x, y, Rgb([200, 30, 30]));
        }
    }

    let dyn_img = DynamicImage::ImageRgb8(img_buf);
    let mask = remover.create_bubble_watermark_mask(&dyn_img, 210, 20, 35, 15);

    assert_eq!(mask.dimensions(), (300, 300));
    // Watermark region should be masked
    assert_eq!(mask.get_pixel(100, 95)[0], 255);
    // Black text stroke should NOT be masked
    assert_eq!(mask.get_pixel(150, 130)[0], 0);
    // Clean bubble area outside watermark should NOT be masked
    assert_eq!(mask.get_pixel(200, 200)[0], 0);
}

#[test]
fn test_inpaint_colliding_watermarks() {
    let remover = WatermarkRemover::new();
    let mut img_buf = ImageBuffer::from_pixel(300, 300, Rgb([40_u8, 40, 40]));

    // White bubble
    for y in 50..250 {
        for x in 50..250 {
            img_buf.put_pixel(x, y, Rgb([255, 255, 255]));
        }
    }

    // Black text
    for y in 130..150 {
        for x in 80..220 {
            img_buf.put_pixel(x, y, Rgb([0, 0, 0]));
        }
    }

    // Red watermark
    for y in 80..110 {
        for x in 70..230 {
            img_buf.put_pixel(x, y, Rgb([200, 30, 30]));
        }
    }

    let dyn_img = DynamicImage::ImageRgb8(img_buf);
    let mask = remover.create_bubble_watermark_mask(&dyn_img, 210, 20, 35, 15);
    let cleaned = remover.inpaint_colliding_watermarks(&dyn_img, &mask);

    let p_wm = cleaned.get_pixel(150, 95);
    // Inpainted watermark area should be restored to light color (> 180)
    assert!(p_wm[0] > 180 && p_wm[1] > 180 && p_wm[2] > 180);

    // Black text remains dark (< 50)
    let p_text = cleaned.get_pixel(150, 140);
    assert!(p_text[0] < 50 && p_text[1] < 50 && p_text[2] < 50);
}
