// -- CRATE / EXTERNAL IMPORTS -- //
// (NO CRATE IMPORTS AT MODULE ROOT)

// -- INTERNAL IMPORTS -- //
pub mod builder;
pub mod clustering;
pub mod dedup;
pub mod expansion;
pub mod filter;
pub mod geometry;
pub mod refine;

pub use builder::build_regions;
pub use clustering::{cluster_lines_into_utterances, format_lines_cluster, polygon_thickness};
pub use dedup::deduplicate_and_unify_regions;
pub use expansion::{bubble_core, clamp_box_to_core, expand_bubble_text_boxes};
pub use filter::should_reject_candidate_region;
pub use geometry::{compute_chromatic_color_variance, expand_box};
pub use refine::{run_fallback_crop_recognition, try_refine_cluster_crop, FallbackCropOutcome, RefinementOutcome};

// -- TESTS -- //

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, Rgb};
    use crate::ml::schemas::BoxRect;

    #[test]
    fn test_expand_box_geometry() {
        let base = BoxRect { x: 100, y: 100, w: 200, h: 100 };
        let page_w = 1000;
        let page_h = 1000;

        // UNIFORM / ISOTROPIC INPAINT EXPANSION (EQUAL PADDING ON ALL 4 SIDES)
        // ref_dim = 100.max(200*0.4) = 100 -> uniform_pad = (100 * 0.06 * 1.5) = 9px
        let inpaint = expand_box(&base, 0.06, page_w, page_h);
        assert_eq!(inpaint.x, 91);
        assert_eq!(inpaint.y, 91);
        assert_eq!(inpaint.w, 218);
        assert_eq!(inpaint.h, 118);

        // UNIFORM / ISOTROPIC TYPESET EXPANSION (EQUAL PADDING ON ALL 4 SIDES)
        // ref_dim = 100.max(200*0.4) = 100 -> uniform_pad = (100 * 0.12 * 1.5) = 18px
        let typeset = expand_box(&base, 0.12, page_w, page_h);
        assert_eq!(typeset.x, 82);
        assert_eq!(typeset.y, 82);
        assert_eq!(typeset.w, 236);
        assert_eq!(typeset.h, 136);
    }

    #[test]
    fn test_expand_box_clamping_to_boundaries() {
        let edge_box = BoxRect { x: 5, y: 5, w: 50, h: 50 };
        let page_w = 52;
        let page_h = 52;

        let expanded = expand_box(&edge_box, 0.20, page_w, page_h);
        assert_eq!(expanded.x, 0);
        assert_eq!(expanded.y, 0);
        assert_eq!(expanded.w, 52);
        assert_eq!(expanded.h, 52);
    }

    #[test]
    fn test_expand_box_does_not_over_expand_opposite_side_when_clipped() {
        // BOX NEAR THE LEFT PAGE EDGE BUT WITH ROOM ON THE RIGHT: THE EXPANSION MUST BE
        // CLIPPED ON THE LEFT ONLY, NOT SHIFTED TO OVER-EXPAND THE RIGHT EDGE.
        let base = BoxRect { x: 5, y: 100, w: 50, h: 50 };
        let page_w = 200;
        let page_h = 200;
        // ref_dim = 50 -> uniform_pad = (50 * 0.20 * 1.5) = 15
        // LEFT CLIPPED TO 0 (5 - 15); RIGHT EDGE = 5 + 50 + 15 = 70 -> WIDTH = 70
        let expanded = expand_box(&base, 0.20, page_w, page_h);
        assert_eq!(expanded.x, 0);
        assert_eq!(expanded.w, 70);
        assert_eq!(expanded.y, 85);
        assert_eq!(expanded.h, 80);
    }

    #[test]
    fn test_noise_strokes_filtering() {
        assert!(crate::ml::detect::is_standalone_noise_stroke(""));
        assert!(crate::ml::detect::is_standalone_noise_stroke("000"));
        assert!(crate::ml::detect::is_standalone_noise_stroke("ooo"));
        assert!(crate::ml::detect::is_standalone_noise_stroke("一"));
        assert!(crate::ml::detect::is_standalone_noise_stroke("丨"));
        assert!(crate::ml::detect::is_standalone_noise_stroke("1"));
        assert!(crate::ml::detect::is_standalone_noise_stroke("I"));
        assert!(crate::ml::detect::is_standalone_noise_stroke("l"));
        assert!(crate::ml::detect::is_standalone_noise_stroke("|"));
        assert!(crate::ml::detect::is_standalone_noise_stroke("••"));

        // VALID DIALOGUE TEXT MUST NOT BE FLAGGED AS NOISE STROKE
        assert!(!crate::ml::detect::is_standalone_noise_stroke("你好"));
        assert!(!crate::ml::detect::is_standalone_noise_stroke("Hello world"));
        assert!(!crate::ml::detect::is_standalone_noise_stroke("我是主角！"));
    }

    #[test]
    fn test_chromatic_variance_calculation() {
        // MONOCHROME / WHITE BUBBLE MOCK IMAGE (VARIANCE SHOULD BE LOW)
        let white_img = DynamicImage::ImageRgb8(image::RgbImage::from_pixel(100, 100, Rgb([255, 255, 255])));
        let rect = BoxRect { x: 10, y: 10, w: 80, h: 80 };
        let var_white = compute_chromatic_color_variance(&white_img, &rect);
        assert!(var_white < 5.0);

        // HIGHLY SATURATED COLORFUL IMAGE (VARIANCE SHOULD BE HIGH)
        let mut color_img = image::RgbImage::new(100, 100);
        for y in 0..100 {
            for x in 0..100 {
                if (x + y) % 2 == 0 {
                    color_img.put_pixel(x, y, Rgb([255, 0, 50]));
                } else {
                    color_img.put_pixel(x, y, Rgb([0, 220, 255]));
                }
            }
        }
        let var_color = compute_chromatic_color_variance(&DynamicImage::ImageRgb8(color_img), &rect);
        assert!(var_color > 50.0);
    }

    #[test]
    fn test_bubble_core_and_clamping() {
        let bubble = BoxRect { x: 10, y: 10, w: 100, h: 100 };
        let core = bubble_core(&bubble);
        assert!(core.is_some());
        let (left, right, top, bottom) = core.unwrap();
        assert!(left > bubble.x);
        assert!(right < bubble.x + bubble.w);
        assert!(top > bubble.y);
        assert!(bottom < bubble.y + bubble.h);

        let mut target = BoxRect { x: 0, y: 0, w: 200, h: 200 };
        clamp_box_to_core(&mut target, left, right, top, bottom);
        assert_eq!(target.x, left);
        assert_eq!(target.y, top);
        assert_eq!(target.w, right - left);
        assert_eq!(target.h, bottom - top);
    }
}
