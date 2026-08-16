use std::path::{Path, PathBuf};
use image::DynamicImage;
use serde::{de::DeserializeOwned, Serialize};
use sha2::{Digest, Sha256};
use xianscan_rust::ml::schemas::AnalyzeResponse;
use xianscan_rust::pipeline::PipelineEngine;

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

/// Helper that checks cache before loading neural models or executing analyze_image
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
