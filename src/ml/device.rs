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

#[cfg(target_os = "linux")]
pub fn enumerate_system_gpus() -> Vec<GpuInfo> {
    // NVIDIA'S PROPRIETARY DRIVER EXPOSES ONE SUBDIRECTORY PER GPU UNDER
    // /proc/driver/nvidia/gpus/<PCI-BDF>, EACH CONTAINING AN `information` FILE
    // WITH A `Model:` LINE. NO EXTERNAL BINARY (nvidia-smi) IS REQUIRED.
    parse_nvidia_gpu_root(std::path::Path::new("/proc/driver/nvidia/gpus"))
}

#[cfg(target_os = "linux")]
fn parse_nvidia_gpu_root(root: &std::path::Path) -> Vec<GpuInfo> {
    let mut gpus = Vec::new();
    let Ok(entries) = std::fs::read_dir(root) else {
        return gpus;
    };
    for (i, entry) in entries.flatten().enumerate() {
        let Ok(info) = std::fs::read_to_string(entry.path().join("information")) else {
            continue;
        };
        let name = info
            .lines()
            .find_map(|l| l.strip_prefix("Model:"))
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "NVIDIA GPU".to_string());
        gpus.push(GpuInfo {
            device_id: i as u32,
            name,
            vendor_id: 0x10DE,
            vram_mb: 0.0,
            is_dedicated: true,
            is_integrated: false,
        });
    }
    gpus
}

#[cfg(target_os = "macos")]
pub fn enumerate_system_gpus() -> Vec<GpuInfo> {
    // APPLE SILICON EXPOSES A SINGLE UNIFIED-MEMORY GPU VIA METAL. THE RELEASE
    // BUILDS ONLY TARGET aarch64-apple-darwin, SO THE GPU IS THE ACCELERATOR.
    let mut gpus = Vec::new();
    for (i, device) in metal::Device::all().into_iter().enumerate() {
        let name = device.name().to_string();
        let is_dedicated = std::env::consts::ARCH == "aarch64";
        gpus.push(GpuInfo {
            device_id: i as u32,
            name,
            vendor_id: 0x106B,
            vram_mb: 0.0,
            is_dedicated,
            is_integrated: !is_dedicated,
        });
    }
    gpus
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
pub fn enumerate_system_gpus() -> Vec<GpuInfo> {
    Vec::new()
}

pub fn get_dedicated_gpu() -> Option<GpuInfo> {
    enumerate_system_gpus().into_iter().find(|g| g.is_dedicated)
}

pub fn probe_hardware() -> (Vec<String>, String) {
    let override_dev = OVERRIDE_DEVICE.lock().unwrap().clone();
    let env_override = override_dev
        .or_else(|| std::env::var("MT_DEVICE").ok())
        .unwrap_or_default()
        .to_lowercase();

    let dedicated_gpu = get_dedicated_gpu();

    if env_override == "cpu" || env_override == "none" {
        return (vec!["CPUExecutionProvider".to_string()], "CPU Multi-threaded".to_string());
    }

    // CUDA (NVIDIA) — REQUIRES THE `cuda` FEATURE AND A DETECTED NVIDIA GPU.
    if env_override == "cuda" && cfg!(feature = "cuda") {
        if let Some(dgpu) = &dedicated_gpu {
            return (
                vec!["CUDAExecutionProvider".to_string(), "CPUExecutionProvider".to_string()],
                format!("CUDA Dedicated GPU ({})", dgpu.name),
            );
        }
    }

    // CoreML (APPLE SILICON) — REQUIRES THE `coreml` FEATURE AND A DETECTED GPU.
    if env_override == "coreml" && cfg!(feature = "coreml") {
        if let Some(dgpu) = &dedicated_gpu {
            return (
                vec!["CoreMLExecutionProvider".to_string(), "CPUExecutionProvider".to_string()],
                format!("CoreML Apple GPU ({})", dgpu.name),
            );
        }
    }

    // DirectML (WINDOWS) — REQUIRES THE `directml` FEATURE AND A DETECTED dGPU.
    if (env_override == "dml" || env_override == "directml") && cfg!(feature = "directml") {
        if let Some(dgpu) = &dedicated_gpu {
            return (
                vec!["DmlExecutionProvider".to_string(), "CPUExecutionProvider".to_string()],
                format!("DirectML Dedicated GPU ({})", dgpu.name),
            );
        }
    }

    // AUTO-DETECTION HIERARCHY: PICK THE COMPILED GPU BACKEND, ELSE CPU. A BUILD
    // WITH NONE OF THE GPU FEATURES FALLS THROUGH TO CPU BY CONSTRUCTION.
    if let Some(dgpu) = &dedicated_gpu {
        if cfg!(feature = "cuda") {
            return (
                vec!["CUDAExecutionProvider".to_string(), "CPUExecutionProvider".to_string()],
                format!("CUDA Dedicated GPU ({})", dgpu.name),
            );
        }
        if cfg!(feature = "coreml") {
            return (
                vec!["CoreMLExecutionProvider".to_string(), "CPUExecutionProvider".to_string()],
                format!("CoreML Apple GPU ({})", dgpu.name),
            );
        }
        if cfg!(feature = "directml") {
            return (
                vec!["DmlExecutionProvider".to_string(), "CPUExecutionProvider".to_string()],
                format!("DirectML Dedicated GPU ({})", dgpu.name),
            );
        }
    }

    (vec!["CPUExecutionProvider".to_string()], "CPU Multi-threaded".to_string())
}

pub fn get_hardware_status() -> HardwareStatus {
    let (providers, label) = probe_hardware();
    let detected_gpus = enumerate_system_gpus();
    let dedicated_gpu = get_dedicated_gpu();
    let has_dedicated_gpu = dedicated_gpu.is_some();
    let dml_active = providers.iter().any(|p| p == "DmlExecutionProvider");
    let has_cuda = cfg!(feature = "cuda") && has_dedicated_gpu;
    let has_coreml = cfg!(feature = "coreml") && has_dedicated_gpu;

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
        has_cuda,
        has_directml: dml_active,
        has_directml_raw: true,
        has_coreml,
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
    let wants_cuda = providers.iter().any(|p| p == "CUDAExecutionProvider");
    let wants_coreml = providers.iter().any(|p| p == "CoreMLExecutionProvider");
    let wants_dml = providers.iter().any(|p| p == "DmlExecutionProvider");

    if wants_cuda {
        #[cfg(feature = "cuda")]
        {
            let cuda_res = (|| -> Result<Session> {
                let session = Session::builder()
                    .map_err(|e| anyhow::anyhow!("Builder error: {}", e))?
                    .with_intra_threads(num_cpus::get().min(8))
                    .map_err(|e| anyhow::anyhow!("Intra threads error: {}", e))?
                    .with_optimization_level(GraphOptimizationLevel::Level3)
                    .map_err(|e| anyhow::anyhow!("Opt level error: {}", e))?
                    .with_execution_providers([ort::ep::CUDA::default().build()])
                    .map_err(|e| anyhow::anyhow!("CUDA provider error: {}", e))?
                    .commit_from_memory(bytes)
                    .map_err(|e| anyhow::anyhow!("Commit error: {}", e))?;
                Ok(session)
            })();

            match cuda_res {
                Ok(s) => {
                    tracing::info!("Successfully initialized ONNX model '{}' with CUDA GPU acceleration.", model_tag);
                    return Ok(s);
                }
                Err(e) => {
                    tracing::warn!(
                        "Failed to initialize ONNX model '{}' with CUDA ({}); falling back to CPU multi-threaded.",
                        model_tag, e
                    );
                }
            }
        }
    }

    if wants_coreml {
        #[cfg(feature = "coreml")]
        {
            let coreml_res = (|| -> Result<Session> {
                let session = Session::builder()
                    .map_err(|e| anyhow::anyhow!("Builder error: {}", e))?
                    .with_intra_threads(num_cpus::get().min(8))
                    .map_err(|e| anyhow::anyhow!("Intra threads error: {}", e))?
                    .with_optimization_level(GraphOptimizationLevel::Level3)
                    .map_err(|e| anyhow::anyhow!("Opt level error: {}", e))?
                    .with_execution_providers([ort::ep::CoreML::default().build()])
                    .map_err(|e| anyhow::anyhow!("CoreML provider error: {}", e))?
                    .commit_from_memory(bytes)
                    .map_err(|e| anyhow::anyhow!("Commit error: {}", e))?;
                Ok(session)
            })();

            match coreml_res {
                Ok(s) => {
                    tracing::info!("Successfully initialized ONNX model '{}' with CoreML acceleration.", model_tag);
                    return Ok(s);
                }
                Err(e) => {
                    tracing::warn!(
                        "Failed to initialize ONNX model '{}' with CoreML ({}); falling back to CPU multi-threaded.",
                        model_tag, e
                    );
                }
            }
        }
    }

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

// -- TESTS -- //

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "linux")]
    #[test]
    fn parses_nvidia_gpu_information() {
        let tmp = tempfile::tempdir().unwrap();
        let gpu_dir = tmp.path().join("0000:01:00.0");
        std::fs::create_dir_all(&gpu_dir).unwrap();
        std::fs::write(gpu_dir.join("information"), "Model:\t\tNVIDIA GeForce RTX 3080\n").unwrap();

        let gpus = parse_nvidia_gpu_root(tmp.path());
        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].name, "NVIDIA GeForce RTX 3080");
        assert!(gpus[0].is_dedicated);
        assert_eq!(gpus[0].vendor_id, 0x10DE);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn returns_empty_when_no_nvidia_driver() {
        let tmp = tempfile::tempdir().unwrap();
        let gpus = parse_nvidia_gpu_root(tmp.path());
        assert!(gpus.is_empty());
    }
}
