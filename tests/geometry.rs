use xianscan_rust::ml::geometry::{box_iou, calculate_box_angle, is_vertical_box, line_center_inside};
use xianscan_rust::ml::schemas::{BoxRect, Region};

#[test]
fn test_horizontal_box_has_zero_angle() {
    let pts = [[10.0, 10.0], [100.0, 10.0], [100.0, 40.0], [10.0, 40.0]];
    let angle = calculate_box_angle(&pts);
    assert_eq!(angle, 0.0);
}

#[test]
fn test_tilted_clockwise_positive_angle() {
    let pts = [[0.0, 0.0], [100.0, 100.0], [80.0, 120.0], [-20.0, 20.0]];
    let angle = calculate_box_angle(&pts);
    assert!((angle - 45.0).abs() < 0.1);
}

#[test]
fn test_tilted_counter_clockwise_negative_angle() {
    let pts = [[0.0, 100.0], [100.0, 100.0 - 57.7], [120.0, 120.0 - 57.7], [20.0, 120.0]];
    let angle = calculate_box_angle(&pts);
    assert!((angle - (-30.0)).abs() < 0.5);
}

#[test]
fn test_small_angle_jitter_snapped_to_zero() {
    let rad = 1.0_f32.to_radians();
    let pts = [[0.0, 0.0], [100.0 * rad.cos(), 100.0 * rad.sin()], [100.0 * rad.cos(), 30.0], [0.0, 30.0]];
    let angle = calculate_box_angle(&pts);
    assert_eq!(angle, 0.0);
}

#[test]
fn test_region_schema_default_angle() {
    let r = Region {
        id: "r0".to_string(),
        box_: BoxRect { x: 0, y: 0, w: 50, h: 20 },
        polygon: vec![[0, 0], [50, 0], [50, 20], [0, 20]],
        text: "test".to_string(),
        confidence: 0.95,
        vertical: false,
        angle: 0.0,
        is_title: false,
        is_subtitle: false,
    };
    assert_eq!(r.angle, 0.0);
}

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
