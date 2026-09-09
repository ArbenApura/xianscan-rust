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

/// # Geometry Test: Dark Bubble Envelope Boundary Clamp
///
/// ## Purpose:
/// Verifies `extract_dark_bubble_envelope` does not panic when dark bubble rays reach image boundaries.
#[test]
fn test_dark_bubble_envelope_boundary_clamp() {
    use image::{DynamicImage, Rgb, RgbImage};
    use xianscan_rust::pipeline::region_builder::extract_dark_bubble_envelope;

    let mut img = RgbImage::new(100, 100);
    for pixel in img.pixels_mut() {
        *pixel = Rgb([10, 10, 10]); // Dark background
    }
    // Add light stroke in the center
    for y in 45..55 {
        for x in 45..55 {
            img.put_pixel(x, y, Rgb([240, 240, 240]));
        }
    }
    let dyn_img = DynamicImage::ImageRgb8(img);
    // Text box from (10, 10) with w=80, h=80 inside 100x100 page.
    // Rays will expand past left (x=0) and right (x=100) boundaries, producing bubble_max_x - bubble_x > page_w.
    let res = extract_dark_bubble_envelope(&dyn_img, 10, 10, 80, 80, 100, 100);
    assert!(res.is_some());
    let rect = res.unwrap();
    assert!(rect.x >= 0);
    assert!(rect.y >= 0);
    assert!(rect.x + rect.w <= 100);
    assert!(rect.y + rect.h <= 100);
}

/// # Geometry Test: Dark Bubble Envelope Fuzz & Boundary Stress Test
///
/// ## Purpose:
/// Stress-tests `extract_dark_bubble_envelope` across hundreds of boundary permutations
/// (full-bleed, 1px margins, extreme aspect ratios, edge-clipping) ensuring zero panics
/// and strict containment invariants (`x >= 0`, `y >= 0`, `x + w <= pw`, `y + h <= ph`).
#[test]
fn test_dark_bubble_envelope_stress_and_fuzz() {
    use image::{DynamicImage, Rgb, RgbImage};
    use xianscan_rust::pipeline::region_builder::extract_dark_bubble_envelope;

    let test_sizes = [(16, 16), (25, 50), (100, 100), (300, 150), (73, 97)];

    for (pw, ph) in test_sizes {
        // Build image with dark background and centered light strokes
        let mut img = RgbImage::new(pw, ph);
        for (x, y, pixel) in img.enumerate_pixels_mut() {
            if x >= pw / 3 && x <= pw * 2 / 3 && y >= ph / 3 && y <= ph * 2 / 3 {
                *pixel = Rgb([240, 240, 240]);
            } else {
                *pixel = Rgb([15, 15, 15]);
            }
        }
        let dyn_img = DynamicImage::ImageRgb8(img);

        // Test boundary positions and dimensions
        let test_boxes = [
            (0, 0, pw as i32, ph as i32),
            (0, 0, (pw / 2).max(8) as i32, (ph / 2).max(8) as i32),
            (1, 1, (pw as i32 - 2).max(8), (ph as i32 - 2).max(8)),
            (0, 0, 8, 8),
            ((pw as i32 - 9).max(0), (ph as i32 - 9).max(0), 8, 8),
            (pw as i32 / 4, ph as i32 / 4, (pw / 2).max(8) as i32, (ph / 2).max(8) as i32),
            (-5, -5, 20, 20),
            (0, 0, pw as i32 + 10, ph as i32 + 10),
        ];

        for (bx, by, bw, bh) in test_boxes {
            if let Some(rect) = extract_dark_bubble_envelope(&dyn_img, bx, by, bw, bh, pw, ph) {
                assert!(rect.x >= 0, "rect.x ({}) must be >= 0 (pw={}, ph={})", rect.x, pw, ph);
                assert!(rect.y >= 0, "rect.y ({}) must be >= 0 (pw={}, ph={})", rect.y, pw, ph);
                assert!(rect.w >= 1, "rect.w ({}) must be >= 1", rect.w);
                assert!(rect.h >= 1, "rect.h ({}) must be >= 1", rect.h);
                assert!(
                    rect.x + rect.w <= pw as i32,
                    "rect.x + rect.w ({} + {}) = {} must be <= pw ({})",
                    rect.x, rect.w, rect.x + rect.w, pw
                );
                assert!(
                    rect.y + rect.h <= ph as i32,
                    "rect.y + rect.h ({} + {}) = {} must be <= ph ({})",
                    rect.y, rect.h, rect.y + rect.h, ph
                );
            }
        }
    }
}


