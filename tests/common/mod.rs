// -- CRATE / EXTERNAL IMPORTS -- //
use std::path::{Path, PathBuf};
use image::{DynamicImage, Rgba, RgbaImage};
use serde::{de::DeserializeOwned, Serialize};
use sha2::{Digest, Sha256};

// -- INTERNAL IMPORTS -- //
use xianscan_rust::ml::schemas::{AnalyzeOptions, AnalyzeResponse};
use xianscan_rust::pipeline::PipelineEngine;

// -- CONSTANTS -- //

/// INCREMENT THIS WHEN A PIPELINE CHANGE ALTERS ANALYZE_IMAGE OUTPUT.
/// CHANGING THIS VALUE INVALIDATES ALL EXISTING CACHE ENTRIES AUTOMATICALLY
/// (OLD HASHES BECOME UNREACHABLE) WITHOUT DELETING ANY FILES.
#[allow(dead_code)]
const CACHE_VERSION: u8 = 8;

// -- FUNCTIONS & ALGORITHMS -- //

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
#[allow(dead_code)]
pub fn resolve_fixture_path(lang: &str, filename: &str) -> Option<PathBuf> {
    // 1. CHECK PRIMARY TIER-1 / STANDARD PATH
    let p1 = Path::new("tests/fixtures").join(lang).join(filename);
    if p1.exists() {
        return Some(p1);
    }

    // 2. CHECK TIER-2 PRIVATE DATASET DIRECTORY IF CONFIGURED
    if let Some(base) = get_dataset_dir() {
        let p2 = base.join(lang).join(filename);
        if p2.exists() {
            return Some(p2);
        }
        let p3 = base.join(filename);
        if p3.exists() {
            return Some(p3);
        }
    }

    None
}

/// ATTEMPTS TO LOAD A TEST FIXTURE IMAGE; RETURNS NONE IF RUNNING IN CLEAN CI WITHOUT LOCAL DATASET.
#[allow(dead_code)]
pub fn load_fixture_or_skip(lang: &str, filename: &str) -> Option<DynamicImage> {
    let resolved = resolve_fixture_path(lang, filename)?;
    let img = image::ImageReader::open(&resolved)
        .ok()?
        .with_guessed_format()
        .ok()?
        .decode()
        .ok()?;
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
    let key = hash_image(img);
    let lang_tag = source_lang.unwrap_or("default");
    let category = format!("analyze_{}", lang_tag);
    if let Some(cached) = read_cache::<AnalyzeResponse>(&category, &key) {
        return cached;
    }
    let models_dir = Path::new("models");
    let mut engine = PipelineEngine::new(models_dir);
    let opts = source_lang.map(|l| AnalyzeOptions {
        source_lang: Some(l.to_string()),
        target_lang: Some("en".to_string()),
    });
    let res = engine
        .analyze_image_with_options(img, opts.as_ref())
        .expect("Pipeline analyze_image failed");
    write_cache(&category, &key, &res);
    res
}

/// BYPASSES THE CACHE, RUNS THE LIVE MODEL WITH LANGUAGE OPTIONS, AND RE-SEEDS THE CACHE ENTRY.
#[allow(dead_code)]
pub fn force_analyze_fixture_with_lang(
    img: &DynamicImage,
    source_lang: Option<&str>,
) -> AnalyzeResponse {
    let key = hash_image(img);
    let lang_tag = source_lang.unwrap_or("default");
    let category = format!("analyze_{}", lang_tag);
    let models_dir = Path::new("models");
    let mut engine = PipelineEngine::new(models_dir);
    let opts = source_lang.map(|l| AnalyzeOptions {
        source_lang: Some(l.to_string()),
        target_lang: Some("en".to_string()),
    });
    let res = engine
        .analyze_image_with_options(img, opts.as_ref())
        .expect("Pipeline analyze_image failed");
    write_cache(&category, &key, &res);
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
