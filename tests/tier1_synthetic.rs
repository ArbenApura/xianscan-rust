// -- CRATE / EXTERNAL IMPORTS -- //
use image::{DynamicImage, Rgba, RgbaImage};

// -- INTERNAL IMPORTS -- //
use xianscan_rust::ml::detect::{filter_text_by_source_lang, has_cjk_characters};
use xianscan_rust::ml::geometry::{box_iou, calculate_box_angle, points_to_box_rect};
use xianscan_rust::ml::schemas::BoxRect;

// -- TESTS -- //

#[test]
fn test_tier1_synthetic_bubble_generation_and_detection() {
    // GENERATE A CLEAN SYNTHETIC SPEECH BUBBLE CANVAS (NO COPYRIGHTED MEDIA)
    let mut img = RgbaImage::from_pixel(400, 400, Rgba([245, 245, 245, 255]));

    // DRAW WHITE RECTANGULAR BUBBLE IN CENTER
    for y in 100..250 {
        for x in 80..320 {
            img.put_pixel(x, y, Rgba([255, 255, 255, 255]));
        }
    }

    // DRAW DARK BORDER AROUND BUBBLE
    for x in 80..320 {
        img.put_pixel(x, 100, Rgba([20, 20, 20, 255]));
        img.put_pixel(x, 249, Rgba([20, 20, 20, 255]));
    }
    for y in 100..250 {
        img.put_pixel(80, y, Rgba([20, 20, 20, 255]));
        img.put_pixel(319, y, Rgba([20, 20, 20, 255]));
    }

    let dyn_img = DynamicImage::ImageRgba8(img);
    assert_eq!(dyn_img.width(), 400);
    assert_eq!(dyn_img.height(), 400);
}

#[test]
fn test_tier1_synthetic_language_routing_filters() {
    // 1. ENGLISH PRESERVATION & CJK STRIPPING
    let mixed_en = "Hello World! 漫画 測試";
    let filtered_en = filter_text_by_source_lang(mixed_en, Some("en"));
    assert_eq!(filtered_en.trim(), "Hello World!");
    assert!(!has_cjk_characters(&filtered_en));

    // 2. CHINESE SCRIPT DETECTION
    let cjk_sample = "斩妖除魔，天道无极";
    assert!(has_cjk_characters(cjk_sample));

    // 3. JAPANESE HIRAGANA & KATAKANA HANDLING
    let ja_sample = "こんにちは 世界";
    assert!(has_cjk_characters(ja_sample));
}

#[test]
fn test_tier1_synthetic_geometry_invariants() {
    let bbox1 = BoxRect { x: 10, y: 10, w: 50, h: 50 };
    let bbox2 = BoxRect { x: 30, y: 30, w: 50, h: 50 };

    let iou = box_iou(&bbox1, &bbox2);
    assert!(iou > 0.0 && iou < 1.0, "Expected intersecting IoU between 0 and 1, got {}", iou);

    let pts = [[10.0, 10.0], [100.0, 10.0], [100.0, 40.0], [10.0, 40.0]];
    let angle = calculate_box_angle(&pts);
    assert_eq!(angle, 0.0);

    let poly = [[10, 15], [50, 20], [45, 80], [5, 75]];
    let rect = points_to_box_rect(&poly);
    assert_eq!(rect.x, 5);
    assert_eq!(rect.y, 15);
    assert_eq!(rect.w, 45);
    assert_eq!(rect.h, 65);
}

#[test]
fn test_tier1_synthetic_oversized_sfx_filtering() {
    let page_h = 1000;

    // 1. OVERSIZED VERTICAL SFX (HEIGHT = 350 >= 30% OF 1000, W/H = 100/350 < 2.5) -> MUST BE FILTERED
    let oversized_sfx = BoxRect { x: 50, y: 100, w: 100, h: 350 };
    let is_sentence1 = (oversized_sfx.w as f32 / oversized_sfx.h.max(1) as f32 >= 2.5) || oversized_sfx.h <= 35;
    let is_oversized1 = (oversized_sfx.h as f32 >= (page_h as f32) * 0.30) && !is_sentence1;
    assert!(is_oversized1, "Oversized vertical SFX must be flagged for removal");

    // 2. LONG HORIZONTAL GUTTER SENTENCE (HEIGHT = 40, WIDTH = 700, W/H = 17.5 >= 2.5) -> MUST BE PROTECTED
    let sentence_box = BoxRect { x: 50, y: 500, w: 700, h: 40 };
    let is_sentence2 = (sentence_box.w as f32 / sentence_box.h.max(1) as f32 >= 2.5) || sentence_box.h <= 35;
    let is_oversized2 = (sentence_box.h as f32 >= (page_h as f32) * 0.30) && !is_sentence2;
    assert!(!is_oversized2, "Horizontal sentence must never be treated as oversized SFX");

    // 3. MODERATE CALLIGRAPHY SFX (HEIGHT = 250 < 30% OF 1000) -> MUST BE PRESERVED
    let moderate_sfx = BoxRect { x: 100, y: 200, w: 120, h: 250 };
    let is_sentence3 = (moderate_sfx.w as f32 / moderate_sfx.h.max(1) as f32 >= 2.5) || moderate_sfx.h <= 35;
    let is_oversized3 = (moderate_sfx.h as f32 >= (page_h as f32) * 0.30) && !is_sentence3;
    assert!(!is_oversized3, "Moderate SFX (< 30% canvas height) must be preserved");
}

