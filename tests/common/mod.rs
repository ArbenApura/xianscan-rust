use std::path::{Path, PathBuf};
use image::DynamicImage;
use serde::{de::DeserializeOwned, Serialize};
use sha2::{Digest, Sha256};
use xianscan_rust::ml::schemas::AnalyzeResponse;
use xianscan_rust::pipeline::PipelineEngine;

/// Increment this when a pipeline change alters analyze_image output.
/// Changing this value invalidates all existing cache entries automatically
/// (old hashes become unreachable) without deleting any files.
/// Current value: 1 — matches existing cache entries from the initial seeding.
#[allow(dead_code)]
const CACHE_VERSION: u8 = 1;

#[allow(dead_code)]
pub fn ensure_cache_dir() -> PathBuf {
    let dir = Path::new("tests/.cache");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(dir);
    }
    dir.to_path_buf()
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
    let path = ensure_cache_dir().join(format!("{}_{}.json", category, key));
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
    let path = ensure_cache_dir().join(format!("{}_{}.json", category, key));
    if let Ok(json_str) = serde_json::to_string(val) {
        let _ = std::fs::write(path, json_str);
    }
}

/// Helper that checks cache before loading neural models or executing analyze_image.
/// Returns the cached result instantly if available; runs the live model otherwise.
#[allow(dead_code)]
pub fn get_or_analyze_fixture(img: &DynamicImage) -> AnalyzeResponse {
    let key = hash_image(img);
    if let Some(cached) = read_cache::<AnalyzeResponse>("analyze", &key) {
        return cached;
    }
    let models_dir = Path::new("models");
    let mut engine = PipelineEngine::new(models_dir);
    let res = engine.analyze_image(img).expect("Pipeline analyze_image failed");
    write_cache("analyze", &key, &res);
    res
}

/// Bypasses the cache, runs the live model, and re-seeds the cache entry.
///
/// Use this during development to validate a single pipeline fix without clearing
/// the entire cache. After this call, subsequent `get_or_analyze_fixture` calls
/// for the same image will return the fresh result instantly.
///
/// Equivalent to deleting the cache file and calling `get_or_analyze_fixture`.
#[allow(dead_code)]
pub fn force_analyze_fixture(img: &DynamicImage) -> AnalyzeResponse {
    let key = hash_image(img);
    let models_dir = Path::new("models");
    let mut engine = PipelineEngine::new(models_dir);
    let res = engine.analyze_image(img).expect("Pipeline analyze_image failed");
    write_cache("analyze", &key, &res);
    res
}

/// Removes the cache entry for a given image so the next call to
/// `get_or_analyze_fixture` will run the live model instead.
#[allow(dead_code)]
pub fn invalidate_cache(img: &DynamicImage) {
    let key = hash_image(img);
    let path = ensure_cache_dir().join(format!("analyze_{}.json", key));
    let _ = std::fs::remove_file(&path);
}
