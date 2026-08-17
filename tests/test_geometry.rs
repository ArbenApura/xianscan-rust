use xianscan_rust::ml::geometry::{
    box_iou_pts, calculate_box_angle_i32, dilate_mask, fill_polygon, find_contours,
    get_mini_boxes, unclip_polygon,
};

/// # Geometry Test: Axis-Aligned Minimum Bounding Box Extraction
///
/// ## Purpose:
/// Verifies `get_mini_boxes` calculates the minimum bounding rectangle and short-side dimension.
#[test]
fn test_get_mini_boxes_axis_aligned() {
    let pts = vec![[10.0, 10.0], [50.0, 10.0], [50.0, 30.0], [10.0, 30.0]];
    let (box_rect, sside) = get_mini_boxes(&pts);
    assert_eq!(box_rect.len(), 4);
    assert!((sside - 20.0).abs() < 1.0);
}

/// # Geometry Test: Vatti Clipper Polygon Unclip Expansion
///
/// ## Purpose:
/// Verifies `unclip_polygon` expands DBNet text line segmentation masks outward by the unclip ratio.
#[test]
fn test_unclip_polygon_expansion() {
    let pts = vec![[20.0, 20.0], [80.0, 20.0], [80.0, 40.0], [20.0, 40.0]];
    let expanded = unclip_polygon(&pts, 1.5).expect("Unclip failed");
    assert!(expanded.len() >= 4);

    let (_exp_box, sside) = get_mini_boxes(&expanded);
    assert!(sside > 20.0, "Expanded box short side must be larger than 20.0");
}

/// # Geometry Test: Polygon Rasterization & Contour Tracing
///
/// ## Purpose:
/// Verifies `fill_polygon` rasterizes polygon boundaries and `find_contours` extracts outer loops.
#[test]
fn test_find_contours_and_fill_polygon() {
    let w = 100;
    let h = 100;
    let mut mask = vec![0_u8; w * h];

    let poly = vec![[20, 20], [60, 20], [60, 60], [20, 60]];
    fill_polygon(&mut mask, w, h, &poly, 255);

    assert_eq!(mask[30 * w + 30], 255);
    assert_eq!(mask[10 * w + 10], 0);

    let contours = find_contours(&mask, w, h);
    assert!(!contours.is_empty());
    assert!(contours[0].len() >= 4);
}

/// # Geometry Test: Binary Mask Morphological Dilation
///
/// ## Purpose:
/// Verifies `dilate_mask` expands inpainting mask regions by radius $r$ pixels.
#[test]
fn test_dilate_mask_expansion() {
    let w = 50;
    let h = 50;
    let mut mask = vec![0_u8; w * h];
    mask[25 * w + 25] = 255;

    let dilated = dilate_mask(&mask, w, h, 3);
    assert_eq!(dilated[25 * w + 25], 255);
    assert_eq!(dilated[25 * w + 28], 255);
    assert_eq!(dilated[28 * w + 25], 255);
    assert_eq!(dilated[25 * w + 30], 0);
}

/// # Geometry Test: Polygon Point IoU Calculation
///
/// ## Purpose:
/// Verifies `box_iou_pts` computes overlap ratio between two polygon coordinate arrays.
#[test]
fn test_box_iou_pts() {
    let b1 = vec![[0, 0], [100, 0], [100, 100], [0, 100]];
    let b2 = vec![[50, 0], [150, 0], [150, 100], [50, 100]];

    let iou = box_iou_pts(&b1, &b2);
    // Intersection = 50 * 100 = 5000, Union = 15000 -> IoU = 1/3
    assert!((iou - 0.3333).abs() < 0.05);
}

/// # Geometry Test: Integer Coordinate Box Angle Snapping
///
/// ## Purpose:
/// Verifies `calculate_box_angle_i32` computes rotation angle from integer polygon vertices.
#[test]
fn test_calculate_box_angle_i32() {
    let horizontal_box = vec![[0, 0], [100, 0], [100, 30], [0, 30]];
    assert_eq!(calculate_box_angle_i32(&horizontal_box), 0.0);
}
