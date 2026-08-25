// -- CRATE / EXTERNAL IMPORTS -- //
use serde::{Deserialize, Serialize};

// -- TYPES & STRUCTS -- //

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[derive(Default)]
pub enum RegionKind {
    #[serde(rename = "dialogue_bubble")]
    #[default]
    DialogueBubble,
    #[serde(rename = "free_text")]
    FreeText,
    #[serde(rename = "sound_effect")]
    SoundEffect,
}


#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Point2D {
    pub x: f32,
    pub y: f32,
}

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inpaint_box: Option<BoxRect>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub typeset_box: Option<BoxRect>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bubble_box: Option<BoxRect>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bubble_polygon: Option<Vec<[i32; 2]>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub centroid: Option<Point2D>,
    #[serde(default)]
    pub kind: RegionKind,
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
    #[serde(default)]
    pub inpaint_padding_pct: Option<f32>,
    #[serde(default)]
    pub typeset_padding_pct: Option<f32>,
    #[serde(default)]
    pub enable_watermark_inpaint: Option<bool>,
    #[serde(default)]
    pub enable_sfx: Option<bool>,
    #[serde(default)]
    pub sfx_max_area_pct: Option<f32>,
    #[serde(default)]
    pub allow_degraded_fallback: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OnomatopoeiaFrame {
    pub id: String,
    pub seq: usize,
    #[serde(rename = "box")]
    pub box_: BoxRect,
    pub score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OcrStepLog {
    pub step: String,
    pub duration_ms: f64,
    pub details: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OcrStats {
    pub total_time_ms: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub queue_wait_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_request_time_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wall_time_ms: Option<f64>,
    pub detector_time_ms: f64,
    pub ocr_fullpage_time_ms: f64,
    pub rescue_time_ms: f64,
    pub watermark_time_ms: f64,
    pub assembly_time_ms: f64,
    pub backend: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device: Option<String>,
    pub image_width: u32,
    pub image_height: u32,
    pub raw_bubbles_count: usize,
    pub raw_text_bubbles_count: usize,
    pub raw_text_free_count: usize,
    pub raw_sfx_count: usize,
    pub raw_ocr_lines_count: usize,
    pub rescued_crops_count: usize,
    pub watermark_recovered_count: usize,
    pub final_regions_count: usize,
    pub avg_confidence: f32,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub steps: Vec<OcrStepLog>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyzeResponse {
    pub width: u32,
    pub height: u32,
    pub backend: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub onomatopoeia: Vec<OnomatopoeiaFrame>,
    pub regions: Vec<Region>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stats: Option<OcrStats>,
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
    #[serde(default)]
    pub reloading: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cuda_vram_limit_mb: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub configured_cuda_vram_limit_mb: Option<usize>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuTelemetry {
    pub name: String,
    pub vram_used_mb: f64,
    pub vram_total_mb: f64,
    pub utilization_pct: Option<f64>,
    pub active_provider: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostMemoryTelemetry {
    pub used_mb: f64,
    pub total_mb: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuTelemetry {
    pub cores: usize,
    pub utilization_pct: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineQueueTelemetry {
    pub active_jobs: usize,
    pub queued_jobs: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemTelemetry {
    pub gpu: Option<GpuTelemetry>,
    pub host_memory: HostMemoryTelemetry,
    pub cpu: CpuTelemetry,
    pub queue: EngineQueueTelemetry,
    pub timestamp_ms: u64,
}
