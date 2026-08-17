use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BoxRect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Region {
    pub id: String,
    #[serde(rename = "box")]
    pub box_: BoxRect,
    pub polygon: Vec<[i32; 2]>,
    pub text: String,
    pub confidence: f32,
    pub vertical: bool,
    pub angle: f32,
    #[serde(default)]
    pub is_title: bool,
    #[serde(default)]
    pub is_subtitle: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AnalyzeOptions {
    #[serde(default)]
    pub source_lang: Option<String>,
    #[serde(default)]
    pub target_lang: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyzeResponse {
    pub width: u32,
    pub height: u32,
    pub backend: String,
    pub regions: Vec<Region>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanRequestRegion {
    pub id: String,
    #[serde(default, rename = "box")]
    pub box_: Option<BoxRect>,
    #[serde(default)]
    pub polygon: Option<Vec<[i32; 2]>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareStatus {
    pub device_label: String,
    pub active_provider: String,
    pub providers: Vec<String>,
    pub available_providers: Vec<String>,
    pub has_cuda: bool,
    pub has_directml: bool,
    pub has_directml_raw: bool,
    pub has_coreml: bool,
    pub has_dedicated_gpu: bool,
    pub detected_gpus: Vec<GpuInfo>,
    pub gpu_warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    pub device_id: u32,
    pub name: String,
    pub vendor_id: u32,
    pub vram_mb: f64,
    pub is_dedicated: bool,
    pub is_integrated: bool,
}
