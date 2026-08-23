// -- CRATE / EXTERNAL IMPORTS -- //
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, Once};
use image::{DynamicImage, Rgba, RgbaImage};
use imageproc::drawing::{draw_hollow_rect_mut, draw_line_segment_mut};
use imageproc::rect::Rect;
use serde::{de::DeserializeOwned, Serialize};
use sha2::{Digest, Sha256};

// -- INTERNAL IMPORTS -- //
use xianscan_rust::ml::schemas::{AnalyzeOptions, AnalyzeResponse, BoxRect, RegionKind};
use xianscan_rust::pipeline::PipelineEngine;

// -- CONSTANTS -- //

/// INCREMENT THIS WHEN A PIPELINE CHANGE ALTERS ANALYZE_IMAGE OUTPUT.
/// CHANGING THIS VALUE INVALIDATES ALL EXISTING CACHE ENTRIES AUTOMATICALLY
/// (OLD HASHES BECOME UNREACHABLE) WITHOUT DELETING ANY FILES.
/// v33: UNIFY CANDIDATE CONTAINER ENVELOPE TO RESTORE FULL BOUNDARIES.
#[allow(dead_code)]
const CACHE_VERSION: u8 = 33;

/// BASE DETECTOR CACHE VERSION (LAYOUT MODEL RF-DETR).
/// ONLY INCREMENT IF THE PRIMARY DETECTOR ONNX MODEL ITSELF IS REPLACED.
#[allow(dead_code)]
const BASE_CACHE_VERSION: u8 = 1;

// GLOBAL REGISTRY TO MAP IMAGE HASHES TO SOURCE FIXTURE FILE PATHS
static FIXTURE_PATH_MAP: Mutex<Option<HashMap<String, PathBuf>>> = Mutex::new(None);

// ONCE INITIALIZER TO CLEAN ALL EXISTING ANNOTATED FILES BEFORE RUNNING TESTS
static CLEANUP_ONCE: Once = Once::new();

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

///// PURGES ONLY GENERATED `annotated*` ARTIFACTS BEFORE RUNNING TESTS (PRESERVING `base.webp` AND `base_debug.json`).
fn clean_existing_annotated_fixtures() {
    let mut dirs_to_clean = vec![PathBuf::from("tests/fixtures")];
    if let Some(dataset_dir) = get_dataset_dir() {
        if !dirs_to_clean.contains(&dataset_dir) {
            dirs_to_clean.push(dataset_dir);
        }
    }

    for dir in dirs_to_clean {
        if !dir.exists() {
            continue;
        }
        clean_annotated_in_dir(&dir);
    }
}

fn clean_annotated_in_dir(dir: &Path) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                // CLEAN ONLY ANNOTATED COMPANION ARTIFACTS INSIDE FOLDERS (PRESERVE BASE REFERENCE ASSETS)
                let ann_img = path.join("annotated.webp");
                let ann_json = path.join("annotated_debug.json");
                let _ = std::fs::remove_file(ann_img);
                let _ = std::fs::remove_file(ann_json);

                clean_annotated_in_dir(&path);
            } else if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if file_name.starts_with("annotated_")
                    || file_name == "annotated.webp"
                    || file_name == "annotated_debug.json"
                {
                    let _ = std::fs::remove_file(&path);
                }
            }
        }
    }
}

#[allow(dead_code)]
pub fn ensure_cache_dir() -> PathBuf {
    let dir = Path::new("tests/.cache");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(dir);
    }
    dir.to_path_buf()
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

    // 1. CHECK PRIMARY COMMITTED / STANDARD PATH
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
    // RUN ONCE: CLEAN ALL EXISTING ANNOTATED_* AND BASE_* FILES BEFORE EXECUTING TESTS
    CLEANUP_ONCE.call_once(|| {
        clean_existing_annotated_fixtures();
    });

    let resolved = resolve_fixture_path(lang, filename)?;
    let img = image::ImageReader::open(&resolved)
        .ok()?
        .with_guessed_format()
        .ok()?
        .decode()
        .ok()?;

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

#[allow(dead_code)]
pub fn is_cache_disabled() -> bool {
    std::env::var("TEST_NO_MODEL_CACHE")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

#[allow(dead_code)]
pub fn read_cache<T: DeserializeOwned>(category: &str, key: &str) -> Option<T> {
    if is_cache_disabled() {
        return None;
    }
    let path = ensure_cache_dir().join(format!("v{}_{}_{}.json", CACHE_VERSION, category, key));
    if !path.exists() {
        return None;
    }
    let data = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&data).ok()
}

#[allow(dead_code)]
pub fn write_cache<T: Serialize>(category: &str, key: &str, val: &T) {
    if is_cache_disabled() {
        return;
    }
    let path = ensure_cache_dir().join(format!("v{}_{}_{}.json", CACHE_VERSION, category, key));
    if let Ok(json_str) = serde_json::to_string(val) {
        let _ = std::fs::write(path, json_str);
    }
}

#[allow(dead_code)]
pub fn read_base_cache<T: DeserializeOwned>(category: &str, key: &str) -> Option<T> {
    if is_cache_disabled() {
        return None;
    }
    let path = ensure_cache_dir().join(format!("base_v{}_{}_{}.json", BASE_CACHE_VERSION, category, key));
    if !path.exists() {
        return None;
    }
    let data = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&data).ok()
}

#[allow(dead_code)]
pub fn write_base_cache<T: Serialize>(category: &str, key: &str, val: &T) {
    if is_cache_disabled() {
        return;
    }
    let path = ensure_cache_dir().join(format!("base_v{}_{}_{}.json", BASE_CACHE_VERSION, category, key));
    if let Ok(json_str) = serde_json::to_string(val) {
        let _ = std::fs::write(path, json_str);
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
            *p = Rgba([r as u8, g as u8, b as u8, p[3]]);
        }
    }
}

/// BLENDS A SEMI-TRANSPARENT POLYGON FILL OVER THE CANVAS USING SCANLINE RASTERIZATION.
fn blend_filled_polygon(canvas: &mut RgbaImage, poly: &[[i32; 2]], fill: Rgba<u8>) {
    if poly.len() < 3 {
        return;
    }
    let (cw, ch) = (canvas.width() as i32, canvas.height() as i32);
    let min_y = poly.iter().map(|p| p[1]).min().unwrap_or(0).clamp(0, ch - 1);
    let max_y = poly.iter().map(|p| p[1]).max().unwrap_or(0).clamp(0, ch - 1);

    let alpha = fill[3] as u32;
    let inv_alpha = 255 - alpha;
    let fr = fill[0] as u32 * alpha;
    let fg = fill[1] as u32 * alpha;
    let fb = fill[2] as u32 * alpha;

    for y in min_y..=max_y {
        let mut nodes = Vec::new();
        let n = poly.len();
        for i in 0..n {
            let p1 = poly[i];
            let p2 = poly[(i + 1) % n];
            if (p1[1] <= y && p2[1] > y) || (p2[1] <= y && p1[1] > y) {
                let x = p1[0] + ((y - p1[1]) as f32 / (p2[1] - p1[1]) as f32 * (p2[0] - p1[0]) as f32).round() as i32;
                nodes.push(x);
            }
        }
        nodes.sort_unstable();
        for chunk in nodes.chunks_exact(2) {
            let x_start = chunk[0].clamp(0, cw - 1) as u32;
            let x_end = chunk[1].clamp(0, cw - 1) as u32;
            for px in x_start..=x_end {
                let p = canvas.get_pixel_mut(px, y as u32);
                let r = (p[0] as u32 * inv_alpha + fr) / 255;
                let g = (p[1] as u32 * inv_alpha + fg) / 255;
                let b = (p[2] as u32 * inv_alpha + fb) / 255;
                *p = Rgba([r as u8, g as u8, b as u8, p[3]]);
            }
        }
    }
}

/// DRAWS BOUNDING BOX RECTANGLES (WITH OPACITY FILL AND OUTLINES, PRESERVING BACKGROUND).
pub fn render_annotated_image(img: &DynamicImage, res: &AnalyzeResponse) -> DynamicImage {
    let mut canvas = img.to_rgba8();
    let (width, height) = (canvas.width(), canvas.height());

    // 1. DRAW SPEECH & THOUGHT BUBBLE CONTOURS / POLYGONS (CYAN #06b6d4, ~20% OPACITY FILL)
    for r in &res.regions {
        if let Some(bubble_poly) = &r.bubble_polygon {
            if bubble_poly.len() >= 3 {
                // SEMI-TRANSPARENT SCANLINE POLYGON FILL
                blend_filled_polygon(&mut canvas, bubble_poly, Rgba([6, 182, 212, 50]));

                for i in 0..bubble_poly.len() {
                    let p1 = (bubble_poly[i][0] as f32, bubble_poly[i][1] as f32);
                    let p2 = (bubble_poly[(i + 1) % bubble_poly.len()][0] as f32, bubble_poly[(i + 1) % bubble_poly.len()][1] as f32);
                    draw_line_segment_mut(&mut canvas, p1, p2, Rgba([6, 182, 212, 220]));
                }
            }
        } else if let Some(bb) = &r.bubble_box {
            let x = bb.x.clamp(0, width.saturating_sub(1) as i32);
            let y = bb.y.clamp(0, height.saturating_sub(1) as i32);
            let max_w = (width as i32 - x).max(1) as u32;
            let max_h = (height as i32 - y).max(1) as u32;
            let w = (bb.w.max(1) as u32).min(max_w);
            let h = (bb.h.max(1) as u32).min(max_h);

            // SEMI-TRANSPARENT CYAN FILL (~20% OPACITY)
            blend_filled_rect(&mut canvas, x, y, w, h, Rgba([6, 182, 212, 50]));

            let rect = Rect::at(x, y).of_size(w, h);
            draw_hollow_rect_mut(&mut canvas, rect, Rgba([6, 182, 212, 200]));
        }
    }

    // 2. DRAW DETECTED COMIC PANELS (LIGHT BLUE HOLLOW RECTANGLE)
    for panel in &res.panels {
        let x = panel.box_.x.clamp(0, width.saturating_sub(1) as i32);
        let y = panel.box_.y.clamp(0, height.saturating_sub(1) as i32);
        let max_w = (width as i32 - x).max(1) as u32;
        let max_h = (height as i32 - y).max(1) as u32;
        let w = (panel.box_.w.max(1) as u32).min(max_w);
        let h = (panel.box_.h.max(1) as u32).min(max_h);

        // LIGHT BLUE PANEL FILL (~10% OPACITY)
        blend_filled_rect(&mut canvas, x, y, w, h, Rgba([80, 160, 255, 25]));

        let rect = Rect::at(x, y).of_size(w, h);
        draw_hollow_rect_mut(&mut canvas, rect, Rgba([80, 160, 255, 200]));
    }

    // 3. DRAW REGION BOUNDING BOXES (COLOR-CODED WITH SEMI-TRANSPARENT OPACITY FILL)
    // - DIALOGUE BUBBLE: CINNABAR (#b23a2e -> [178, 58, 46])
    // - SFX / ONOMATOPOEIA: AMBER (#f59e0b -> [245, 158, 11])
    // - FREE TEXT: PURPLE (#8b5cf6 -> [139, 92, 246])
    for r in &res.regions {
        let (stroke_color, fill_color) = match r.kind {
            RegionKind::DialogueBubble => (Rgba([178, 58, 46, 255]), Rgba([178, 58, 46, 50])),
            RegionKind::SoundEffect => (Rgba([245, 158, 11, 255]), Rgba([245, 158, 11, 50])),
            RegionKind::FreeText => (Rgba([139, 92, 246, 255]), Rgba([139, 92, 246, 50])),
        };

        let bx = r.box_.x as f32;
        let by = r.box_.y as f32;
        let bw = r.box_.w.max(1) as f32;
        let bh = r.box_.h.max(1) as f32;

        if r.angle.abs() > 0.5 {
            // COMPUTE ROTATED CORNERS AROUND BOX CENTER
            let cx = bx + bw / 2.0;
            let cy = by + bh / 2.0;
            let rad = r.angle.to_radians();
            let (sin_a, cos_a) = (rad.sin(), rad.cos());

            let half_w = bw / 2.0;
            let half_h = bh / 2.0;
            let local_corners = [
                (-half_w, -half_h),
                (half_w, -half_h),
                (half_w, half_h),
                (-half_w, half_h),
            ];

            let rotated_pts: Vec<(f32, f32)> = local_corners
                .iter()
                .map(|&(lx, ly)| {
                    let rx = cx + lx * cos_a - ly * sin_a;
                    let ry = cy + lx * sin_a + ly * cos_a;
                    (rx, ry)
                })
                .collect();

            // DRAW 2PX ROTATED CONTOUR
            for idx in 0..4 {
                let p1 = rotated_pts[idx];
                let p2 = rotated_pts[(idx + 1) % 4];
                draw_line_segment_mut(&mut canvas, p1, p2, stroke_color);
            }
        } else {
            // UNROTATED AXIS-ALIGNED BOX
            let x = r.box_.x.clamp(0, width.saturating_sub(1) as i32);
            let y = r.box_.y.clamp(0, height.saturating_sub(1) as i32);
            let max_w = (width as i32 - x).max(1) as u32;
            let max_h = (height as i32 - y).max(1) as u32;
            let w = (r.box_.w.max(1) as u32).min(max_w);
            let h = (r.box_.h.max(1) as u32).min(max_h);

            // SEMI-TRANSPARENT OPACITY FILL (~20%)
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

/// DRAWS RAW BASE DETECTOR DETECTIONS (SEMI-TRANSPARENT OPACITY FILLS + 2PX OUTLINES).
/// - RAW SPEECH BUBBLES: CYAN (#06b6d4)
/// - RAW TEXT IN BUBBLES: CINNABAR (#b23a2e)
/// - RAW FREE TEXT: PURPLE (#8b5cf6)
/// - RAW ONOMATOPOEIA / SFX: AMBER (#f59e0b)
pub fn render_base_detector_image(img: &DynamicImage, fusion: &xianscan_rust::pipeline::fusion::DetectionFusionResult) -> DynamicImage {
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

/// STRUCTURAL CONTAINER HELPER TO LOCATE TARGET DESTINATION FOLDER FOR A FIXTURE.
fn get_fixture_output_paths(src_path: &Path) -> (PathBuf, PathBuf, PathBuf, PathBuf) {
    let parent = src_path.parent().unwrap_or_else(|| Path::new("."));
    let filename = src_path.file_name().and_then(|n| n.to_str()).unwrap_or("image.webp");

    // IF THE FIXTURE IS ALREADY INSIDE A DEDICATED CASE FOLDER
    if filename == "page.webp" || filename == "original.webp" || filename == "source.webp" {
        (
            parent.join("annotated.webp"),
            parent.join("annotated_debug.json"),
            parent.join("base.webp"),
            parent.join("base_debug.json"),
        )
    } else {
        // IF THE FIXTURE IS A FLAT WEBP FILE, CREATE/USE A DEDICATED CASE FOLDER: <parent>/<stem>/
        let stem = filename.strip_suffix(".webp").unwrap_or(filename);
        let case_folder = parent.join(stem);
        if !case_folder.exists() {
            let _ = std::fs::create_dir_all(&case_folder);
        }

        // COPY SOURCE FILE TO case_folder/page.webp IF NOT PRESENT
        let canonical_src = case_folder.join("page.webp");
        if !canonical_src.exists() && src_path.exists() {
            let _ = std::fs::copy(src_path, &canonical_src);
        }

        (
            case_folder.join("annotated.webp"),
            case_folder.join("annotated_debug.json"),
            case_folder.join("base.webp"),
            case_folder.join("base_debug.json"),
        )
    }
}

/// SAVES THE ANNOTATED RENDERING AND ACCURATE DEBUG METADATA JSON INSIDE THE TEST CASE FOLDER.
pub fn save_annotated_fixture(img: &DynamicImage, res: &AnalyzeResponse) {
    let key = hash_image(img);
    if let Some(src_path) = get_registered_fixture_path(&key) {
        let (ann_img_path, ann_json_path, _, _) = get_fixture_output_paths(&src_path);

        // 1. SAVE ANNOTATED GRAPHIC
        let annotated_img = render_annotated_image(img, res);
        let _ = annotated_img.save_with_format(&ann_img_path, image::ImageFormat::WebP);

        // 2. SAVE ACCURATE COORDINATES, LABELS, AND TEXT METADATA FOR DEBUGGING
        #[derive(Serialize)]
        struct AnnotatedDebugReport<'a> {
            image_dimensions: (u32, u32),
            total_regions: usize,
            panels: &'a [xianscan_rust::ml::schemas::PanelFrame],
            regions: &'a [xianscan_rust::ml::schemas::Region],
        }

        let report = AnnotatedDebugReport {
            image_dimensions: (img.width(), img.height()),
            total_regions: res.regions.len(),
            panels: &res.panels,
            regions: &res.regions,
        };

        if let Ok(json_str) = serde_json::to_string_pretty(&report) {
            let _ = std::fs::write(&ann_json_path, json_str);
        }
    }
}

/// SAVES THE BASE DETECTOR RENDERING AND RAW COORDINATES JSON INSIDE THE TEST CASE FOLDER.
pub fn save_base_fixture(img: &DynamicImage, fusion: &xianscan_rust::pipeline::fusion::DetectionFusionResult) {
    let key = hash_image(img);
    if let Some(src_path) = get_registered_fixture_path(&key) {
        let (_, _, base_img_path, base_json_path) = get_fixture_output_paths(&src_path);

        // 1. SAVE BASE DETECTOR IMAGE
        let base_img = render_base_detector_image(img, fusion);
        let _ = base_img.save_with_format(&base_img_path, image::ImageFormat::WebP);

        // 2. SAVE RAW BASE DETECTION COORDINATES AND SCORES
        #[derive(Serialize)]
        struct BaseDebugReport<'a> {
            image_dimensions: (u32, u32),
            backend: &'a str,
            panels: &'a [BoxRect],
            bubbles: &'a [BoxRect],
            text_bubbles: &'a [(BoxRect, f32)],
            text_free: &'a [(BoxRect, f32)],
            onomatopoeia: &'a [(BoxRect, f32)],
            comic_boxes: &'a [Vec<[i32; 2]>],
        }

        let report = BaseDebugReport {
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
            let _ = std::fs::write(&base_json_path, json_str);
        }
    }
}

/// EXECUTES RAW DETECTOR FUSION WITHOUT POSTPROCESSING, SAVES `base.webp` & `base_debug.json`, AND CACHES.
pub fn get_or_run_base_detector_with_lang(
    img: &DynamicImage,
    source_lang: Option<&str>,
) {
    let key = hash_image(img);
    let lang_tag = source_lang.unwrap_or("default");
    let category = format!("base_fusion_{}", lang_tag);

    #[derive(Serialize, serde::Deserialize)]
    struct CachedBaseDetections {
        panels: Vec<BoxRect>,
        bubbles: Vec<BoxRect>,
        text_bubbles: Vec<(BoxRect, f32)>,
        text_free: Vec<(BoxRect, f32)>,
        onomatopoeia: Vec<(BoxRect, f32)>,
        comic_boxes: Vec<Vec<[i32; 2]>>,
        backend: String,
    }

    if let Some(cached) = read_base_cache::<CachedBaseDetections>(&category, &key) {
        let fusion = xianscan_rust::pipeline::fusion::DetectionFusionResult {
            comic_boxes: cached.comic_boxes,
            comic_scores: vec![],
            panels: cached.panels,
            bubbles: cached.bubbles,
            onomatopoeia: cached.onomatopoeia,
            text_bubbles: cached.text_bubbles,
            text_free: cached.text_free,
            rapid_lines: vec![],
            backend: cached.backend,
            detector_time_ms: 0.0,
            ocr_fullpage_time_ms: 0.0,
            rescue_time_ms: 0.0,
            watermark_time_ms: 0.0,
            raw_ocr_lines_count: 0,
            rescued_crops_count: 0,
            watermark_recovered_count: 0,
        };
        // ONLY SAVE BASE FIXTURE IF IT DOES NOT ALREADY EXIST ON DISK
        if let Some(src_path) = get_registered_fixture_path(&key) {
            let (_, _, base_img_path, base_json_path) = get_fixture_output_paths(&src_path);
            if !base_img_path.exists() || !base_json_path.exists() {
                save_base_fixture(img, &fusion);
            }
        }
        return;
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
    );

    let cached_data = CachedBaseDetections {
        panels: fusion.panels.clone(),
        bubbles: fusion.bubbles.clone(),
        text_bubbles: fusion.text_bubbles.clone(),
        text_free: fusion.text_free.clone(),
        onomatopoeia: fusion.onomatopoeia.clone(),
        comic_boxes: fusion.comic_boxes.clone(),
        backend: fusion.backend.clone(),
    };
    write_base_cache(&category, &key, &cached_data);
    save_base_fixture(img, &fusion);
}

/// HELPER THAT CHECKS CACHE BEFORE LOADING NEURAL MODELS OR EXECUTING analyze_image.
/// RETURNS THE CACHED RESULT INSTANTLY IF AVAILABLE; RUNS THE LIVE MODEL OTHERWISE.
#[allow(dead_code)]
pub fn get_or_analyze_fixture(img: &DynamicImage) -> AnalyzeResponse {
    get_or_analyze_fixture_with_lang(img, None)
}

/// LANGUAGE-AWARE HELPER THAT CHECKS CACHE PARTITIONED BY LANGUAGE BEFORE RUNNING PIPELINE ANALYSIS.
#[allow(dead_code)]
pub fn get_or_analyze_fixture_with_lang(
    img: &DynamicImage,
    source_lang: Option<&str>,
) -> AnalyzeResponse {
    // 1. GENERATE / UPDATE BASE DETECTOR IMAGE & DEBUG JSON (NO POSTPROCESSING)
    get_or_run_base_detector_with_lang(img, source_lang);

    // 2. RUN / RETRIEVE FULL PIPELINE POSTPROCESSED ANALYSIS
    let key = hash_image(img);
    let lang_tag = source_lang.unwrap_or("default");
    let category = format!("analyze_{}", lang_tag);
    if let Some(cached) = read_cache::<AnalyzeResponse>(&category, &key) {
        save_annotated_fixture(img, &cached);
        return cached;
    }
    let models_dir = Path::new("models");
    let mut engine = PipelineEngine::new(models_dir);
    let opts = source_lang.map(|l| AnalyzeOptions {
        source_lang: Some(l.to_string()),
        target_lang: Some("en".to_string()),
        enable_watermark_inpaint: Some(false),
        inpaint_padding_pct: Some(0.06),
        typeset_padding_pct: Some(0.12),
        ..Default::default()
    });
    let res = engine
        .analyze_image_with_options(img, opts.as_ref())
        .expect("Pipeline analyze_image failed");
    write_cache(&category, &key, &res);
    save_annotated_fixture(img, &res);
    res
}

/// BYPASSES THE CACHE, RUNS THE LIVE MODEL WITH LANGUAGE OPTIONS, AND RE-SEEDS THE CACHE ENTRY.
#[allow(dead_code)]
pub fn force_analyze_fixture_with_lang(
    img: &DynamicImage,
    source_lang: Option<&str>,
) -> AnalyzeResponse {
    get_or_run_base_detector_with_lang(img, source_lang);
    let key = hash_image(img);
    let lang_tag = source_lang.unwrap_or("default");
    let category = format!("analyze_{}", lang_tag);
    let models_dir = Path::new("models");
    let mut engine = PipelineEngine::new(models_dir);
    let opts = source_lang.map(|l| AnalyzeOptions {
        source_lang: Some(l.to_string()),
        target_lang: Some("en".to_string()),
        enable_watermark_inpaint: Some(false),
        inpaint_padding_pct: Some(0.06),
        typeset_padding_pct: Some(0.12),
        ..Default::default()
    });
    let res = engine
        .analyze_image_with_options(img, opts.as_ref())
        .expect("Pipeline analyze_image failed");
    write_cache(&category, &key, &res);
    save_annotated_fixture(img, &res);
    res
}

/// BYPASSES THE CACHE, RUNS THE LIVE MODEL, AND RE-SEEDS THE CACHE ENTRY.
#[allow(dead_code)]
pub fn force_analyze_fixture(img: &DynamicImage) -> AnalyzeResponse {
    force_analyze_fixture_with_lang(img, None)
}

/// REMOVES THE CACHE ENTRY FOR A GIVEN IMAGE AND LANGUAGE SO THE NEXT CALL WILL RUN THE LIVE MODEL.
#[allow(dead_code)]
pub fn invalidate_cache_with_lang(img: &DynamicImage, source_lang: Option<&str>) {
    let key = hash_image(img);
    let lang_tag = source_lang.unwrap_or("default");
    let path = ensure_cache_dir().join(format!("analyze_{}_{}.json", lang_tag, key));
    let _ = std::fs::remove_file(&path);
}

/// REMOVES THE CACHE ENTRY FOR A GIVEN IMAGE SO THE NEXT CALL TO
/// `get_or_analyze_fixture` WILL RUN THE LIVE MODEL INSTEAD.
#[allow(dead_code)]
pub fn invalidate_cache(img: &DynamicImage) {
    invalidate_cache_with_lang(img, None);
}



