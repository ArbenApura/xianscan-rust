use xianscan_rust::ml::geometry::{box_iou, calculate_box_angle, is_vertical_box, line_center_inside};
use xianscan_rust::ml::schemas::{BoxRect, Region};

/// # Geometry Test: Horizontal Box Angle Snapping
///
/// ## Purpose:
/// Verifies that perfectly axis-aligned horizontal boxes return an angle of `0.0°`.
#[test]
fn test_horizontal_box_has_zero_angle() {
    let pts = [[10.0, 10.0], [100.0, 10.0], [100.0, 40.0], [10.0, 40.0]];
    let angle = calculate_box_angle(&pts);
    assert_eq!(angle, 0.0);
}

/// # Geometry Test: Clockwise Positive Angle Calculation
///
/// ## Purpose:
/// Verifies that boxes tilted +45° clockwise compute a positive angle near 45.0°.
#[test]
fn test_tilted_clockwise_positive_angle() {
    let pts = [[0.0, 0.0], [100.0, 100.0], [80.0, 120.0], [-20.0, 20.0]];
    let angle = calculate_box_angle(&pts);
    assert!((angle - 45.0).abs() < 0.1);
}

/// # Geometry Test: Counter-Clockwise Negative Angle Calculation
///
/// ## Purpose:
/// Verifies that boxes tilted -30° counter-clockwise compute a negative angle near -30.0°.
#[test]
fn test_tilted_counter_clockwise_negative_angle() {
    let pts = [[0.0, 100.0], [100.0, 100.0 - 57.7], [120.0, 120.0 - 57.7], [20.0, 120.0]];
    let angle = calculate_box_angle(&pts);
    assert!((angle - (-30.0)).abs() < 0.5);
}

/// # Geometry Test: Subpixel Baseline Jitter Snapping
///
/// ## Purpose:
/// Verifies that minor baseline noise (< 1.5°) snaps to 0.0° to prevent upright text tilting.
#[test]
fn test_small_angle_jitter_snapped_to_zero() {
    let rad = 1.0_f32.to_radians();
    let pts = [[0.0, 0.0], [100.0 * rad.cos(), 100.0 * rad.sin()], [100.0 * rad.cos(), 30.0], [0.0, 30.0]];
    let angle = calculate_box_angle(&pts);
    assert_eq!(angle, 0.0);
}

/// # Schema Test: Region Default Angle Serialization
///
/// ## Purpose:
/// Verifies `Region` struct initializes with angle 0.0°.
#[test]
fn test_region_schema_default_angle() {
    let r = Region {
        id: "r0".to_string(),
        box_: BoxRect { x: 0, y: 0, w: 50, h: 20 },
        polygon: vec![[0, 0], [50, 0], [50, 20], [0, 20]],
        bubble_box: None,
        bubble_polygon: None,
        centroid: None,
        kind: Default::default(),
        text: "test".to_string(),
        confidence: 0.95,
        ocr_confidence: None,
        vertical: false,
        angle: 0.0,
        ocr_box: None,
        inpaint_box: None,
        typeset_box: None,
        is_title: false,
        is_subtitle: false,
        carrier_box: None,
    };
    assert_eq!(r.angle, 0.0);
}

/// # Geometry Test: Intersection over Union (IoU) & Vertical Aspect Ratios
///
/// ## Purpose:
/// Tests standard bounding box IoU computation and vertical box aspect checks.
#[test]
fn test_box_iou_and_vertical() {
    let b1 = BoxRect { x: 0, y: 0, w: 100, h: 100 };
    let b2 = BoxRect { x: 50, y: 0, w: 100, h: 100 };
    let iou = box_iou(&b1, &b2);
    assert!((iou - 0.333).abs() < 0.01);

    let v_box = BoxRect { x: 0, y: 0, w: 20, h: 50 };
    assert!(is_vertical_box(&v_box));

    let h_box = BoxRect { x: 0, y: 0, w: 50, h: 20 };
    assert!(!is_vertical_box(&h_box));

    let line = vec![[10, 10], [30, 10], [30, 30], [10, 30]];
    let region = vec![[0, 0], [100, 0], [100, 100], [0, 100]];
    assert!(line_center_inside(&line, &region));
}

/// # Geometry Test: Median Angle from Constituent OCR Lines
///
/// ## Purpose:
/// Verifies that diagonal multi-line speech bubbles compute their rotation angle
/// using the median angle of constituent OCR lines (~9.2°).
#[test]
fn test_pipeline_computes_angle_from_matched_ocr_lines() {
    let line1 = [[352.0, 994.0], [641.0, 1040.0], [633.0, 1094.0], [343.0, 1048.0]];
    let line2 = [[345.0, 1050.0], [674.0, 1105.0], [665.0, 1159.0], [336.0, 1104.0]];

    let ang1 = calculate_box_angle(&line1);
    let ang2 = calculate_box_angle(&line2);

    assert!((ang1 - 9.0).abs() < 0.5);
    assert!((ang2 - 9.5).abs() < 0.5);

    let mut line_angles = [ang1, ang2];
    line_angles.sort_by(|a, b| a.total_cmp(b));
    let median_angle = line_angles[line_angles.len() / 2];
    assert!((median_angle - 9.2).abs() < 0.5);
}

/// # Geometry Test: Language-Aware Manga Reading Order Sorting
///
/// ## Purpose:
/// Verifies that Japanese (`ja`) sorts candidate boxes in the same horizontal band
/// from Right-to-Left (R2L), while other languages sort Left-to-Right (L2R).
#[test]
fn test_language_aware_reading_order_sorting() {
    use xianscan_rust::ml::detect::sort_regions_top_to_bottom;

    // Top row: Box 0 (Left, X=100..300, Y=100..200), Box 1 (Right, X=700..900, Y=100..200)
    // Bottom row: Box 2 (Left, X=150..350, Y=600..700), Box 3 (Right, X=650..850, Y=600..700)
    let b0 = vec![[100.0, 100.0], [300.0, 100.0], [300.0, 200.0], [100.0, 200.0]];
    let b1 = vec![[700.0, 100.0], [900.0, 100.0], [900.0, 200.0], [700.0, 200.0]];
    let b2 = vec![[150.0, 600.0], [350.0, 600.0], [350.0, 700.0], [150.0, 700.0]];
    let b3 = vec![[650.0, 600.0], [850.0, 600.0], [850.0, 700.0], [650.0, 700.0]];

    let boxes = vec![b0, b1, b2, b3];

    // Japanese Manga (`ja`): Top-Right (1) -> Top-Left (0) -> Bottom-Right (3) -> Bottom-Left (2)
    let order_ja = sort_regions_top_to_bottom(&boxes, 1000, 0.5, Some("ja"));
    assert_eq!(order_ja, vec![1, 0, 3, 2]);

    // Korean / Chinese / English: Top-Left (0) -> Top-Right (1) -> Bottom-Left (2) -> Bottom-Right (3)
    let order_ko = sort_regions_top_to_bottom(&boxes, 1000, 0.5, Some("ko"));
    assert_eq!(order_ko, vec![0, 1, 2, 3]);

    let order_zh = sort_regions_top_to_bottom(&boxes, 1000, 0.5, Some("zh-Hans"));
    assert_eq!(order_zh, vec![0, 1, 2, 3]);

    let order_en = sort_regions_top_to_bottom(&boxes, 1000, 0.5, Some("en"));
    assert_eq!(order_en, vec![0, 1, 2, 3]);
}

// -- FEAT-004 PHASE 3: PIXEL SAMPLING WITHOUT WHOLE-PAGE COPIES -- //

fn phase3_lcg(state: &mut u64) -> u32 {
    *state = state.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1_442_695_040_888_963_407);
    (*state >> 33) as u32
}

fn phase3_noise_rgba(w: u32, h: u32, seed: u64) -> image::RgbaImage {
    let mut s = seed;
    image::RgbaImage::from_fn(w, h, |_, _| {
        let v = phase3_lcg(&mut s);
        image::Rgba([(v & 255) as u8, ((v >> 8) & 255) as u8, ((v >> 16) & 255) as u8, ((v >> 24) & 255) as u8])
    })
}

#[test]
fn sample_rgb_matches_to_rgb8_for_all_variants() {
    use image::DynamicImage;
    use xianscan_rust::ml::geometry::{rgb_view, sample_rgb};
    let base = DynamicImage::ImageRgba8(phase3_noise_rgba(13, 7, 3));
    let variants = [
        DynamicImage::ImageRgb8(base.to_rgb8()),
        base.clone(),
        DynamicImage::ImageLuma8(base.to_luma8()),
        DynamicImage::ImageLumaA8(base.to_luma_alpha8()),
        DynamicImage::ImageRgb16(base.to_rgb16()),
        DynamicImage::ImageRgba16(base.to_rgba16()),
        DynamicImage::ImageLuma16(base.to_luma16()),
        DynamicImage::ImageLumaA16(base.to_luma_alpha16()),
        DynamicImage::ImageRgb32F(base.to_rgb32f()),
        DynamicImage::ImageRgba32F(base.to_rgba32f()),
    ];
    for img in &variants {
        let reference = img.to_rgb8();
        let view = rgb_view(img);
        for y in 0..img.height() {
            for x in 0..img.width() {
                assert_eq!(sample_rgb(img, x, y), reference.get_pixel(x, y).0, "{:?} at {x},{y}", img.color());
                assert_eq!(view.get_pixel(x, y), reference.get_pixel(x, y));
            }
        }
    }
}

/// THE get_rotate_crop_image OF THE BASE COMMIT, VERBATIM EXCEPT FOR ITS NAME (WHOLE-PAGE to_rgb8, NO SIZE CAP).
fn reference_rotate_crop(img: &image::DynamicImage, pts: &[[i32; 2]]) -> Option<image::DynamicImage> {
    if pts.len() != 4 {
        return None;
    }
    let f32_pts: Vec<[f32; 2]> = pts.iter().map(|p| [p[0] as f32, p[1] as f32]).collect();
    let [tl, tr, br, bl] = xianscan_rust::ml::geometry::order_points_clockwise(&f32_pts);
    let top_w = ((tr[0] - tl[0]).powi(2) + (tr[1] - tl[1]).powi(2)).sqrt();
    let bot_w = ((br[0] - bl[0]).powi(2) + (br[1] - bl[1]).powi(2)).sqrt();
    let left_h = ((bl[0] - tl[0]).powi(2) + (bl[1] - tl[1]).powi(2)).sqrt();
    let right_h = ((br[0] - tr[0]).powi(2) + (br[1] - tr[1]).powi(2)).sqrt();
    let crop_w = (top_w.max(bot_w).round() as u32).max(4);
    let crop_h = (left_h.max(right_h).round() as u32).max(4);
    let (img_w, img_h) = image::GenericImageView::dimensions(img);
    if img_w == 0 || img_h == 0 {
        return None;
    }
    let rgb = img.to_rgb8();
    let mut out = image::ImageBuffer::from_pixel(crop_w, crop_h, image::Rgb([255_u8, 255, 255]));
    let max_x_idx = (img_w - 1) as f32;
    let max_y_idx = (img_h - 1) as f32;
    for y in 0..crop_h {
        let v = (y as f32 + 0.5) / crop_h as f32;
        let left_x = tl[0] * (1.0 - v) + bl[0] * v;
        let left_y = tl[1] * (1.0 - v) + bl[1] * v;
        let right_x = tr[0] * (1.0 - v) + br[0] * v;
        let right_y = tr[1] * (1.0 - v) + br[1] * v;
        for x in 0..crop_w {
            let u = (x as f32 + 0.5) / crop_w as f32;
            let src_x = (left_x * (1.0 - u) + right_x * u).clamp(0.0, max_x_idx);
            let src_y = (left_y * (1.0 - u) + right_y * u).clamp(0.0, max_y_idx);
            let x0 = src_x.floor() as u32;
            let y0 = src_y.floor() as u32;
            let x1 = (x0 + 1).min(img_w - 1);
            let y1 = (y0 + 1).min(img_h - 1);
            let fx = src_x - x0 as f32;
            let fy = src_y - y0 as f32;
            let p00 = rgb.get_pixel(x0, y0);
            let p10 = rgb.get_pixel(x1, y0);
            let p01 = rgb.get_pixel(x0, y1);
            let p11 = rgb.get_pixel(x1, y1);
            let mut out_rgb = [0_u8; 3];
            for c in 0..3 {
                let top = (p00[c] as f32) * (1.0 - fx) + (p10[c] as f32) * fx;
                let bot = (p01[c] as f32) * (1.0 - fx) + (p11[c] as f32) * fx;
                let val = top * (1.0 - fy) + bot * fy;
                out_rgb[c] = val.round().clamp(0.0, 255.0) as u8;
            }
            out.put_pixel(x, y, image::Rgb(out_rgb));
        }
    }
    let dynamic_out = image::DynamicImage::ImageRgb8(out);
    if crop_h as f32 >= 1.5 * crop_w as f32 {
        Some(dynamic_out.rotate270())
    } else {
        Some(dynamic_out)
    }
}

#[test]
fn rotate_crop_matches_reference_implementation() {
    let page = image::DynamicImage::ImageRgba8(phase3_noise_rgba(160, 120, 11));
    let mut s = 99_u64;
    let mut coord = |lo: i32, span: u32| lo + (phase3_lcg(&mut s) % span) as i32;
    for i in 0..200 {
        // QUADS AROUND A CENTRE, SOME CROSSING THE PAGE EDGES (-30 .. 190 / -30 .. 150)
        let (cx, cy) = (coord(-30, 220), coord(-30, 180));
        let (hw, hh) = (coord(2, 60), coord(2, 40));
        let skew = coord(-8, 17);
        let quad = [[cx - hw, cy - hh + skew], [cx + hw, cy - hh], [cx + hw, cy + hh - skew], [cx - hw, cy + hh]];
        let expected = reference_rotate_crop(&page, &quad).map(|d| d.to_rgb8());
        let got = xianscan_rust::ml::geometry::get_rotate_crop_image(&page, &quad).map(|d| d.to_rgb8());
        assert_eq!(expected.as_ref().map(|b| b.dimensions()), got.as_ref().map(|b| b.dimensions()), "quad {i}: {quad:?}");
        assert!(expected == got, "quad {i} differs: {quad:?}");
    }
}
