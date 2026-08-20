use std::sync::{LazyLock, Mutex};
use anyhow::Result;
use ort::session::builder::GraphOptimizationLevel;
use ort::session::Session;

use super::schemas::{GpuInfo, HardwareStatus};

static OVERRIDE_DEVICE: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));

#[cfg(windows)]
pub fn enumerate_system_gpus() -> Vec<GpuInfo> {
    use windows::Win32::Graphics::Dxgi::*;

    let mut gpus = Vec::new();
    unsafe {
        if let Ok(factory) = CreateDXGIFactory::<IDXGIFactory>() {
            let mut i = 0;
            while let Ok(adapter) = factory.EnumAdapters(i) {
                if let Ok(desc) = adapter.GetDesc() {
                    let name_len = desc.Description.iter().position(|&c| c == 0).unwrap_or(desc.Description.len());
                    let name = String::from_utf16_lossy(&desc.Description[..name_len]).trim().to_string();

                    // Skip Microsoft Basic Render Driver (0x1414)
                    if desc.VendorId != 0x1414 && !name.contains("Basic Render") {
                        let vram_mb = (desc.DedicatedVideoMemory as f64) / (1024.0 * 1024.0);
                        let name_lower = name.to_lowercase();

                        let is_known_dgpu = ["geforce", "rtx", "gtx", "radeon rx", "radeon pro", "arc a", "quadro", "tesla", "titan"]
                            .iter()
                            .any(|&tag| name_lower.contains(tag));

                        let is_known_igpu = ["intel(r) hd", "intel(r) uhd", "intel(r) iris", "radeon(tm) graphics", "radeon vega"]
                            .iter()
                            .any(|&tag| name_lower.contains(tag));

                        let is_dedicated = is_known_dgpu || (vram_mb >= 1024.0 && !is_known_igpu);

                        gpus.push(GpuInfo {
                            device_id: i,
                            name,
                            vendor_id: desc.VendorId,
                            vram_mb: (vram_mb * 10.0).round() / 10.0,
                            is_dedicated,
                            is_integrated: !is_dedicated,
                        });
                    }
                }
                i += 1;
            }
        }
    }
    gpus
}

#[cfg(not(windows))]
pub fn enumerate_system_gpus() -> Vec<GpuInfo> {
    Vec::new()
}

pub fn get_dedicated_gpu() -> Option<GpuInfo> {
    enumerate_system_gpus().into_iter().find(|g| g.is_dedicated)
}

pub fn probe_hardware() -> (Vec<String>, String) {
    let override_dev = OVERRIDE_DEVICE.lock().unwrap().clone();
    let env_override = override_dev.or_else(|| std::env::var("MT_DEVICE").ok()).unwrap_or_default().to_lowercase();

    let dedicated_gpu = get_dedicated_gpu();

    if env_override == "cpu" || env_override == "none" {
        return (vec!["CPUExecutionProvider".to_string()], "CPU Multi-threaded".to_string());
    }

    if (env_override == "dml" || env_override == "directml") && dedicated_gpu.is_some() {
        let dgpu = dedicated_gpu.unwrap();
        return (
            vec!["DmlExecutionProvider".to_string(), "CPUExecutionProvider".to_string()],
            format!("DirectML Dedicated GPU ({})", dgpu.name),
        );
    }

    // Auto-detection hierarchy: only pick dGPU, strictly fallback to CPU for iGPU
    if let Some(dgpu) = dedicated_gpu {
        (
            vec!["DmlExecutionProvider".to_string(), "CPUExecutionProvider".to_string()],
            format!("DirectML Dedicated GPU ({})", dgpu.name),
        )
    } else {
        (vec!["CPUExecutionProvider".to_string()], "CPU Multi-threaded".to_string())
    }
}

pub fn get_hardware_status() -> HardwareStatus {
    let (providers, label) = probe_hardware();
    let detected_gpus = enumerate_system_gpus();
    let dedicated_gpu = get_dedicated_gpu();
    let has_dedicated_gpu = dedicated_gpu.is_some();
    let dml_active = providers.iter().any(|p| p == "DmlExecutionProvider");

    let gpu_warning = if !dml_active && !detected_gpus.is_empty() && !has_dedicated_gpu {
        Some(format!(
            "Integrated GPU detected ({}). GPU acceleration is disabled to protect against desktop freezing and driver crashes. Running on multi-threaded CPU.",
            detected_gpus[0].name
        ))
    } else {
        None
    };

    HardwareStatus {
        device_label: label,
        active_provider: providers.first().cloned().unwrap_or_else(|| "CPUExecutionProvider".to_string()),
        providers: providers.clone(),
        available_providers: vec!["CPUExecutionProvider".to_string()],
        has_cuda: false,
        has_directml: dml_active,
        has_directml_raw: true,
        has_coreml: false,
        has_dedicated_gpu,
        detected_gpus,
        gpu_warning,
        reloading: false,
    }
}

pub fn set_active_provider(mode: &str) -> HardwareStatus {
    let clean = mode.trim().to_lowercase();
    let mut guard = OVERRIDE_DEVICE.lock().unwrap();
    *guard = if clean == "auto" { None } else { Some(clean) };
    drop(guard);
    get_hardware_status()
}

/// Creates an ONNX Runtime Session from bytes using the active hardware accelerator
/// (DirectML for dedicated GPUs, with automatic, graceful fallback to multi-threaded CPU).
pub fn create_session_from_memory(bytes: &[u8], model_tag: &str) -> Result<Session> {
    let (providers, _) = probe_hardware();
    let wants_dml = providers.iter().any(|p| p == "DmlExecutionProvider");

    if wants_dml {
        #[cfg(feature = "directml")]
        {
            let dml_res = (|| -> Result<Session> {
                let session = Session::builder()
                    .map_err(|e| anyhow::anyhow!("Builder error: {}", e))?
                    .with_intra_threads(num_cpus::get().min(8))
                    .map_err(|e| anyhow::anyhow!("Intra threads error: {}", e))?
                    .with_optimization_level(GraphOptimizationLevel::Level3)
                    .map_err(|e| anyhow::anyhow!("Opt level error: {}", e))?
                    .with_execution_providers([ort::ep::DirectML::default().build()])
                    .map_err(|e| anyhow::anyhow!("DirectML provider error: {}", e))?
                    .commit_from_memory(bytes)
                    .map_err(|e| anyhow::anyhow!("Commit error: {}", e))?;
                Ok(session)
            })();

            match dml_res {
                Ok(s) => {
                    tracing::info!("Successfully initialized ONNX model '{}' with DirectML GPU acceleration.", model_tag);
                    return Ok(s);
                }
                Err(e) => {
                    tracing::warn!(
                        "Failed to initialize ONNX model '{}' with DirectML ({}); falling back to CPU multi-threaded.",
                        model_tag, e
                    );
                }
            }
        }
    }

    // CPU multi-threaded session with Level 3 graph optimization
    tracing::debug!("Initializing ONNX model '{}' with CPU execution provider.", model_tag);
    let session = Session::builder()
        .map_err(|e| anyhow::anyhow!("Session builder error: {}", e))?
        .with_intra_threads(num_cpus::get().min(8))
        .map_err(|e| anyhow::anyhow!("Session intra threads error: {}", e))?
        .with_optimization_level(GraphOptimizationLevel::Level3)
        .map_err(|e| anyhow::anyhow!("Session optimization level error: {}", e))?
        .commit_from_memory(bytes)
        .map_err(|e| anyhow::anyhow!("Commit session from memory error: {}", e))?;

    Ok(session)
}
