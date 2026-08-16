use std::sync::{LazyLock, Mutex};
use tracing::info;

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

    let detected_gpus = enumerate_system_gpus();
    let dedicated_gpu = get_dedicated_gpu();
    let has_only_igpu = !detected_gpus.is_empty() && dedicated_gpu.is_none();

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
        if has_only_igpu {
            info!(
                "Integrated GPU detected ({:?}). Banning iGPU from ML inference to prevent DWM freezes and driver TDR; using CPU Multi-threaded.",
                detected_gpus[0].name
            );
        }
        (vec!["CPUExecutionProvider".to_string()], "CPU Multi-threaded".to_string())
    }
}

pub fn get_hardware_status() -> HardwareStatus {
    let (providers, label) = probe_hardware();
    let detected_gpus = enumerate_system_gpus();
    let dedicated_gpu = get_dedicated_gpu();
    let has_dedicated_gpu = dedicated_gpu.is_some();

    let gpu_warning = if !detected_gpus.is_empty() && !has_dedicated_gpu {
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
        has_directml: has_dedicated_gpu,
        has_directml_raw: true,
        has_coreml: false,
        has_dedicated_gpu,
        detected_gpus,
        gpu_warning,
    }
}

pub fn set_active_provider(mode: &str) -> HardwareStatus {
    let clean = mode.trim().to_lowercase();
    let mut guard = OVERRIDE_DEVICE.lock().unwrap();
    *guard = if clean == "auto" { None } else { Some(clean) };
    drop(guard);
    get_hardware_status()
}
