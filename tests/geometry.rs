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
        vertical: false,
        angle: 0.0,
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

