mod common;

use std::path::Path;
use common::{hash_image, read_cache, write_cache};
use image::{DynamicImage, GenericImageView, ImageBuffer, Luma, Rgb};
use xianscan_rust::ml::inpaint::LamaInpainter;

#[test]
fn test_lama_inpainter_on_synthetic_canvas() {
    // Create a 256x256 test image with a red square
    let mut img_buf: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::new(256, 256);
    for y in 0..256 {
        for x in 0..256 {
            img_buf.put_pixel(x, y, Rgb([200, 200, 200]));
        }
    }
    // Red text region in the center
    for y in 100..150 {
        for x in 100..150 {
            img_buf.put_pixel(x, y, Rgb([255, 0, 0]));
        }
    }
    let img = DynamicImage::ImageRgb8(img_buf);

    // Create mask covering the red text region
    let mut mask_buf: ImageBuffer<Luma<u8>, Vec<u8>> = ImageBuffer::new(256, 256);
    for y in 95..155 {
        for x in 95..155 {
            mask_buf.put_pixel(x, y, Luma([255]));
        }
    }

    let key = hash_image(&img);
    let center_r = if let Some(r_val) = read_cache::<u8>("lama_synth_r", &key) {
        r_val
    } else {
        let model_path = Path::new("models/lama.onnx");
        if !model_path.exists() {
            eprintln!("LaMa model not found at {:?}, skipping test", model_path);
            return;
        }

        let mut inpainter = LamaInpainter::new(model_path).expect("Failed to load LaMa ONNX inpainter");

        let cleaned = inpainter.inpaint(&img, &mask_buf, "patch").expect("Inpainting failed");
        assert_eq!(cleaned.width(), 256);
        assert_eq!(cleaned.height(), 256);

        let cleaned_scaled = inpainter.inpaint(&img, &mask_buf, "scaled").expect("Inpainting scaled failed");
        assert_eq!(cleaned_scaled.width(), 256);

        let cleaned_full = inpainter.inpaint(&img, &mask_buf, "full").expect("Inpainting full failed");
        assert_eq!(cleaned_full.width(), 256);

        let center_pixel = cleaned.get_pixel(125, 125);
        let r = center_pixel[0];
        write_cache("lama_synth_r", &key, &r);
        r
    };

    println!("Inpainted center red value: {}", center_r);
    assert!(center_r < 240, "Red color should be cleanly inpainted away");
}
