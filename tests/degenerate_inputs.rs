// DEGENERATE INPUTS (FEAT-004 PHASE 2): TINY, HUGE AND OUT-OF-PAGE GEOMETRY MUST NEVER PANIC OR BLOW UP.
// MODEL-FREE TESTS ALWAYS RUN. MODEL-GATED TESTS SKIP WHEN models/ IS MISSING. A TEST THAT PINS A KNOWN BUG IS
// #[ignore = "FEAT-004 phase N"] AND THE PHASE THAT FIXES THE BUG REMOVES THE ATTRIBUTE. TESTS FOR CODE THAT DOES
// NOT EXIST YET (TILE PLANNING, INPAINT PLANNING, STICKY GPU FAILURES, DETECTOR DECODE) LAND WITH THEIR PHASE.
use image::{DynamicImage, GenericImageView, Rgb, RgbImage};
use xianscan_rust::ml::geometry::{box_iou, get_rotate_crop_image};
use xianscan_rust::ml::inpaint::build_mask;
use xianscan_rust::ml::ocr::RapidOcr;
use xianscan_rust::ml::schemas::{BoxRect, CleanRequestRegion};
use xianscan_rust::pipeline::region_builder::{compute_chromatic_color_variance, extract_dark_bubble_envelope, extract_white_bubble_envelope};
use xianscan_rust::pipeline::PipelineEngine;

// -- HELPERS -- //

fn plain(w: u32, h: u32, v: u8) -> DynamicImage {
    DynamicImage::ImageRgb8(RgbImage::from_pixel(w, h, Rgb([v, v, v])))
}

fn rect(x: i32, y: i32, w: i32, h: i32) -> BoxRect {
    BoxRect { x, y, w, h }
}

fn models_present() -> bool {
    std::path::Path::new("models").join("PP-OCRv6_rec_small.onnx").exists()
}

fn inside(b: &BoxRect, w: u32, h: u32) -> bool {
    b.x >= 0 && b.y >= 0 && b.w >= 0 && b.h >= 0 && b.x + b.w <= w as i32 && b.y + b.h <= h as i32
}

// -- MODEL-FREE -- //

#[test]
fn variance_on_1x1_and_out_of_page_rects() {
    let tiny = plain(1, 1, 200);
    assert_eq!(compute_chromatic_color_variance(&tiny, &rect(0, 0, 1, 1)), 0.0);
    let page = plain(64, 64, 200);
    assert_eq!(compute_chromatic_color_variance(&page, &rect(10, 10, 0, 0)), 0.0);
    assert_eq!(compute_chromatic_color_variance(&page, &rect(500, 500, 20, 20)), 0.0);
    assert_eq!(compute_chromatic_color_variance(&page, &rect(-100, -100, 20, 20)), 0.0);
}

#[test]
fn white_and_dark_envelope_at_page_edges() {
    for (w, h) in [(8_u32, 8_u32), (1, 4000), (64, 64)] {
        let white = plain(w, h, 255);
        let dark = plain(w, h, 10);
        let boxes = [rect(0, 0, w as i32, h as i32), rect(0, 0, 8, 8), rect(w as i32 - 8, h as i32 - 8, 8, 8)];
        for b in boxes {
            for img in [&white, &dark] {
                if let Some(env) = extract_white_bubble_envelope(img, b.x, b.y, b.w, b.h, w, h) {
                    assert!(inside(&env, w, h), "white envelope {env:?} outside {w}x{h}");
                }
                if let Some(env) = extract_dark_bubble_envelope(img, b.x, b.y, b.w, b.h, w, h) {
                    assert!(inside(&env, w, h), "dark envelope {env:?} outside {w}x{h}");
                }
            }
        }
    }
}

#[test]
fn ink_angle_rect_outside_page() {
    let page = plain(64, 64, 255);
    assert!(xianscan_rust::pipeline::region_builder::geometry::estimate_text_ink_angle(&page, &rect(500, 500, 40, 20)).is_none());
    assert!(xianscan_rust::pipeline::region_builder::geometry::estimate_text_ink_angle(&page, &rect(-200, -200, 40, 20)).is_none());
}

#[test]
fn rotate_crop_on_tiny_and_outside_quads() {
    let tiny = plain(1, 1, 128);
    let _ = get_rotate_crop_image(&tiny, &[[0, 0], [1, 0], [1, 1], [0, 1]]);
    let page = plain(64, 64, 128);
    let _ = get_rotate_crop_image(&page, &[[500, 500], [540, 500], [540, 520], [500, 520]]);
    let _ = get_rotate_crop_image(&page, &[[-500, -500], [-460, -500], [-460, -480], [-500, -480]]);
}

#[test]
fn rotate_crop_huge_quad_is_bounded() {
    // A QUAD WITH HUGE COORDINATES MUST NOT ALLOCATE A CROP FAR LARGER THAN THE PAGE
    let page = plain(64, 64, 128);
    if let Some(out) = get_rotate_crop_image(&page, &[[0, 0], [1_000_000, 0], [1_000_000, 1_000_000], [0, 1_000_000]]) {
        let (w, h) = out.dimensions();
        assert!((w as u64) * (h as u64) <= 64 * 64 * 16, "crop {w}x{h} is unbounded");
    }
}

#[test]
fn crop_region_zero_width_and_left_of_page() {
    let empty = DynamicImage::new_rgb8(0, 0);
    let _ = RapidOcr::crop_region(&empty, &[[0, 0], [10, 0], [10, 10], [0, 10]], 4);
    let page = plain(64, 64, 128);
    let out = RapidOcr::crop_region(&page, &[[-500, 0], [-490, 0], [-490, 10], [-500, 10]], 4);
    assert!(out.width() <= 64 && out.height() <= 64);
}

#[test]
fn box_iou_huge_coords_no_overflow() {
    let a = rect(0, 0, 60_000, 60_000);
    let b = rect(10, 10, 60_000, 60_000);
    let v = box_iou(&a, &b);
    assert!(v.is_finite() && (0.0..=1.0).contains(&v), "iou {v}");
    let c = rect(i32::MAX - 10, 0, 60_000, 60_000);
    let v = box_iou(&a, &c);
    assert!(v.is_finite() && (0.0..=1.0).contains(&v), "iou {v}");
}

#[test]
fn clean_image_huge_client_polygon_without_inpainter() {
    let page = plain(64, 64, 255);
    let regions = vec![CleanRequestRegion {
        id: "r0".to_string(),
        box_: Some(rect(0, 0, 32, 32)),
        polygon: Some(vec![[-1_000_000_000, -1_000_000_000], [1_000_000_000, -1_000_000_000], [1_000_000_000, 1_000_000_000], [-1_000_000_000, 1_000_000_000]]),
        bubble_box: Some(rect(0, 0, i32::MAX, 10)),
    }];
    let out = xianscan_rust::pipeline::cleaner::clean_image(&mut None, &page, &regions, "patch", true);
    assert!(out.is_ok());
}

#[test]
fn build_mask_polygon_outside_page_paints_nothing() {
    let mask = build_mask(64, 64, &[vec![[-500, 0], [-400, 0], [-400, 60], [-500, 60]]], 0);
    assert!(mask.pixels().all(|p| p[0] == 0), "a polygon left of the page painted the mask");
}

// -- MODEL-GATED -- //

#[test]
fn analyze_1x1_1x5000_5000x1_pages() {
    if !models_present() {
        eprintln!("[INFO] Skipping analyze_1x1_1x5000_5000x1_pages: models not found");
        return;
    }
    let mut engine = PipelineEngine::new("models");
    for (w, h) in [(1, 1), (1, 5000), (5000, 1)] {
        let res = xianscan_rust::pipeline::analyzer::analyze_image(&mut engine, &plain(w, h, 255));
        assert!(res.is_ok(), "{w}x{h}: {:?}", res.err());
    }
}

#[test]
fn analyze_blank_1000x20000_page() {
    if !models_present() {
        eprintln!("[INFO] Skipping analyze_blank_1000x20000_page: models not found");
        return;
    }
    let mut engine = PipelineEngine::new("models");
    let res = xianscan_rust::pipeline::analyzer::analyze_image(&mut engine, &plain(1000, 20_000, 255)).expect("analyze");
    assert!(res.regions.is_empty(), "a blank page produced {} regions", res.regions.len());
}

#[test]
fn ocr_detect_on_16x20000() {
    if !models_present() {
        eprintln!("[INFO] Skipping ocr_detect_on_16x20000: models not found");
        return;
    }
    let mut engine = PipelineEngine::new_ocr_only("models");
    let ocr = engine.ocr.as_mut().expect("ocr engine");
    assert!(ocr.detect_and_recognize_tiled_with_lang(&plain(16, 20_000, 255), true, None).is_ok());
}

// -- DETECTOR DECODE (FEAT-004 PHASE 4) -- //

/// ONE RF-DETR QUERY (cx, cy, w, h NORMALISED) WHOSE TEXT CLASS FIRES, IN A 5-CLASS LOGIT ROW.
fn rfdetr_query(cx: f32, cy: f32, w: f32, h: f32) -> ([f32; 4], [f32; 5]) {
    ([cx, cy, w, h], [5.0, -9.0, -9.0, -9.0, -9.0])
}

#[test]
fn rfdetr_decode_edge_boxes_stay_inside_page() {
    use xianscan_rust::ml::detect::rfdetr::decode_outputs;
    let (pw, ph) = (1000_u32, 2000_u32);
    let queries = [rfdetr_query(0.0, 0.5, 0.1, 0.1), rfdetr_query(0.98, 0.5, 0.1, 0.1), rfdetr_query(0.5, 0.5, 0.2, 0.1)];
    let dets: Vec<f32> = queries.iter().flat_map(|q| q.0).collect();
    let labels: Vec<f32> = queries.iter().flat_map(|q| q.1).collect();
    let res = decode_outputs(&dets, &[1, 3, 4], &labels, &[1, 3, 5], pw, ph).expect("decode");
    assert_eq!(res.text_bubbles.len(), 3);
    let left = &res.text_bubbles[0].0;
    assert_eq!(left.x, 0);
    assert_eq!(left.x + left.w, 50, "left box must end at its unclamped right edge");
    let right = &res.text_bubbles[1].0;
    assert!(right.x + right.w <= pw as i32, "right box {right:?} leaves the page");
    assert_eq!(right.x, 930);
    let mid = &res.text_bubbles[2].0;
    assert_eq!((mid.x, mid.w), (400, 200), "an interior box keeps its rounding");
    for (b, _) in &res.text_bubbles {
        assert!(b.x >= 0 && b.y >= 0 && b.x + b.w <= pw as i32 && b.y + b.h <= ph as i32, "{b:?}");
    }
    // A BOX FULLY LEFT OF THE PAGE IS DROPPED
    let (d, l) = rfdetr_query(-0.5, 0.5, 0.1, 0.1);
    let res = decode_outputs(&d, &[1, 1, 4], &l, &[1, 1, 5], pw, ph).expect("decode");
    assert!(res.text_bubbles.is_empty());
}

#[test]
fn rfdetr_decode_rejects_bad_shapes() {
    use xianscan_rust::ml::detect::rfdetr::decode_outputs;
    let (d, l) = rfdetr_query(0.5, 0.5, 0.1, 0.1);
    assert!(decode_outputs(&d, &[1, 1, 4], &l[..3], &[1, 1, 3], 100, 100).is_err(), "3 classes");
    assert!(decode_outputs(&d[..3], &[1, 1, 3], &l, &[1, 1, 5], 100, 100).is_err(), "dets not a multiple of 4");
    assert!(decode_outputs(&d, &[1, 2, 4], &l, &[1, 2, 5], 100, 100).is_err(), "buffers shorter than shapes");
    assert!(decode_outputs(&d, &[1, 1, 4], &l, &[1, 1, 5], 100, 100).is_ok());
    // NON-FINITE VALUES ARE SKIPPED, NOT PANICKED ON
    let nan = [f32::NAN, 0.5, 0.1, 0.1];
    let res = decode_outputs(&nan, &[1, 1, 4], &l, &[1, 1, 5], 100, 100).expect("decode");
    assert!(res.all_detections.is_empty());
}

#[test]
fn rtdetr_threshold_can_only_raise() {
    use xianscan_rust::ml::detect::rtdetr::decode_outputs;
    // CLASSES: 0 BUBBLE, 1 TEXT BUBBLE, 2 TEXT FREE (SEE RtDetrClass::from_u32)
    let labels = [0_i64, 1, 2, 2, -1];
    let boxes = [10.0_f32, 10.0, 50.0, 50.0, 10.0, 10.0, 50.0, 50.0, 10.0, 10.0, 50.0, 50.0, 10.0, 10.0, 50.0, 50.0, 1.0, 1.0, 5.0, 5.0];
    let scores = [0.16_f32, 0.21, 0.26, 0.45, 0.99];
    let run = |t: f32| decode_outputs(&labels, &[1, 5], &boxes, &[1, 5, 4], &scores, &[1, 5], 100, 100, t).expect("decode");
    // THE DEFAULT (0.0) KEEPS TODAY'S EFFECTIVE CUTS 0.15 / 0.20 / 0.25; A NEGATIVE LABEL IS SKIPPED
    let d = run(0.0);
    assert_eq!((d.bubbles.len(), d.text_bubbles.len(), d.text_free.len()), (1, 1, 2));
    // 0.5 RAISES EVERY CLASS: THE 0.45 TEXT-FREE BOX IS DROPPED
    let r = run(0.5);
    assert_eq!((r.bubbles.len(), r.text_bubbles.len(), r.text_free.len()), (0, 0, 0));
    assert!(decode_outputs(&labels, &[1, 5], &boxes, &[1, 4, 4], &scores, &[1, 5], 100, 100, 0.0).is_err());
}

// -- TALL-PAGE TILING (FEAT-004 PHASE 5) -- //

#[test]
fn tile_plan_for_extreme_aspects() {
    use xianscan_rust::ml::detect::tiling::{plan_tiles, TilingConfig};
    let cfg = TilingConfig::recommended();
    for (w, h) in [(1000_u32, 20_000_u32), (690, 2264), (5000, 1), (1, 5000), (1, 1), (800, 2000)] {
        let tiles = plan_tiles(w, h, &cfg);
        assert!(!tiles.is_empty(), "{w}x{h}");
        assert!(tiles.len() as u32 <= cfg.max_tiles, "{w}x{h}: {} tiles", tiles.len());
        assert_eq!(tiles[0].y0, 0, "{w}x{h}");
        let last = tiles.last().unwrap();
        assert_eq!(last.y0 + last.h, h, "{w}x{h}: the last tile ends at the bottom");
        for pair in tiles.windows(2) {
            assert!(pair[1].y0 < pair[0].y0 + pair[0].h, "{w}x{h}: tiles leave a gap");
            assert_eq!(pair[0].h, pair[1].h, "{w}x{h}: tiles share one height");
        }
    }
    assert_eq!(plan_tiles(690, 2264, &cfg).len(), 3);
    assert_eq!(plan_tiles(800, 2000, &cfg).len(), 1, "at the trigger: one pass");
    assert_eq!(plan_tiles(1000, 20_000, &cfg).len(), 18);
    assert_eq!(plan_tiles(1000, 20_000, &TilingConfig::disabled()).len(), 1);
    // OFF BY DEFAULT UNTIL THE OWNER ACCEPTS THE A/B (ADR-003)
    assert_eq!(plan_tiles(1000, 20_000, &TilingConfig::default()).len(), 1);
}

fn tile_result(text: Vec<(BoxRect, f32)>) -> xianscan_rust::ml::detect::DetectResult {
    xianscan_rust::ml::detect::DetectResult {
        boxes: Vec::new(),
        scores: Vec::new(),
        panels: Vec::new(),
        bubbles: Vec::new(),
        onomatopoeia: Vec::new(),
        text_bubbles: text,
        text_free: Vec::new(),
        mask: Vec::new(),
        mask_width: 0,
        mask_height: 0,
        backend: "rfdetr-seg-2xl".to_string(),
    }
}

#[test]
fn merge_tiled_joins_seam_split_box() {
    use xianscan_rust::ml::detect::tiling::{merge_tiled, Tile};
    // TWO 1000 PX TILES OVERLAPPING 700..1000 ON A 1700 PX PAGE
    let (t0, t1) = (Tile { y0: 0, h: 1000 }, Tile { y0: 700, h: 1000 });
    // ONE TALL BUBBLE 600..1300: CUT AT THE BOTTOM OF TILE 0 AND AT THE TOP OF TILE 1
    let upper = rect(100, 600, 300, 400);
    let lower = rect(105, 0, 295, 600);
    // TWO DISTINCT SMALL BUBBLES INSIDE THE OVERLAP BAND, SEEN WHOLE BY BOTH TILES
    let (a0, b0) = (rect(500, 760, 80, 60), rect(500, 860, 80, 60));
    let (a1, b1) = (rect(500, 60, 80, 60), rect(500, 160, 80, 60));
    let merged = merge_tiled(
        vec![
            (t0, tile_result(vec![(upper, 0.9), (a0, 0.8), (b0, 0.8)])),
            (t1, tile_result(vec![(lower, 0.9), (a1, 0.7), (b1, 0.7)])),
        ],
        1000,
        1700,
    );
    let mut boxes: Vec<(i32, i32, i32, i32)> = merged.text_bubbles.iter().map(|(b, _)| (b.x, b.y, b.w, b.h)).collect();
    boxes.sort();
    assert_eq!(boxes, vec![(100, 600, 300, 700), (500, 760, 80, 60), (500, 860, 80, 60)], "{boxes:?}");
    assert_eq!(merged.boxes.len(), merged.text_bubbles.len());
    assert_eq!(merged.scores.len(), merged.boxes.len());
}

// -- LAMA PIXEL BUDGET (FEAT-004 PHASE 6) -- //

fn band_mask(w: u32, h: u32, every: u32, band: u32) -> image::GrayImage {
    image::GrayImage::from_fn(w, h, |x, y| {
        let inside = y % every < band && x > w / 8 && x < w - w / 8;
        image::Luma([if inside { 255 } else { 0 }])
    })
}

#[test]
fn inpaint_plan_caps_every_mode() {
    use xianscan_rust::ml::inpaint::plan::{plan_inpaint, InpaintMode, LAMA_MAX_PIXELS, LAMA_MAX_SIDE};
    let (w, h) = (1000_u32, 20_000_u32);
    let mask = band_mask(w, h, 500, 40);
    for mode in [InpaintMode::Full, InpaintMode::Scaled { target: 512 }, InpaintMode::Patch { pad: 24 }] {
        let passes = plan_inpaint(w, h, &mask, mode);
        assert!(!passes.is_empty(), "{mode:?}");
        for p in &passes {
            let (sw, sh) = ((p.src.2 as f32 * p.scale).round() as u64, (p.src.3 as f32 * p.scale).round() as u64);
            assert!(sw * sh <= LAMA_MAX_PIXELS && sw <= LAMA_MAX_SIDE as u64 && sh <= LAMA_MAX_SIDE as u64, "{mode:?}: pass {p:?}");
            assert!(p.src.0 + p.src.2 <= w && p.src.1 + p.src.3 <= h, "{mode:?}: pass {p:?} leaves the page");
            if let InpaintMode::Scaled { .. } = mode {
                // THE SAME FACTOR ON BOTH SIDES: ASPECT KEPT WITHIN A PIXEL
                let aspect_in = p.src.2 as f32 / p.src.3 as f32;
                let aspect_out = sw as f32 / sh as f32;
                assert!((aspect_in * sh as f32 - sw as f32).abs() <= 1.0 && aspect_out > 0.0, "{p:?}");
            }
        }
    }
    // UNDER THE BUDGET, full IS ONE PASS OVER THE WHOLE PAGE (TODAY'S BEHAVIOUR) AND A SQUARE scaled PAGE IS ONE 512 PASS
    let small = band_mask(256, 256, 100, 20);
    assert_eq!(plan_inpaint(256, 256, &small, InpaintMode::Full).len(), 1);
    let sq = plan_inpaint(256, 256, &small, InpaintMode::Scaled { target: 512 });
    assert_eq!(sq.len(), 1);
    assert_eq!(((sq[0].src.2 as f32 * sq[0].scale).round() as u32), 512);
}

fn lama() -> Option<xianscan_rust::ml::inpaint::LamaInpainter> {
    let path = std::path::Path::new("models/lama.onnx");
    if !path.exists() {
        eprintln!("[INFO] LaMa model not found, skipping");
        return None;
    }
    xianscan_rust::ml::inpaint::LamaInpainter::new(path).ok()
}

#[test]
fn lama_mask_size_mismatch_is_error() {
    let Some(mut inp) = lama() else { return };
    let img = plain(64, 64, 200);
    let mask = image::GrayImage::from_pixel(32, 32, image::Luma([255]));
    for mode in ["patch", "scaled", "full"] {
        assert!(inp.inpaint(&img, &mask, mode).is_err(), "{mode}");
    }
}

#[test]
fn lama_full_mode_tall_strip_completes() {
    let Some(mut inp) = lama() else { return };
    let (w, h) = (256_u32, 6000_u32);
    let img = DynamicImage::ImageRgb8(RgbImage::from_fn(w, h, |x, y| Rgb([(x % 251) as u8, (y % 241) as u8, 90])));
    let mask = band_mask(w, h, 500, 40);
    let out = inp.inpaint(&img, &mask, "full").expect("full mode").to_rgb8();
    let src = img.to_rgb8();
    for y in 0..h {
        for x in 0..w {
            if mask.get_pixel(x, y)[0] == 0 {
                assert_eq!(out.get_pixel(x, y), src.get_pixel(x, y), "unmasked pixel {x},{y} changed");
            }
        }
    }
}

#[test]
fn lama_patch_mode_page_sized_component() {
    use xianscan_rust::ml::inpaint::plan::{plan_inpaint, InpaintMode, LAMA_MAX_PIXELS};
    let (w, h) = (512_u32, 4000_u32);
    // ONE COMPONENT COVERING 90% OF THE PAGE
    let mask = image::GrayImage::from_fn(w, h, |x, y| image::Luma([if x >= 25 && x < 487 && y >= 100 && y < 3700 { 255 } else { 0 }]));
    for p in plan_inpaint(w, h, &mask, InpaintMode::Patch { pad: 24 }) {
        assert!((p.src.2 as u64) * (p.src.3 as u64) <= LAMA_MAX_PIXELS, "{p:?}");
    }
    let Some(mut inp) = lama() else { return };
    let img = plain(w, h, 180);
    assert!(inp.inpaint(&img, &mask, "patch").is_ok());
}

#[test]
fn ocr_recognize_line_very_wide_strip() {
    if !models_present() {
        eprintln!("[INFO] Skipping ocr_recognize_line_very_wide_strip: models not found");
        return;
    }
    let mut engine = PipelineEngine::new_ocr_only("models");
    let ocr = engine.ocr.as_mut().expect("ocr engine");
    // A 3000x12 STRIP SCALES TO 12000 PX WIDE AT 48 PX TALL; IT MUST BE CAPPED AT REC_MAX_WIDTH, NOT ALLOCATED IN FULL
    let started = std::time::Instant::now();
    assert!(ocr.recognize_line(&plain(3000, 12, 255)).is_ok());
    assert!(ocr.recognize_line(&plain(12, 3000, 255)).is_ok());
    assert!(started.elapsed().as_secs() < 60, "wide strips took {:?}", started.elapsed());
}

// -- STICKY GPU FAILURES (FEAT-004 PHASE 9) -- //

#[test]
fn cuda_failure_is_sticky_until_provider_change() {
    use xianscan_rust::ml::device::{gpu_runtime_failed, probe_hardware, record_gpu_failure, set_active_provider, GpuProvider};
    for (provider, name) in [(GpuProvider::Cuda, "CUDAExecutionProvider"), (GpuProvider::DirectMl, "DmlExecutionProvider")] {
        record_gpu_failure(provider);
        assert!(gpu_runtime_failed(provider));
        assert!(!probe_hardware().0.iter().any(|p| p == name), "{name} offered after a recorded failure");
        // A DEVICE CHANGE CLEARS IT, SO THE USER CAN RETRY THE GPU
        let _ = set_active_provider("auto");
        assert!(!gpu_runtime_failed(provider));
    }
}
