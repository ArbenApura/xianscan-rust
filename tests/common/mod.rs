// -- CRATE / EXTERNAL IMPORTS -- //
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use image::{DynamicImage, Rgba, RgbaImage};
use imageproc::drawing::{draw_hollow_rect_mut, draw_line_segment_mut};
use imageproc::rect::Rect;
use serde::Serialize;
use sha2::{Digest, Sha256};

// -- INTERNAL IMPORTS -- //
use xianscan_rust::ml::schemas::{AnalyzeOptions, AnalyzeResponse, BoxRect, RegionKind};
use xianscan_rust::pipeline::PipelineEngine;

// -- CONSTANTS -- //

// GLOBAL REGISTRY TO MAP IMAGE HASHES TO SOURCE FIXTURE FILE PATHS
static FIXTURE_PATH_MAP: Mutex<Option<HashMap<String, PathBuf>>> = Mutex::new(None);

/// ASSERTS EXACT BOUNDING BOX PROXIMITY AND REGION KIND WITH STRICT DRIFT TOLERANCES
#[macro_export]
macro_rules! assert_region_bounds {
    ($region:expr, $kind:expr, $exp_x:expr, $exp_y:expr, $exp_w:expr, $exp_h:expr, $max_drift:expr) => {{
        assert_eq!($region.kind, $kind, "Region kind mismatch for text '{}'", $region.text.replace('\n', " "));
        assert!(
            ($region.box_.x - $exp_x).abs() <= $max_drift
                && ($region.box_.y - $exp_y).abs() <= $max_drift
                && ($region.box_.w - $exp_w).abs() <= ($max_drift * 3 / 2)
                && ($region.box_.h - $exp_h).abs() <= ($max_drift * 3 / 2),
            "Bounding box drift for '{}': got [x:{}, y:{}, w:{}, h:{}], expected [x:{}, y:{}, w:{}, h:{}] (max drift: ±{}px)",
            $region.text.replace('\n', " "),
            $region.box_.x, $region.box_.y, $region.box_.w, $region.box_.h,
            $exp_x, $exp_y, $exp_w, $exp_h,
            $max_drift
        );
    }};
}

/// ASSERTS EXACT OUTER BUBBLE CONTAINER BOUNDS (BUBBLE_BOX) WITH STRICT DRIFT TOLERANCES
#[macro_export]
macro_rules! assert_bubble_bounds {
    ($region:expr, $exp_x:expr, $exp_y:expr, $exp_w:expr, $exp_h:expr, $max_drift:expr) => {{
        assert!(
            $region.bubble_box.is_some(),
            "Expected bubble_box container for region '{}', but got None",
            $region.text.replace('\n', " ")
        );
        let b = $region.bubble_box.as_ref().unwrap();
        assert!(
            (b.x - $exp_x).abs() <= $max_drift
                && (b.y - $exp_y).abs() <= $max_drift
                && (b.w - $exp_w).abs() <= ($max_drift * 3 / 2)
                && (b.h - $exp_h).abs() <= ($max_drift * 3 / 2),
            "Outer bubble_box drift for '{}': got [x:{}, y:{}, w:{}, h:{}], expected [x:{}, y:{}, w:{}, h:{}] (max drift: ±{}px)",
            $region.text.replace('\n', " "),
            b.x, b.y, b.w, b.h,
            $exp_x, $exp_y, $exp_w, $exp_h,
            $max_drift
        );
    }};
}

/// ASSERTS ROTATION ANGLE IN DEGREES WITH STRICT DRIFT TOLERANCES
#[macro_export]
macro_rules! assert_region_angle {
    ($region:expr, $exp_angle:expr, $max_drift:expr) => {{
        let diff = ($region.angle - $exp_angle as f32).abs();
        assert!(
            diff <= $max_drift as f32,
            "Rotation angle drift for '{}': got {:.2}°, expected {:.2}° (max drift: ±{:.2}°)",
            $region.text.replace('\n', " "),
            $region.angle,
            $exp_angle as f32,
            $max_drift as f32
        );
    }};
}

/// ASSERTS EXACT STRUCTURAL ELEMENT COUNTS FOR A GIVEN ANALYZE RESPONSE
#[macro_export]
macro_rules! assert_element_counts {
    ($res:expr, $exp_total:expr, $exp_bubbles:expr, $exp_sfx:expr, $exp_free:expr) => {{
        assert_eq!($res.regions.len(), $exp_total, "Total region count mismatch");
        let actual_bubbles = $res.regions.iter().filter(|r| r.kind == xianscan_rust::ml::schemas::RegionKind::DialogueBubble).count();
        let actual_sfx = $res.regions.iter().filter(|r| r.kind == xianscan_rust::ml::schemas::RegionKind::SoundEffect).count();
        let actual_free = $res.regions.iter().filter(|r| r.kind == xianscan_rust::ml::schemas::RegionKind::FreeText).count();
        assert_eq!(actual_bubbles, $exp_bubbles, "DialogueBubble count mismatch: got {}, expected {}", actual_bubbles, $exp_bubbles);
        assert_eq!(actual_sfx, $exp_sfx, "SoundEffect count mismatch: got {}, expected {}", actual_sfx, $exp_sfx);
        assert_eq!(actual_free, $exp_free, "FreeText count mismatch: got {}, expected {}", actual_free, $exp_free);
    }};
}

// -- FUNCTIONS & ALGORITHMS -- //

fn register_fixture_path(hash: String, path: PathBuf) {
    let mut lock = FIXTURE_PATH_MAP.lock().unwrap();
    let map = lock.get_or_insert_with(HashMap::new);
    map.insert(hash, path);
}

fn get_registered_fixture_path(hash: &str) -> Option<PathBuf> {
    let lock = FIXTURE_PATH_MAP.lock().unwrap();
    lock.as_ref()?.get(hash).cloned()
}

/// RESOLVES THE ROOT DIRECTORY FOR PRIVATE / TIER-2 REGRESSION DATASETS.
/// 1. CHECKS XIANSCAN_TEST_DATA_DIR ENVIRONMENT VARIABLE.
/// 2. FALLS BACK TO LOCAL GITIGNORED tests/fixtures/private DIRECTORY IF PRESENT.
#[allow(dead_code)]
pub fn get_dataset_dir() -> Option<PathBuf> {
    if let Ok(custom_path) = std::env::var("XIANSCAN_TEST_DATA_DIR") {
        let p = PathBuf::from(custom_path);
        if p.exists() {
            return Some(p);
        }
    }
    let local_private = Path::new("tests/fixtures/private");
    if local_private.exists() {
        return Some(local_private.to_path_buf());
    }
    None
}

/// RESOLVES THE PATH TO A SPECIFIC FIXTURE IMAGE ACROSS TIER-1 (COMMITTED) AND TIER-2 (LOCAL).
/// SUPPORTS BOTH:
/// 1. DEDICATED TEST CASE FOLDERS: `tests/fixtures/private/<lang>/<case_name>/page.webp`
/// 2. FLAT TEST CASE FILES: `tests/fixtures/private/<lang>/<case_name>.webp`
#[allow(dead_code)]
pub fn resolve_fixture_path(lang: &str, filename: &str) -> Option<PathBuf> {
    let stem = filename.strip_suffix(".webp").unwrap_or(filename);

    let check_base = |base: &Path| -> Option<PathBuf> {
        // A. CASE FOLDER IN SUB-LANGUAGE: <base>/<lang>/<stem>/page.webp
        let folder_sub = base.join(lang).join(stem);
        if folder_sub.is_dir() {
            for cand in &["page.webp", "original.webp", "source.webp", filename] {
                let p = folder_sub.join(cand);
                if p.exists() {
                    return Some(p);
                }
            }
        }

        // B. FLAT FILE IN SUB-LANGUAGE: <base>/<lang>/<filename>
        let p1 = base.join(lang).join(filename);
        if p1.exists() {
            return Some(p1);
        }

        // C. CASE FOLDER IN ROOT: <base>/<stem>/page.webp
        let folder_root = base.join(stem);
        if folder_root.is_dir() {
            for cand in &["page.webp", "original.webp", "source.webp", filename] {
                let p = folder_root.join(cand);
                if p.exists() {
                    return Some(p);
                }
            }
        }

        // D. FLAT FILE IN ROOT: <base>/<filename>
        let p2 = base.join(filename);
        if p2.exists() {
            return Some(p2);
        }

        None
    };

    // 1. CHECK PRIMARY TIER-1 / COMMITTED DIRECTORY
    if let Some(p) = check_base(Path::new("tests/fixtures")) {
        return Some(p);
    }

    // 2. CHECK TIER-2 PRIVATE DATASET DIRECTORY IF CONFIGURED
    if let Some(base) = get_dataset_dir() {
        if let Some(p) = check_base(&base) {
            return Some(p);
        }
    }

    None
}

/// ATTEMPTS TO LOAD A TEST FIXTURE IMAGE; RETURNS NONE IF RUNNING IN CLEAN CI WITHOUT LOCAL DATASET.
/// ALSO REGISTERS THE SOURCE FILE PATH SO ANNOTATED IMAGES CAN BE WRITTEN TO THE MATCHING LOCATION.
#[allow(dead_code)]
pub fn load_fixture_or_skip(lang: &str, filename: &str) -> Option<DynamicImage> {
    let resolved = resolve_fixture_path(lang, filename)?;

    let img = image::ImageReader::open(&resolved)
        .ok()?
        .with_guessed_format()
        .ok()?
        .decode()
        .ok()?;

    // REGISTER PATH KEYED BY IMAGE HASH
    let key = hash_image(&img);
    register_fixture_path(key, resolved);

    Some(img)
}

/// MACRO TO LOAD A FIXTURE OR GRACEFULLY SKIP THE TEST IF RUNNING IN CLEAN CI WITHOUT LOCAL MEDIA.
#[macro_export]
macro_rules! require_fixture {
    ($lang:expr, $filename:expr) => {
        match $crate::common::load_fixture_or_skip($lang, $filename) {
            Some(img) => img,
            None => {
                eprintln!("[INFO] Skipping test: fixture '{}/{}' not available in environment", $lang, $filename);
                return;
            }
        }
    };
}

/// GENERATES A CLEAN SYNTHETIC SPEECH BUBBLE TEST CANVAS FOR TIER-1 CI REGRESSION TESTS.
#[allow(dead_code)]
pub fn generate_synthetic_bubble_image(
    canvas_w: u32,
    canvas_h: u32,
    bubble_x: u32,
    bubble_y: u32,
    bubble_w: u32,
    bubble_h: u32,
) -> DynamicImage {
    let mut img = RgbaImage::from_pixel(canvas_w, canvas_h, Rgba([240, 240, 240, 255]));

    // DRAW ELLIPTICAL WHITE SPEECH BUBBLE WITH BLACK BORDER
    let center_x = bubble_x + bubble_w / 2;
    let center_y = bubble_y + bubble_h / 2;
    let rx = (bubble_w / 2) as f32;
    let ry = (bubble_h / 2) as f32;

    for y in bubble_y.saturating_sub(2)..=(bubble_y + bubble_h + 2).min(canvas_h - 1) {
        for x in bubble_x.saturating_sub(2)..=(bubble_x + bubble_w + 2).min(canvas_w - 1) {
            let dx = (x as f32 - center_x as f32) / rx;
            let dy = (y as f32 - center_y as f32) / ry;
            let dist_sq = dx * dx + dy * dy;

            if dist_sq <= 1.0 {
                // INNER WHITE FILL
                img.put_pixel(x, y, Rgba([255, 255, 255, 255]));
            } else if dist_sq <= 1.15 {
                // BLACK CONTOUR BORDER
                img.put_pixel(x, y, Rgba([20, 20, 20, 255]));
            }
        }
    }

    DynamicImage::ImageRgba8(img)
}

#[allow(dead_code)]
pub fn hash_image(img: &DynamicImage) -> String {
    let mut hasher = Sha256::new();
    hasher.update(&img.width().to_le_bytes());
    hasher.update(&img.height().to_le_bytes());
    hasher.update(img.as_bytes());
    hex::encode(hasher.finalize())
}

/// BLENDS A SEMI-TRANSPARENT POLYGON FILL OVER THE CANVAS VIA SCANLINE RASTERIZATION.
fn blend_filled_polygon(canvas: &mut RgbaImage, pts: &[(f32, f32)], fill: Rgba<u8>) {
    if pts.len() < 3 {
        return;
    }
    let (cw, ch) = (canvas.width() as i32, canvas.height() as i32);
    let min_y = pts.iter().map(|p| p.1).fold(f32::INFINITY, f32::min).floor() as i32;
    let max_y = pts.iter().map(|p| p.1).fold(f32::NEG_INFINITY, f32::max).ceil() as i32;

    let y0 = min_y.clamp(0, ch) as u32;
    let y1 = max_y.clamp(0, ch) as u32;

    let alpha = fill[3] as u32;
    let inv_alpha = 255 - alpha;
    let fr = fill[0] as u32 * alpha;
    let fg = fill[1] as u32 * alpha;
    let fb = fill[2] as u32 * alpha;

    let n = pts.len();
    let mut intersections = Vec::with_capacity(8);

    for py in y0..y1 {
        let scan_y = py as f32 + 0.5;
        intersections.clear();

        for i in 0..n {
            let p1 = pts[i];
            let p2 = pts[(i + 1) % n];

            if (p1.1 <= scan_y && p2.1 > scan_y) || (p2.1 <= scan_y && p1.1 > scan_y) {
                let t = (scan_y - p1.1) / (p2.1 - p1.1);
                let ix = p1.0 + t * (p2.0 - p1.0);
                intersections.push(ix);
            }
        }

        intersections.sort_by(|a, b| a.total_cmp(b));

        for chunk in intersections.chunks_exact(2) {
            let x_start = (chunk[0].floor() as i32).clamp(0, cw) as u32;
            let x_end = (chunk[1].ceil() as i32).clamp(0, cw) as u32;

            for px in x_start..x_end {
                let p = canvas.get_pixel_mut(px, py);
                let r = (p[0] as u32 * inv_alpha + fr) / 255;
                let g = (p[1] as u32 * inv_alpha + fg) / 255;
                let b = (p[2] as u32 * inv_alpha + fb) / 255;
                *p = Rgba([r as u8, g as u8, b as u8, 255]);
            }
        }
    }
}

/// BLENDS A SEMI-TRANSPARENT RECTANGLE FILL OVER THE CANVAS.
fn blend_filled_rect(canvas: &mut RgbaImage, x: i32, y: i32, w: u32, h: u32, fill: Rgba<u8>) {
    let (cw, ch) = (canvas.width() as i32, canvas.height() as i32);
    let x0 = x.clamp(0, cw) as u32;
    let y0 = y.clamp(0, ch) as u32;
    let x1 = (x + w as i32).clamp(0, cw) as u32;
    let y1 = (y + h as i32).clamp(0, ch) as u32;

    let alpha = fill[3] as u32;
    let inv_alpha = 255 - alpha;
    let fr = fill[0] as u32 * alpha;
    let fg = fill[1] as u32 * alpha;
    let fb = fill[2] as u32 * alpha;

    for py in y0..y1 {
        for px in x0..x1 {
            let p = canvas.get_pixel_mut(px, py);
            let r = (p[0] as u32 * inv_alpha + fr) / 255;
            let g = (p[1] as u32 * inv_alpha + fg) / 255;
            let b = (p[2] as u32 * inv_alpha + fb) / 255;
            *p = Rgba([r as u8, g as u8, b as u8, 255]);
        }
    }
}

/// DRAWS ANNOTATED PIPELINE REGIONS WITH MATCHING THEME STYLES (MATCHES WEB UI INSPECT MODAL).
pub fn render_annotated_image(img: &DynamicImage, res: &AnalyzeResponse) -> DynamicImage {
    let mut canvas = img.to_rgba8();
    let (width, height) = canvas.dimensions();

    // 1. RENDER DETECTED SPEECH BUBBLE CONTAINERS (CYAN SCANLINE-RASTERIZED POLYGON)
    for r in &res.regions {
        if let Some(b) = &r.bubble_box {
            let x = b.x.clamp(0, width.saturating_sub(1) as i32);
            let y = b.y.clamp(0, height.saturating_sub(1) as i32);
            let max_w = (width as i32 - x).max(1) as u32;
            let max_h = (height as i32 - y).max(1) as u32;
            let w = (b.w.max(1) as u32).min(max_w);
            let h = (b.h.max(1) as u32).min(max_h);

            blend_filled_rect(&mut canvas, x, y, w, h, Rgba([6, 182, 212, 45]));

            let rect = Rect::at(x, y).of_size(w, h);
            draw_hollow_rect_mut(&mut canvas, rect, Rgba([6, 182, 212, 200]));
        }
    }

    // 3. RENDER TEXT REGIONS (CINNABAR, PURPLE, AMBER)
    for r in &res.regions {
        let (stroke_color, fill_color) = match r.kind {
            RegionKind::DialogueBubble => (Rgba([178, 58, 46, 255]), Rgba([178, 58, 46, 50])),
            RegionKind::FreeText => (Rgba([139, 92, 246, 255]), Rgba([139, 92, 246, 50])),
            RegionKind::SoundEffect => (Rgba([245, 158, 11, 255]), Rgba([245, 158, 11, 50])),
        };

        if r.angle.abs() > 0.5 {
            let rad = r.angle.to_radians();
            let cx = r.box_.x as f32 + r.box_.w as f32 / 2.0;
            let cy = r.box_.y as f32 + r.box_.h as f32 / 2.0;
            let hw = r.box_.w as f32 / 2.0;
            let hh = r.box_.h as f32 / 2.0;

            let corners = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)];
            let rotated_pts: Vec<(f32, f32)> = corners
                .iter()
                .map(|&(dx, dy)| {
                    let rx = dx * rad.cos() - dy * rad.sin() + cx;
                    let ry = dx * rad.sin() + dy * rad.cos() + cy;
                    (rx, ry)
                })
                .collect();

            // 1. RASTERIZE FILLED ROTATED POLYGON
            blend_filled_polygon(&mut canvas, &rotated_pts, fill_color);

            // 2. DRAW 2PX ROTATED OUTLINE
            for idx in 0..4 {
                let p1 = rotated_pts[idx];
                let p2 = rotated_pts[(idx + 1) % 4];
                draw_line_segment_mut(&mut canvas, p1, p2, stroke_color);
            }
            if hw > 2.0 && hh > 2.0 {
                let inner_corners = [(-hw + 1.0, -hh + 1.0), (hw - 1.0, -hh + 1.0), (hw - 1.0, hh - 1.0), (-hw + 1.0, hh - 1.0)];
                let inner_pts: Vec<(f32, f32)> = inner_corners
                    .iter()
                    .map(|&(dx, dy)| {
                        let rx = dx * rad.cos() - dy * rad.sin() + cx;
                        let ry = dx * rad.sin() + dy * rad.cos() + cy;
                        (rx, ry)
                    })
                    .collect();
                for idx in 0..4 {
                    let p1 = inner_pts[idx];
                    let p2 = inner_pts[(idx + 1) % 4];
                    draw_line_segment_mut(&mut canvas, p1, p2, stroke_color);
                }
            }
        } else {
            let x = r.box_.x.clamp(0, width.saturating_sub(1) as i32);
            let y = r.box_.y.clamp(0, height.saturating_sub(1) as i32);
            let max_w = (width as i32 - x).max(1) as u32;
            let max_h = (height as i32 - y).max(1) as u32;
            let w = (r.box_.w.max(1) as u32).min(max_w);
            let h = (r.box_.h.max(1) as u32).min(max_h);

            blend_filled_rect(&mut canvas, x, y, w, h, fill_color);

            let rect = Rect::at(x, y).of_size(w, h);
            draw_hollow_rect_mut(&mut canvas, rect, stroke_color);

            if w > 2 && h > 2 {
                let inner_rect = Rect::at(x + 1, y + 1).of_size(w - 2, h - 2);
                draw_hollow_rect_mut(&mut canvas, inner_rect, stroke_color);
            }
        }
    }

    DynamicImage::ImageRgba8(canvas)
}

/// DRAWS RAW LAYOUT DETECTOR DETECTIONS (SEMI-TRANSPARENT OPACITY FILLS + 2PX OUTLINES).
/// - RAW SPEECH BUBBLES: CYAN (#06b6d4)
/// - RAW TEXT IN BUBBLES: CINNABAR (#b23a2e)
/// - RAW FREE TEXT: PURPLE (#8b5cf6)
/// - RAW ONOMATOPOEIA / SFX: AMBER (#f59e0b)
pub fn render_layout_detector_image(img: &DynamicImage, fusion: &xianscan_rust::pipeline::fusion::DetectionFusionResult) -> DynamicImage {
    let mut canvas = img.to_rgba8();
    let (width, height) = (canvas.width(), canvas.height());

    // 1. RAW SPEECH/THOUGHT BUBBLES (CYAN)
    for b in &fusion.bubbles {
        let x = b.x.clamp(0, width.saturating_sub(1) as i32);
        let y = b.y.clamp(0, height.saturating_sub(1) as i32);
        let max_w = (width as i32 - x).max(1) as u32;
        let max_h = (height as i32 - y).max(1) as u32;
        let w = (b.w.max(1) as u32).min(max_w);
        let h = (b.h.max(1) as u32).min(max_h);

        blend_filled_rect(&mut canvas, x, y, w, h, Rgba([6, 182, 212, 45]));

        let rect = Rect::at(x, y).of_size(w, h);
        draw_hollow_rect_mut(&mut canvas, rect, Rgba([6, 182, 212, 200]));
    }

    // 2. RAW TEXT BUBBLE BOXES (CINNABAR)
    for (tb, _) in &fusion.text_bubbles {
        let x = tb.x.clamp(0, width.saturating_sub(1) as i32);
        let y = tb.y.clamp(0, height.saturating_sub(1) as i32);
        let max_w = (width as i32 - x).max(1) as u32;
        let max_h = (height as i32 - y).max(1) as u32;
        let w = (tb.w.max(1) as u32).min(max_w);
        let h = (tb.h.max(1) as u32).min(max_h);

        blend_filled_rect(&mut canvas, x, y, w, h, Rgba([178, 58, 46, 50]));

        let rect = Rect::at(x, y).of_size(w, h);
        draw_hollow_rect_mut(&mut canvas, rect, Rgba([178, 58, 46, 255]));
    }

    // 3. RAW FREE TEXT BOXES (PURPLE)
    for (tf, _) in &fusion.text_free {
        let x = tf.x.clamp(0, width.saturating_sub(1) as i32);
        let y = tf.y.clamp(0, height.saturating_sub(1) as i32);
        let max_w = (width as i32 - x).max(1) as u32;
        let max_h = (height as i32 - y).max(1) as u32;
        let w = (tf.w.max(1) as u32).min(max_w);
        let h = (tf.h.max(1) as u32).min(max_h);

        blend_filled_rect(&mut canvas, x, y, w, h, Rgba([139, 92, 246, 50]));

        let rect = Rect::at(x, y).of_size(w, h);
        draw_hollow_rect_mut(&mut canvas, rect, Rgba([139, 92, 246, 255]));
    }

    // 4. RAW ONOMATOPOEIA / SFX BOXES (AMBER)
    for (sfx, _) in &fusion.onomatopoeia {
        let x = sfx.x.clamp(0, width.saturating_sub(1) as i32);
        let y = sfx.y.clamp(0, height.saturating_sub(1) as i32);
        let max_w = (width as i32 - x).max(1) as u32;
        let max_h = (height as i32 - y).max(1) as u32;
        let w = (sfx.w.max(1) as u32).min(max_w);
        let h = (sfx.h.max(1) as u32).min(max_h);

        blend_filled_rect(&mut canvas, x, y, w, h, Rgba([245, 158, 11, 50]));

        let rect = Rect::at(x, y).of_size(w, h);
        draw_hollow_rect_mut(&mut canvas, rect, Rgba([245, 158, 11, 255]));
    }

    // 5. RAW DBNET / OCR POLYGONS (IF DETECTOR PRODUCED BOXES)
    for cb in &fusion.comic_boxes {
        if cb.len() >= 3 {
            for i in 0..cb.len() {
                let p1 = (cb[i][0] as f32, cb[i][1] as f32);
                let p2 = (cb[(i + 1) % cb.len()][0] as f32, cb[(i + 1) % cb.len()][1] as f32);
                draw_line_segment_mut(&mut canvas, p1, p2, Rgba([245, 158, 11, 180]));
            }
        }
    }

    DynamicImage::ImageRgba8(canvas)
}

/// DRAWS RAW OCR LINES (EMERALD POLYGONS).
pub fn render_ocr_detector_image(img: &DynamicImage, lines: &[xianscan_rust::ml::ocr::OcrLine]) -> DynamicImage {
    let mut canvas = img.to_rgba8();
    for l in lines {
        if l.polygon.len() >= 3 {
            for i in 0..l.polygon.len() {
                let p1 = (l.polygon[i][0] as f32, l.polygon[i][1] as f32);
                let p2 = (l.polygon[(i + 1) % l.polygon.len()][0] as f32, l.polygon[(i + 1) % l.polygon.len()][1] as f32);
                draw_line_segment_mut(&mut canvas, p1, p2, Rgba([16, 185, 129, 230]));
            }
        }
    }
    DynamicImage::ImageRgba8(canvas)
}

#[allow(dead_code)]
pub struct FixturePaths {
    pub case_folder: PathBuf,
    pub page: PathBuf,
    pub layout_img: PathBuf,
    pub layout_json: PathBuf,
    pub ocr_img: PathBuf,
    pub ocr_json: PathBuf,
    pub annotated_img: PathBuf,
    pub prev_annotated_img: PathBuf,
    pub annotated_json: PathBuf,
    pub prev_annotated_json: PathBuf,
}

/// STRUCTURAL CONTAINER HELPER TO LOCATE TARGET DESTINATION FOLDER FOR A FIXTURE.
pub fn get_fixture_output_paths(src_path: &Path) -> FixturePaths {
    let parent = src_path.parent().unwrap_or_else(|| Path::new("."));
    let filename = src_path.file_name().and_then(|n| n.to_str()).unwrap_or("image.webp");

    let case_folder = if filename == "page.webp" || filename == "original.webp" || filename == "source.webp" {
        parent.to_path_buf()
    } else {
        let stem = filename.strip_suffix(".webp").unwrap_or(filename);
        let folder = parent.join(stem);
        if !folder.exists() {
            let _ = std::fs::create_dir_all(&folder);
        }
        let canonical_src = folder.join("page.webp");
        if !canonical_src.exists() && src_path.exists() {
            let _ = std::fs::copy(src_path, &canonical_src);
        }
        folder
    };

    FixturePaths {
        page: case_folder.join("page.webp"),
        layout_img: case_folder.join("layout.webp"),
        layout_json: case_folder.join("layout_debug.json"),
        ocr_img: case_folder.join("ocr.webp"),
        ocr_json: case_folder.join("ocr_debug.json"),
        annotated_img: case_folder.join("annotated.webp"),
        prev_annotated_img: case_folder.join("prev_annotated.webp"),
        annotated_json: case_folder.join("annotated_debug.json"),
        prev_annotated_json: case_folder.join("prev_annotated_debug.json"),
        case_folder,
    }
}

/// SAVES THE ANNOTATED RENDERING AND ACCURATE DEBUG METADATA JSON INSIDE THE TEST CASE FOLDER WITH HISTORY ROTATION.
pub fn save_annotated_fixture(img: &DynamicImage, res: &AnalyzeResponse) {
    let key = hash_image(img);
    if let Some(src_path) = get_registered_fixture_path(&key) {
        let paths = get_fixture_output_paths(&src_path);

        // ROTATE EXISTING ANNOTATED FILES TO PREV FOR VISUAL AND METADATA DIFFING
        if paths.annotated_img.exists() {
            let _ = std::fs::copy(&paths.annotated_img, &paths.prev_annotated_img);
        }
        if paths.annotated_json.exists() {
            let _ = std::fs::copy(&paths.annotated_json, &paths.prev_annotated_json);
        }

        // 1. SAVE ANNOTATED GRAPHIC
        let annotated_img = render_annotated_image(img, res);
        let _ = annotated_img.save_with_format(&paths.annotated_img, image::ImageFormat::WebP);

        // 2. SAVE ACCURATE COORDINATES, LABELS, AND TEXT METADATA FOR DEBUGGING
        #[derive(Serialize)]
        struct AnnotatedDebugReport<'a> {
            image_dimensions: (u32, u32),
            total_regions: usize,
            regions: &'a [xianscan_rust::ml::schemas::Region],
        }

        let report = AnnotatedDebugReport {
            image_dimensions: (img.width(), img.height()),
            total_regions: res.regions.len(),
            regions: &res.regions,
        };

        if let Ok(json_str) = serde_json::to_string_pretty(&report) {
            let _ = std::fs::write(&paths.annotated_json, json_str);
        }
    }
}

/// SAVES THE RAW LAYOUT DETECTOR RENDERING AND DEBUG METADATA JSON INSIDE THE TEST CASE FOLDER.
pub fn save_layout_fixture(img: &DynamicImage, fusion: &xianscan_rust::pipeline::fusion::DetectionFusionResult) {
    let key = hash_image(img);
    if let Some(src_path) = get_registered_fixture_path(&key) {
        let paths = get_fixture_output_paths(&src_path);

        let layout_img = render_layout_detector_image(img, fusion);
        let _ = layout_img.save_with_format(&paths.layout_img, image::ImageFormat::WebP);

        #[derive(Serialize)]
        struct LayoutDebugReport<'a> {
            image_dimensions: (u32, u32),
            backend: &'a str,
            panels: &'a [BoxRect],
            bubbles: &'a [BoxRect],
            text_bubbles: &'a [(BoxRect, f32)],
            text_free: &'a [(BoxRect, f32)],
            onomatopoeia: &'a [(BoxRect, f32)],
            comic_boxes: &'a [Vec<[i32; 2]>],
        }

        let report = LayoutDebugReport {
            image_dimensions: (img.width(), img.height()),
            backend: &fusion.backend,
            panels: &fusion.panels,
            bubbles: &fusion.bubbles,
            text_bubbles: &fusion.text_bubbles,
            text_free: &fusion.text_free,
            onomatopoeia: &fusion.onomatopoeia,
            comic_boxes: &fusion.comic_boxes,
        };

        if let Ok(json_str) = serde_json::to_string_pretty(&report) {
            let _ = std::fs::write(&paths.layout_json, json_str);
        }
    }
}

/// SAVES THE RAW OCR DETECTOR RENDERING AND DEBUG METADATA JSON INSIDE THE TEST CASE FOLDER.
pub fn save_ocr_fixture(img: &DynamicImage, lines: &[xianscan_rust::ml::ocr::OcrLine]) {
    let key = hash_image(img);
    if let Some(src_path) = get_registered_fixture_path(&key) {
        let paths = get_fixture_output_paths(&src_path);

        let ocr_img = render_ocr_detector_image(img, lines);
        let _ = ocr_img.save_with_format(&paths.ocr_img, image::ImageFormat::WebP);

        #[derive(Serialize)]
        struct OcrDebugReport<'a> {
            image_dimensions: (u32, u32),
            lines: &'a [xianscan_rust::ml::ocr::OcrLine],
        }

        let report = OcrDebugReport {
            image_dimensions: (img.width(), img.height()),
            lines,
        };

        if let Ok(json_str) = serde_json::to_string_pretty(&report) {
            let _ = std::fs::write(&paths.ocr_json, json_str);
        }
    }
}

/// ENSURES RAW LAYOUT AND OCR DETECTIONS ARE GENERATED AND SAVED IF NOT ALREADY PRESENT ON DISK.
pub fn get_or_run_layout_detector_with_lang(
    img: &DynamicImage,
    source_lang: Option<&str>,
) {
    let key = hash_image(img);

    // CHECK FOLDER-LEVEL layout_debug.json AND ocr_debug.json FIRST (INSTANT RETURN, 0 INFERENCE)
    if let Some(src_path) = get_registered_fixture_path(&key) {
        let paths = get_fixture_output_paths(&src_path);
        if paths.layout_json.exists() && paths.ocr_json.exists() {
            return;
        }
    }

    let models_dir = Path::new("models");
    let mut engine = PipelineEngine::new(models_dir);
    let fusion = xianscan_rust::pipeline::fusion::fuse_detections(
        &mut engine.detector,
        &mut engine.ocr,
        &engine.watermark,
        img,
        source_lang,
        false,
        false,
    )
    .expect("fuse_detections failed");

    save_layout_fixture(img, &fusion);
    save_ocr_fixture(img, &fusion.rapid_lines);
}

/// HELPER THAT EXECUTES PIPELINE ANALYSIS INSTANTLY FROM GROUND-TRUTH FIXTURE JSONs.
#[allow(dead_code)]
pub fn get_or_analyze_fixture(img: &DynamicImage) -> AnalyzeResponse {
    get_or_analyze_fixture_with_lang(img, None)
}

/// LANGUAGE-AWARE HELPER THAT LOADS OR DETECTS LAYOUT & OCR FROM DEDICATED FIXTURE JSONs BEFORE RUNNING PIPELINE POSTPROCESSING.
#[allow(dead_code)]
pub fn get_or_analyze_fixture_with_lang(
    img: &DynamicImage,
    source_lang: Option<&str>,
) -> AnalyzeResponse {
    // 1. GENERATE RAW LAYOUT & OCR DETECTIONS IF NOT ALREADY SAVED ON DISK
    get_or_run_layout_detector_with_lang(img, source_lang);

    let key = hash_image(img);
    let models_dir = Path::new("models");
    let mut engine = PipelineEngine::new(models_dir);
    let opts = AnalyzeOptions {
        source_lang: source_lang.map(|l| l.to_string()),
        target_lang: Some("en".to_string()),
        enable_sfx: Some(true),
        enable_watermark_inpaint: Some(false),
        inpaint_padding_pct: Some(0.06),
        typeset_padding_pct: Some(0.12),
        ..Default::default()
    };

    // FAST-PATH: LOAD RAW LAYOUT & OCR DIRECTLY FROM CASE FOLDER (<0.05s EXECUTION)
    let mut fusion_opt: Option<xianscan_rust::pipeline::fusion::DetectionFusionResult> = None;

    if let Some(src_path) = get_registered_fixture_path(&key) {
        let paths = get_fixture_output_paths(&src_path);
        if paths.layout_json.exists() && paths.ocr_json.exists() {
            #[derive(serde::Deserialize)]
            struct FolderLayoutReport {
                backend: String,
                panels: Vec<BoxRect>,
                bubbles: Vec<BoxRect>,
                text_bubbles: Vec<(BoxRect, f32)>,
                text_free: Vec<(BoxRect, f32)>,
                onomatopoeia: Vec<(BoxRect, f32)>,
                comic_boxes: Vec<Vec<[i32; 2]>>,
            }
            #[derive(serde::Deserialize)]
            struct FolderOcrReport {
                lines: Vec<xianscan_rust::ml::ocr::OcrLine>,
            }
            if let (Ok(layout_str), Ok(ocr_str)) = (std::fs::read_to_string(&paths.layout_json), std::fs::read_to_string(&paths.ocr_json)) {
                if let (Ok(l_rep), Ok(o_rep)) = (serde_json::from_str::<FolderLayoutReport>(&layout_str), serde_json::from_str::<FolderOcrReport>(&ocr_str)) {
                    let (page_w, page_h) = (img.width(), img.height());
                    let filtered_onomatopoeia: Vec<(BoxRect, f32)> = l_rep.onomatopoeia
                        .into_iter()
                        .filter(|(sfx_b, score)| {
                            let s_mid_x = sfx_b.x + sfx_b.w / 2;
                            let s_mid_y = sfx_b.y + sfx_b.h / 2;
                            let inside_bubble = l_rep.bubbles.iter().any(|b| {
                                s_mid_x >= b.x && s_mid_x <= b.x + b.w && s_mid_y >= b.y && s_mid_y <= b.y + b.h
                            });
                            if inside_bubble {
                                return false;
                            }
                            if *score < 0.25 {
                                return false;
                            }
                            if *score < 0.40 && (sfx_b.w >= 200 && sfx_b.h >= 400) {
                                return false;
                            }
                            let is_sentence = (sfx_b.w as f32 / sfx_b.h.max(1) as f32 >= 2.5) || sfx_b.h <= 35;
                            let is_oversized = (sfx_b.w as f32 >= (page_w as f32) * 0.65 && sfx_b.h >= 120)
                                || ((sfx_b.h as f32 >= (page_h as f32) * 0.35) && !is_sentence && sfx_b.w >= 200)
                                || ((sfx_b.h as f32 >= (page_h as f32) * 0.40) && !is_sentence);
                            !is_oversized
                        })
                        .collect();

                    fusion_opt = Some(xianscan_rust::pipeline::fusion::DetectionFusionResult {
                        comic_boxes: l_rep.comic_boxes,
                        comic_scores: vec![],
                        panels: l_rep.panels,
                        bubbles: l_rep.bubbles,
                        onomatopoeia: filtered_onomatopoeia,
                        text_bubbles: l_rep.text_bubbles,
                        text_free: l_rep.text_free,
                        rapid_lines: o_rep.lines,
                        backend: l_rep.backend,
                        detector_time_ms: 0.0,
                        ocr_fullpage_time_ms: 0.0,
                        rescue_time_ms: 0.0,
                        watermark_time_ms: 0.0,
                        raw_ocr_lines_count: 0,
                        rescued_crops_count: 0,
                        watermark_recovered_count: 0,
                    });
                }
            }
        }
    }

    let res = if let Some(fusion) = fusion_opt {
        xianscan_rust::pipeline::analyzer::analyze_image_with_fusion(&mut engine, img, &fusion, Some(&opts))
            .expect("Pipeline analyze_image_with_fusion failed")
    } else {
        engine
            .analyze_image_with_options(img, Some(&opts))
            .expect("Pipeline analyze_image failed")
    };

    save_annotated_fixture(img, &res);
    res
}

/// BYPASSES SAVED LAYOUT AND RUNS LIVE INFERENCE, UPDATING FIXTURE JSONs AND IMAGES.
#[allow(dead_code)]
pub fn force_analyze_fixture_with_lang(
    img: &DynamicImage,
    source_lang: Option<&str>,
) -> AnalyzeResponse {
    let models_dir = Path::new("models");
    let mut engine = PipelineEngine::new(models_dir);
    let opts = AnalyzeOptions {
        source_lang: source_lang.map(|l| l.to_string()),
        target_lang: Some("en".to_string()),
        enable_sfx: Some(true),
        enable_watermark_inpaint: Some(false),
        inpaint_padding_pct: Some(0.06),
        typeset_padding_pct: Some(0.12),
        ..Default::default()
    };

    let fusion = xianscan_rust::pipeline::fusion::fuse_detections(
        &mut engine.detector,
        &mut engine.ocr,
        &engine.watermark,
        img,
        source_lang,
        false,
        false,
    )
    .expect("fuse_detections failed");

    save_layout_fixture(img, &fusion);
    save_ocr_fixture(img, &fusion.rapid_lines);

    let res = xianscan_rust::pipeline::analyzer::analyze_image_with_fusion(&mut engine, img, &fusion, Some(&opts))
        .expect("Pipeline analyze_image_with_fusion failed");

    save_annotated_fixture(img, &res);
    res
}

/// BYPASSES SAVED LAYOUT AND RUNS LIVE INFERENCE.
#[allow(dead_code)]
pub fn force_analyze_fixture(img: &DynamicImage) -> AnalyzeResponse {
    force_analyze_fixture_with_lang(img, None)
}
