#[cfg(target_os = "linux")]
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use anyhow::Result;
use ort::session::builder::GraphOptimizationLevel;
use ort::session::Session;

use super::schemas::{
    CpuTelemetry, EngineQueueTelemetry, GpuInfo, GpuTelemetry, HardwareStatus, HostMemoryTelemetry,
    SystemTelemetry,
};

static OVERRIDE_DEVICE: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));
static OVERRIDE_CUDA_MEM_LIMIT_MB: LazyLock<Mutex<Option<usize>>> = LazyLock::new(|| Mutex::new(None));

// SET ONCE A CUDA / COREML SESSION FAILS TO INITIALIZE, SO status CAN STOP
// REPORTING AN ACCELERATOR THAT IS NOT ACTUALLY RUNNING (MISSING RUNTIME).
static CUDA_RUNTIME_FAILED: AtomicBool = AtomicBool::new(false);
static COREML_RUNTIME_FAILED: AtomicBool = AtomicBool::new(false);
static LAST_GPU_ERROR: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));

// SHORT-TTL CACHE FOR GPU ENUMERATION. THE LINUX PATH RUNS `nvidia-smi`, WHICH CAN HANG
// ON A WEDGED DRIVER AND WOULD OTHERWISE BLOCK EVERY /system/hardware REQUEST. CACHING
// ALSO AVOIDS RE-SPAWNING THE SUBPROCESS UP TO 3x PER REQUEST (probe_hardware +
// get_dedicated_gpu + the direct enumerate call IN get_hardware_status).
static GPU_ENUM_CACHE: LazyLock<Mutex<Option<(Instant, Vec<GpuInfo>)>>> =
    LazyLock::new(|| Mutex::new(None));

const GPU_ENUM_CACHE_TTL: Duration = Duration::from_secs(15);

// HOW LONG TO WAIT FOR A SUBPROCESS (E.G. nvidia-smi) BEFORE GIVING UP AND TREATING
// IT AS "NO GPU DATA". A HUNG DRIVER MUST NEVER BLOCK THE HTTP HARDWARE STATUS ROUTE.
#[cfg(target_os = "linux")]
const SUBPROCESS_TIMEOUT: Duration = Duration::from_secs(3);

#[cfg(windows)]
fn enumerate_system_gpus_inner() -> Vec<GpuInfo> {
    use windows::Win32::Graphics::Dxgi::*;

    let mut gpus = Vec::new();
    unsafe {
        if let Ok(factory) = CreateDXGIFactory::<IDXGIFactory>() {
            let mut i = 0;
            while let Ok(adapter) = factory.EnumAdapters(i) {
                if let Ok(desc) = adapter.GetDesc() {
                    let name_len = desc.Description.iter().position(|&c| c == 0).unwrap_or(desc.Description.len());
                    let name = String::from_utf16_lossy(&desc.Description[..name_len]).trim().to_string();

                    // SKIP MICROSOFT BASIC RENDER DRIVER (0x1414)
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
fn enumerate_system_gpus_inner() -> Vec<GpuInfo> {
    // NVIDIA'S PROPRIETARY DRIVER EXPOSES ONE SUBDIRECTORY PER GPU UNDER
    // /proc/driver/nvidia/gpus/<PCI-BDF>, EACH CONTAINING AN `information` FILE
    // WITH A `Model:` LINE. THE `information` FILE DOES NOT CARRY VRAM, SO WE
    // POPULATE vram_mb FROM `nvidia-smi` (PRESENT WHENEVER THE DRIVER IS LOADED).
    let (vram_by_bus, vram_ordered) = query_nvidia_vram_by_bus();
    let mut gpus = parse_nvidia_gpu_root(
        std::path::Path::new("/proc/driver/nvidia/gpus"),
        &vram_by_bus,
        &vram_ordered,
    );
    // AMD GPUS ARE EXPOSED VIA THE OPEN-SOURCE AMDGPU DRIVER AS DRM CARDS UNDER
    // /sys/class/drm/card*/device, WITH `vendor` = 0x1002. PARSE BOTH SO A MIXED
    // OR AMD-ONLY SYSTEM REPORTS ITS REAL GPU INSTEAD OF AN EMPTY LIST.
    gpus.extend(parse_amd_drm_root(std::path::Path::new("/sys/class/drm")));
    gpus
}

#[cfg(target_os = "linux")]
fn normalize_pci_bus_id(raw: &str) -> String {
    // nvidia-smi EMITS THE FULL 8-HEX PCI DOMAIN ("00000000:01:00.0") WHILE
    // /proc/driver/nvidia/gpus/ DIR NAMES USE THE 4-HEX FORM ("0000:01:00.0").
    // NORMALIZE THE DOMAIN TO A BARE HEX VALUE SO BOTH FORMS COLLIDE ON ONE KEY
    // AND MULTI-GPU SYSTEMS CANNOT MISASSIGN VRAM TO THE WRONG GPU.
    let s = raw.trim().to_ascii_lowercase();
    match s.split_once(':') {
        Some((domain, rest)) => {
            let dom = u32::from_str_radix(domain.trim_start_matches('0'), 16).unwrap_or(0);
            format!("{:x}:{}", dom, rest)
        }
        None => s,
    }
}

/// Runs a command to completion with a hard timeout, reading both stdout and stderr.
/// Returns `None` if the command failed to spawn, errored, or exceeded the timeout
/// (the child is killed). A hanging driver/command can therefore never block the caller.
#[cfg(target_os = "linux")]
fn run_with_timeout(cmd: &mut std::process::Command, timeout: Duration) -> Option<std::process::Output> {
    use std::io::Read;
    use std::process::Stdio;
    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .ok()?;
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                // PROCESS EXITED: DRAIN THE PIPES. THE OUTPUT IS SMALL (A FEW LINES),
                // SO READING AFTER EXIT CANNOT DEADLOCK ON A FULL PIPE.
                let mut stdout = Vec::new();
                let mut stderr = Vec::new();
                if let Some(mut s) = child.stdout.take() {
                    let _ = s.read_to_end(&mut stdout);
                }
                if let Some(mut s) = child.stderr.take() {
                    let _ = s.read_to_end(&mut stderr);
                }
                return Some(std::process::Output { status, stdout, stderr });
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    tracing::warn!(
                        "subprocess timed out after {:?}: {}",
                        timeout,
                        cmd.get_program().to_string_lossy()
                    );
                    return None;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(_) => return None,
        }
    }
}

#[cfg(target_os = "linux")]
fn query_nvidia_vram_by_bus() -> (HashMap<String, f64>, Vec<f64>) {
    let Some(out) = run_with_timeout(
        std::process::Command::new("nvidia-smi")
            .args(["--query-gpu=memory.total,pci.bus_id", "--format=csv,noheader,nounits"]),
        SUBPROCESS_TIMEOUT,
    ) else {
        return (HashMap::new(), Vec::new());
    };
    if !out.status.success() {
        return (HashMap::new(), Vec::new());
    }
    let Ok(stdout) = String::from_utf8(out.stdout) else {
        return (HashMap::new(), Vec::new());
    };
    // nvidia-smi ORDER IS PCI-SORTED, WHICH MAY DIFFER FROM READDIR ORDER — KEY
    // BY pci.bus_id SO A MULTI-GPU SYSTEM CANNOT MISASSIGN VRAM TO THE WRONG GPU.
    let mut by_bus = HashMap::new();
    let mut ordered = Vec::new();
    for line in stdout.lines() {
        let mut it = line.splitn(2, ',');
        let mem = it
            .next()
            .and_then(|s| s.trim().trim_end_matches(" MiB").parse::<f64>().ok());
        let bus = it.next().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        if let Some(m) = mem {
            ordered.push(m);
            if let Some(b) = bus {
                by_bus.insert(normalize_pci_bus_id(&b), m);
            }
        }
    }
    (by_bus, ordered)
}

#[cfg(target_os = "linux")]
fn parse_nvidia_gpu_root(
    root: &std::path::Path,
    vram_by_bus: &HashMap<String, f64>,
    vram_ordered: &[f64],
) -> Vec<GpuInfo> {
    let mut gpus = Vec::new();
    let Ok(entries) = std::fs::read_dir(root) else {
        return gpus;
    };
    let mut ordered_idx = 0usize;
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
        // MATCH VRAM BY PCI BUS ID (THE DIR NAME IS THE PCI-BDF); FALL BACK TO
        // INDEX POSITION WHEN THE BUS ID IS NOT A CLEAN MATCH. ordered_idx ALWAYS
        // ADVANCES PER ENTRY SO A MIXED MATCH/FALLBACK CANNOT SKEW POSITIONS.
        let bus_id = entry.file_name().to_string_lossy().to_string();
        let vram_mb = match vram_by_bus.get(&normalize_pci_bus_id(&bus_id)) {
            Some(v) => *v,
            None => vram_ordered.get(ordered_idx).copied().unwrap_or(0.0),
        };
        ordered_idx += 1;
        gpus.push(GpuInfo {
            device_id: i as u32,
            name,
            vendor_id: 0x10DE,
            vram_mb,
            is_dedicated: true,
            is_integrated: false,
        });
    }
    gpus
}

#[cfg(target_os = "linux")]
fn parse_amd_drm_root(root: &std::path::Path) -> Vec<GpuInfo> {
    // THE OPEN-SOURCE AMDGPU KERNEL DRIVER EXPOSES ONE CARD DIRECTORY PER GPU UNDER
    // /sys/class/drm/card*, AND EACH CARD'S `device/vendor` FILE HOLDS THE PCI VENDOR
    // ID AS A STRING SUCH AS "0x1002" (AMD). NON-AMD CARDS (E.G. NVIDIA 0x10DE OR
    // INTEGRATED INTEL 0x8086) ARE SKIPPED. THE FRIENDLY MODEL NAME IS NOT RELIABLY
    // AVAILABLE VIA SYSFS, SO A GENERIC "AMD Radeon GPU" LABEL IS USED.
    const AMD_VENDOR_ID: u32 = 0x1002;
    let mut gpus = Vec::new();
    let Ok(entries) = std::fs::read_dir(root) else {
        return gpus;
    };
    for (i, entry) in entries.flatten().enumerate() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with("card") {
            continue;
        }
        let device_dir = entry.path().join("device");
        let Ok(vendor_str) = std::fs::read_to_string(device_dir.join("vendor")) else {
            continue;
        };
        let Ok(vendor_id) = u32::from_str_radix(vendor_str.trim().trim_start_matches("0x"), 16) else {
            continue;
        };
        if vendor_id != AMD_VENDOR_ID {
            continue;
        }
        // APUS (INTEGRATED RADEON) SHARE SYSTEM MEMORY AND EXPOSE 0 IN
        // mem_info_vram_total; DISCRETE CARDS REPORT THEIR DEDICATED VRAM. THIS
        // DISTINGUISHES A REAL dGPU FROM AN APU, AND FILLS vram_mb FOR AMD.
        let vram_bytes = std::fs::read_to_string(device_dir.join("mem_info_vram_total"))
            .ok()
            .and_then(|s| s.trim().parse::<u64>().ok())
            .unwrap_or(0);
        let is_dedicated = vram_bytes > 0;
        gpus.push(GpuInfo {
            device_id: i as u32,
            name: "AMD Radeon GPU".to_string(),
            vendor_id,
            vram_mb: (vram_bytes as f64 / (1024.0 * 1024.0 * 1024.0)) * 1024.0,
            is_dedicated,
            is_integrated: !is_dedicated,
        });
    }
    gpus
}

#[cfg(target_os = "macos")]
fn enumerate_system_gpus_inner() -> Vec<GpuInfo> {
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
fn enumerate_system_gpus_inner() -> Vec<GpuInfo> {
    Vec::new()
}

// PUBLIC ENTRY POINT WITH A SHORT-TTL CACHE SO HARDWARE STATUS ROUTES (WHICH CALL
// THIS MULTIPLE TIMES VIA probe_hardware / get_dedicated_gpu) NEVER RE-ENUMERATE OR
// RE-SPAWN `nvidia-smi` ON EVERY REQUEST.
pub fn enumerate_system_gpus() -> Vec<GpuInfo> {
    let mut cache = GPU_ENUM_CACHE.lock().unwrap();
    if let Some((ts, gpus)) = &*cache {
        if ts.elapsed() < GPU_ENUM_CACHE_TTL {
            return gpus.clone();
        }
    }
    let gpus = enumerate_system_gpus_inner();
    *cache = Some((Instant::now(), gpus.clone()));
    gpus
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

    // A GPU BACKEND IS ONLY USABLE IF ITS FEATURE IS COMPILED IN AND ITS RUNTIME
    // HAS NOT ALREADY FAILED TO INITIALIZE (E.G. MISSING CUDA RUNTIME ON LINUX).
    let cuda_usable = cfg!(feature = "cuda") && !CUDA_RUNTIME_FAILED.load(Ordering::Relaxed);
    let coreml_usable = cfg!(feature = "coreml") && !COREML_RUNTIME_FAILED.load(Ordering::Relaxed);

    if env_override == "cpu" || env_override == "none" {
        return (vec!["CPUExecutionProvider".to_string()], "CPU Multi-threaded".to_string());
    }

    // CUDA (NVIDIA) — REQUIRES THE `cuda` FEATURE AND A DETECTED NVIDIA GPU.
    if env_override == "cuda" && cuda_usable {
        if let Some(dgpu) = &dedicated_gpu {
            return (
                vec!["CUDAExecutionProvider".to_string(), "CPUExecutionProvider".to_string()],
                format!("CUDA Dedicated GPU ({})", dgpu.name),
            );
        }
    }

    // CoreML (APPLE SILICON) — REQUIRES THE `coreml` FEATURE AND A DETECTED GPU.
    if env_override == "coreml" && coreml_usable {
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
        if cuda_usable {
            return (
                vec!["CUDAExecutionProvider".to_string(), "CPUExecutionProvider".to_string()],
                format!("CUDA Dedicated GPU ({})", dgpu.name),
            );
        }
        if coreml_usable {
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
    let has_cuda = cfg!(feature = "cuda") && has_dedicated_gpu && !CUDA_RUNTIME_FAILED.load(Ordering::Relaxed);
    let has_coreml = cfg!(feature = "coreml") && has_dedicated_gpu && !COREML_RUNTIME_FAILED.load(Ordering::Relaxed);

    // DETECT AN AMD DEDICATED GPU THAT IS PRESENT BUT NOT ACCELERATING. THE DEFAULT
    // LINUX RELEASE RUNS CPU ON ALL GPUS; NVIDIA CUDA NEEDS A SEPARATE BUILD AND AMD
    // ROCm IS UNSUPPORTED, SO AN AMD GPU MEANS CPU INFERENCE. SURFACE A CLEAR WARNING
    // INSTEAD OF SILENTLY RUNNING THE CPU ENGINE.
    let active_is_cpu = !providers.is_empty() && providers.iter().all(|p| p == "CPUExecutionProvider");
    let amd_gpu = detected_gpus
        .iter()
        .find(|g| g.vendor_id == 0x1002 && g.is_dedicated);
    let amd_warning = if active_is_cpu {
        amd_gpu.map(|g| {
            format!(
                "AMD GPU detected ({}). The default Linux release runs on CPU; NVIDIA CUDA acceleration requires a separate CUDA build, and AMD/ROCm is not yet supported. Running on multi-threaded CPU.",
                g.name
            )
        })
    } else {
        None
    };

    let last_gpu_err = LAST_GPU_ERROR.lock().unwrap().clone();
    let gpu_warning = if let Some(ref err) = last_gpu_err {
        Some(format!(
            "Dedicated GPU was detected, but GPU session initialization failed ({}). Running on multi-threaded CPU.",
            err
        ))
    } else if !dml_active && !detected_gpus.is_empty() && !has_dedicated_gpu {
        Some(format!(
            "Integrated GPU detected ({}). GPU acceleration is disabled to protect against desktop freezing and driver crashes. Running on multi-threaded CPU.",
            detected_gpus[0].name
        ))
    } else {
        amd_warning
    };

    let configured_cuda_vram_limit_mb = *OVERRIDE_CUDA_MEM_LIMIT_MB.lock().unwrap();
    let cuda_vram_limit_mb = Some(get_cuda_gpu_memory_limit() / (1024 * 1024));

    HardwareStatus {
        device_label: label,
        active_provider: providers.first().cloned().unwrap_or_else(|| "CPUExecutionProvider".to_string()),
        providers: providers.clone(),
        // DERIVED FROM THE ACTUAL RUNNABLE PROVIDERS — NOT A HARDCODED CPU LIST
        // (THE OLD VALUE REPORTED CPU EVEN WHILE CUDA SESSIONS WERE RUNNING).
        available_providers: providers.clone(),
        has_cuda,
        has_directml: dml_active,
        // "RAW" CAPABILITY: DIRECTML IS COMPILED IN AND A DEDICATED GPU EXISTS
        // (INDEPENDENT OF THE CURRENT RUNNING PROVIDER — WAS HARDCODED TRUE ON
        // EVERY PLATFORM INCLUDING LINUX, WHERE DIRECTML DOES NOT EXIST).
        has_directml_raw: cfg!(feature = "directml") && has_dedicated_gpu,
        has_coreml,
        has_dedicated_gpu,
        detected_gpus,
        gpu_warning,
        reloading: false,
        cuda_vram_limit_mb,
        configured_cuda_vram_limit_mb,
    }
}

pub fn set_active_provider(mode: &str) -> HardwareStatus {
    let clean = mode.trim().to_lowercase();
    let mut guard = OVERRIDE_DEVICE.lock().unwrap();
    *guard = if clean == "auto" { None } else { Some(clean) };
    drop(guard);
    get_hardware_status()
}

pub fn set_cuda_memory_limit_override(mb: Option<usize>) -> HardwareStatus {
    let mut guard = OVERRIDE_CUDA_MEM_LIMIT_MB.lock().unwrap();
    *guard = mb.filter(|&m| m > 0);
    drop(guard);
    get_hardware_status()
}

/// DETERMINES OPTIMAL CPU INTRA-OP THREADS ADAPTIVELY FOR CONSUMER CPUS (BOUNDED TO MAX 8 TO AVOID THREAD CONTENTION & MULTIPLICATION)
pub fn get_optimal_cpu_threads() -> usize {
    if let Ok(val) = std::env::var("ONNX_THREADS") {
        if let Ok(parsed) = val.parse::<usize>() {
            if parsed > 0 {
                return parsed;
            }
        }
    }
    num_cpus::get().min(8).max(1)
}

/// DETERMINES OPTIMAL GPU MEMORY LIMIT PER ONNX SESSION FOR CUDA EP DYNAMICALLY SCALED BY DETECTED VRAM
pub fn get_cuda_gpu_memory_limit() -> usize {
    // 1. RUNTIME EXPLICIT USER CONFIGURATION FROM SETTINGS UI
    if let Some(limit) = *OVERRIDE_CUDA_MEM_LIMIT_MB.lock().unwrap() {
        if limit > 0 {
            return limit * 1024 * 1024;
        }
    }

    // 2. EXPLICIT ENVIRONMENT VARIABLE OVERRIDE
    if let Ok(val) = std::env::var("ORT_CUDA_MEM_LIMIT_MB") {
        if let Ok(parsed) = val.parse::<usize>() {
            if parsed > 0 {
                return parsed * 1024 * 1024;
            }
        }
    }

    // 3. DYNAMIC VRAM ALLOCATION BASED ON DETECTED DEDICATED GPU HARDWARE:
    // - >= 14 GB VRAM (E.G. 16GB TESLA T4, 16GB-24GB RTX 4080/4090/3090): ALLOCATE 8 GB
    // - >= 7 GB VRAM (E.G. 8GB-12GB RTX 3060/3070/4060/4070): ALLOCATE 6 GB
    // - >= 4 GB VRAM (E.G. 4GB-6GB GTX 1650/1660, RTX 3050): ALLOCATE 80% OF VRAM (MIN 3.2 GB)
    // - FALLBACK / UNKNOWN: ALLOCATE 6 GB (ENSURES 1152px RF-DETR 2XL CONTIGUOUS 2.04GB MATMUL BUFFER FITS CLEANLY)
    if let Some(gpu) = get_dedicated_gpu() {
        if gpu.vram_mb >= 14000.0 {
            return 8 * 1024 * 1024 * 1024;
        } else if gpu.vram_mb >= 7000.0 {
            return 6 * 1024 * 1024 * 1024;
        } else if gpu.vram_mb >= 4000.0 {
            return ((gpu.vram_mb * 0.80) as usize) * 1024 * 1024;
        }
    }

    6 * 1024 * 1024 * 1024
}

#[cfg(target_os = "linux")]
fn query_linux_gpu_telemetry() -> Option<(f64, f64, Option<f64>)> {
    let out = run_with_timeout(
        std::process::Command::new("nvidia-smi")
            .args(["--query-gpu=memory.used,memory.total,utilization.gpu", "--format=csv,noheader,nounits"]),
        Duration::from_millis(800),
    )?;
    if !out.status.success() {
        return None;
    }
    let stdout = String::from_utf8(out.stdout).ok()?;
    let first_line = stdout.lines().next()?;
    let parts: Vec<&str> = first_line.split(',').map(|s| s.trim()).collect();
    if parts.len() >= 2 {
        let used = parts[0].parse::<f64>().ok()?;
        let total = parts[1].parse::<f64>().ok()?;
        let util = parts.get(2).and_then(|s| s.parse::<f64>().ok());
        return Some((used, total, util));
    }
    None
}

#[cfg(target_os = "linux")]
fn query_linux_host_memory() -> HostMemoryTelemetry {
    let Ok(content) = std::fs::read_to_string("/proc/meminfo") else {
        return HostMemoryTelemetry { used_mb: 0.0, total_mb: 0.0 };
    };
    let mut total_kb = 0.0;
    let mut avail_kb = 0.0;
    for line in content.lines() {
        if line.starts_with("MemTotal:") {
            total_kb = line.split_whitespace().nth(1).and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
        } else if line.starts_with("MemAvailable:") {
            avail_kb = line.split_whitespace().nth(1).and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
        }
    }
    let total_mb = total_kb / 1024.0;
    let used_mb = (total_kb - avail_kb).max(0.0) / 1024.0;
    HostMemoryTelemetry {
        used_mb: (used_mb * 10.0).round() / 10.0,
        total_mb: (total_mb * 10.0).round() / 10.0,
    }
}

#[cfg(windows)]
fn query_windows_host_memory() -> HostMemoryTelemetry {
    #[repr(C)]
    struct MemoryStatusEx {
        dw_length: u32,
        dw_memory_load: u32,
        ull_total_phys: u64,
        ull_avail_phys: u64,
        ull_total_page_file: u64,
        ull_avail_page_file: u64,
        ull_total_virtual: u64,
        ull_avail_virtual: u64,
        ull_avail_extended_virtual: u64,
    }

    extern "system" {
        fn GlobalMemoryStatusEx(stat: *mut MemoryStatusEx) -> i32;
    }

    let mut stat = MemoryStatusEx {
        dw_length: std::mem::size_of::<MemoryStatusEx>() as u32,
        dw_memory_load: 0,
        ull_total_phys: 0,
        ull_avail_phys: 0,
        ull_total_page_file: 0,
        ull_avail_page_file: 0,
        ull_total_virtual: 0,
        ull_avail_virtual: 0,
        ull_avail_extended_virtual: 0,
    };

    unsafe {
        if GlobalMemoryStatusEx(&mut stat) != 0 {
            let total_mb = (stat.ull_total_phys as f64) / (1024.0 * 1024.0);
            let avail_mb = (stat.ull_avail_phys as f64) / (1024.0 * 1024.0);
            let used_mb = (total_mb - avail_mb).max(0.0);
            return HostMemoryTelemetry {
                used_mb: (used_mb * 10.0).round() / 10.0,
                total_mb: (total_mb * 10.0).round() / 10.0,
            };
        }
    }

    HostMemoryTelemetry { used_mb: 0.0, total_mb: 0.0 }
}

/// QUERIES REAL-TIME SYSTEM TELEMETRY (GPU VRAM, HOST RAM, CPU CORES, ENGINE QUEUE DEPTH)
pub fn get_system_telemetry(active_jobs: usize, queued_jobs: usize) -> SystemTelemetry {
    let (providers, _) = probe_hardware();
    let dedicated_gpu = get_dedicated_gpu();
    let active_provider = providers.first().cloned().unwrap_or_else(|| "CPUExecutionProvider".to_string());

    let mut gpu_telemetry = None;
    if let Some(gpu) = dedicated_gpu {
        #[allow(unused_mut)]
        let mut used_mb: f64 = 0.0;
        #[allow(unused_mut)]
        let mut total_mb: f64 = gpu.vram_mb;
        #[allow(unused_mut)]
        let mut util_pct = None;

        #[cfg(target_os = "linux")]
        {
            if let Some((u, t, util)) = query_linux_gpu_telemetry() {
                used_mb = u;
                if t > 0.0 {
                    total_mb = t;
                }
                util_pct = util;
            }
        }

        gpu_telemetry = Some(GpuTelemetry {
            name: gpu.name,
            vram_used_mb: (used_mb * 10.0).round() / 10.0,
            vram_total_mb: (total_mb * 10.0).round() / 10.0,
            utilization_pct: util_pct,
            active_provider: active_provider.clone(),
        });
    }

    #[cfg(target_os = "linux")]
    let host_memory = query_linux_host_memory();

    #[cfg(windows)]
    let host_memory = query_windows_host_memory();

    #[cfg(not(any(target_os = "linux", windows)))]
    let host_memory = HostMemoryTelemetry { used_mb: 0.0, total_mb: 0.0 };

    let timestamp_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    SystemTelemetry {
        gpu: gpu_telemetry,
        host_memory,
        cpu: CpuTelemetry {
            cores: num_cpus::get(),
            utilization_pct: None,
        },
        queue: EngineQueueTelemetry {
            active_jobs,
            queued_jobs,
        },
        timestamp_ms,
    }
}

/// DETERMINES OPTIMAL HOST THREADS FOR GPU SESSIONS (AVOIDS HOST-CPU CONTENTION WITH GPU DRIVER)
pub fn get_optimal_gpu_host_threads() -> usize {
    if let Ok(val) = std::env::var("ONNX_GPU_THREADS") {
        if let Ok(parsed) = val.parse::<usize>() {
            if parsed > 0 {
                return parsed;
            }
        }
    }
    num_cpus::get().min(4).max(1)
}

/// CROSS-PLATFORM PROCESS WORKING-SET AND HEAP MEMORY RECLAMATION.
/// ON WINDOWS, EMPTIES UNREFERENCED WORKING-SET PAGES BACK TO THE OS.
/// ON LINUX, INVOKES malloc_trim IF AVAILABLE.
pub fn trim_process_memory() {
    #[cfg(windows)]
    {
        extern "system" {
            fn GetCurrentProcess() -> *mut std::ffi::c_void;
            fn K32EmptyWorkingSet(hProcess: *mut std::ffi::c_void) -> i32;
        }
        unsafe {
            let handle = GetCurrentProcess();
            let _ = K32EmptyWorkingSet(handle);
        }
    }

    #[cfg(target_os = "linux")]
    {
        extern "C" {
            fn malloc_trim(pad: usize) -> i32;
        }
        unsafe {
            let _ = malloc_trim(0);
        }
    }
}

/// CREATES AN ONNX RUNTIME SESSION FROM BYTES USING THE ACTIVE HARDWARE ACCELERATOR
/// (CUDA, COREML, OR DIRECTML FOR DEDICATED GPUS, WITH AUTOMATIC, GRACEFUL FALLBACK TO MULTI-THREADED CPU).
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
                    .with_intra_threads(get_optimal_gpu_host_threads())
                    .map_err(|e| anyhow::anyhow!("Intra threads error: {}", e))?
                    .with_optimization_level(GraphOptimizationLevel::Level3)
                    .map_err(|e| anyhow::anyhow!("Opt level error: {}", e))?
                    .with_memory_pattern(false)
                    .map_err(|e| anyhow::anyhow!("Memory pattern error: {}", e))?
                    .with_config_entry("session.enable_cpu_mem_arena", "0")
                    .map_err(|e| anyhow::anyhow!("Config entry error: {}", e))?
                    .with_execution_providers([
                        ort::ep::CUDA::default()
                            .with_arena_extend_strategy(ort::ep::ArenaExtendStrategy::NextPowerOfTwo)
                            .with_memory_limit(get_cuda_gpu_memory_limit())
                            .build()
                    ])
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
                    CUDA_RUNTIME_FAILED.store(true, Ordering::Relaxed);
                    *LAST_GPU_ERROR.lock().unwrap() = Some(format!("CUDA init error: {}", e));
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
                    .with_intra_threads(get_optimal_gpu_host_threads())
                    .map_err(|e| anyhow::anyhow!("Intra threads error: {}", e))?
                    .with_optimization_level(GraphOptimizationLevel::Level3)
                    .map_err(|e| anyhow::anyhow!("Opt level error: {}", e))?
                    .with_memory_pattern(false)
                    .map_err(|e| anyhow::anyhow!("Memory pattern error: {}", e))?
                    .with_config_entry("session.enable_cpu_mem_arena", "0")
                    .map_err(|e| anyhow::anyhow!("Config entry error: {}", e))?
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
                    COREML_RUNTIME_FAILED.store(true, Ordering::Relaxed);
                    *LAST_GPU_ERROR.lock().unwrap() = Some(format!("CoreML init error: {}", e));
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
                    .with_intra_threads(get_optimal_gpu_host_threads())
                    .map_err(|e| anyhow::anyhow!("Intra threads error: {}", e))?
                    .with_optimization_level(GraphOptimizationLevel::Level3)
                    .map_err(|e| anyhow::anyhow!("Opt level error: {}", e))?
                    .with_memory_pattern(false)
                    .map_err(|e| anyhow::anyhow!("Memory pattern error: {}", e))?
                    .with_config_entry("session.enable_cpu_mem_arena", "0")
                    .map_err(|e| anyhow::anyhow!("Config entry error: {}", e))?
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
                    *LAST_GPU_ERROR.lock().unwrap() = Some(format!("DirectML init error: {}", e));
                    tracing::warn!(
                        "Failed to initialize ONNX model '{}' with DirectML ({}); falling back to CPU multi-threaded.",
                        model_tag, e
                    );
                }
            }
        }
    }

    // CPU multi-threaded session with Level 3 graph optimization, zero persistent arena, and direct mimalloc backing
    tracing::debug!("Initializing ONNX model '{}' with CPU execution provider.", model_tag);
    let session = Session::builder()
        .map_err(|e| anyhow::anyhow!("Session builder error: {}", e))?
        .with_intra_threads(get_optimal_cpu_threads())
        .map_err(|e| anyhow::anyhow!("Session intra threads error: {}", e))?
        .with_optimization_level(GraphOptimizationLevel::Level3)
        .map_err(|e| anyhow::anyhow!("Session optimization level error: {}", e))?
        .with_memory_pattern(false)
        .map_err(|e| anyhow::anyhow!("Memory pattern error: {}", e))?
        .with_config_entry("session.enable_cpu_mem_arena", "0")
        .map_err(|e| anyhow::anyhow!("Config entry error: {}", e))?
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

        let gpus = parse_nvidia_gpu_root(tmp.path(), &HashMap::new(), &[]);
        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].name, "NVIDIA GeForce RTX 3080");
        assert!(gpus[0].is_dedicated);
        assert_eq!(gpus[0].vendor_id, 0x10DE);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn returns_empty_when_no_nvidia_driver() {
        let tmp = tempfile::tempdir().unwrap();
        let gpus = parse_nvidia_gpu_root(tmp.path(), &HashMap::new(), &[]);
        assert!(gpus.is_empty());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn nvidia_vram_matches_by_bus_id() {
        let tmp = tempfile::tempdir().unwrap();
        let gpu_dir = tmp.path().join("0000:01:00.0");
        std::fs::create_dir_all(&gpu_dir).unwrap();
        std::fs::write(gpu_dir.join("information"), "Model: NVIDIA GeForce RTX 4090\n").unwrap();

        let mut by_bus = HashMap::new();
        by_bus.insert("0000:01:00.0".to_string(), 24564.0);
        let gpus = parse_nvidia_gpu_root(tmp.path(), &by_bus, &[]);
        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].vram_mb, 24564.0);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn nvidia_vram_matches_8_hex_domain_bus_id() {
        // nvidia-smi EMITS THE FULL 8-HEX DOMAIN; THE /proc DIR NAME IS 4-HEX.
        // THE NORMALIZED KEY MUST STILL MATCH, OR THE FALLBACK MISASSIGNS VRAM.
        let tmp = tempfile::tempdir().unwrap();
        let gpu_dir = tmp.path().join("0000:01:00.0");
        std::fs::create_dir_all(&gpu_dir).unwrap();
        std::fs::write(gpu_dir.join("information"), "Model: NVIDIA GeForce RTX 4090\n").unwrap();

        let mut by_bus = HashMap::new();
        by_bus.insert("00000000:01:00.0".to_string(), 24564.0);
        let gpus = parse_nvidia_gpu_root(tmp.path(), &by_bus, &[]);
        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].vram_mb, 24564.0);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn normalize_pci_bus_id_strips_domain_leading_zeroes() {
        assert_eq!(normalize_pci_bus_id("00000000:01:00.0"), "0:01:00.0");
        assert_eq!(normalize_pci_bus_id("0000:01:00.0"), "0:01:00.0");
        assert_eq!(normalize_pci_bus_id("0000:21:00.1"), "0:21:00.1");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn parses_amd_gpu_from_drm_root() {
        let tmp = tempfile::tempdir().unwrap();
        let card_dir = tmp.path().join("card0").join("device");
        std::fs::create_dir_all(&card_dir).unwrap();
        std::fs::write(card_dir.join("vendor"), "0x1002\n").unwrap();
        std::fs::write(card_dir.join("device"), "0x73c1\n").unwrap();
        std::fs::write(card_dir.join("mem_info_vram_total"), "8589934592\n").unwrap();

        let gpus = parse_amd_drm_root(tmp.path());
        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].vendor_id, 0x1002);
        assert!(gpus[0].is_dedicated);
        assert!(!gpus[0].is_integrated);
        // 8589934592 BYTES == 8192 MiB
        assert!((gpus[0].vram_mb - 8192.0).abs() < 0.001);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn amd_apu_without_vram_is_integrated() {
        let tmp = tempfile::tempdir().unwrap();
        let card_dir = tmp.path().join("card0").join("device");
        std::fs::create_dir_all(&card_dir).unwrap();
        std::fs::write(card_dir.join("vendor"), "0x1002\n").unwrap();
        std::fs::write(card_dir.join("mem_info_vram_total"), "0\n").unwrap();

        let gpus = parse_amd_drm_root(tmp.path());
        assert_eq!(gpus.len(), 1);
        assert!(!gpus[0].is_dedicated);
        assert!(gpus[0].is_integrated);
        assert_eq!(gpus[0].vram_mb, 0.0);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn amd_drm_root_skips_non_amd_cards() {
        let tmp = tempfile::tempdir().unwrap();
        let nvidia_card = tmp.path().join("card0").join("device");
        std::fs::create_dir_all(&nvidia_card).unwrap();
        std::fs::write(nvidia_card.join("vendor"), "0x10de\n").unwrap();

        let gpus = parse_amd_drm_root(tmp.path());
        assert!(gpus.is_empty());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn amd_gpu_present_but_cpu_active_emits_warning() {
        // FORCE CPU SO THE WARNING BRANCH IS UNMISSABLE REGARDLESS OF HOST GPU.
        let status = set_active_provider("cpu");
        let has_amd = status
            .detected_gpus
            .iter()
            .any(|g| g.vendor_id == 0x1002 && g.is_dedicated);
        if has_amd {
            assert!(status.gpu_warning.is_some());
            let warning = status.gpu_warning.as_deref().unwrap_or_default();
            assert!(warning.contains("AMD"), "expected AMD in warning, got: {}", warning);
        }
        // RESTORE AUTO SO LATER TESTS (E.G. /health, /system/hardware) ARE UNAFFECTED.
        let _ = set_active_provider("auto");
    }

    #[test]
    fn hardware_status_derives_available_providers_from_providers() {
        // FAULT B REGRESSION: available_providers MUST MIRROR THE ACTUAL RUNNABLE
        // PROVIDERS (E.G. [CUDA, CPU]) — NEVER A HARDCODED CPU-ONLY LIST.
        let status = get_hardware_status();
        assert_eq!(status.available_providers, status.providers);
        assert!(!status.available_providers.is_empty());
        assert_eq!(status.active_provider, status.providers.first().cloned().unwrap_or_default());
    }

    #[test]
    fn hardware_status_directml_raw_tracks_feature_and_dedicated_gpu() {
        // FAULT B REGRESSION: has_directml_raw MUST BE FALSE WITHOUT THE directml
        // FEATURE (THE OLD CODE HARDCODED true ON EVERY PLATFORM, INCLUDING LINUX).
        let status = get_hardware_status();
        assert_eq!(status.has_directml_raw, cfg!(feature = "directml") && status.has_dedicated_gpu);
    }

    #[test]
    fn cuda_memory_limit_scales_dynamically_and_honors_env() {
        // 1. DEFAULT LIMIT MUST BE AT LEAST 6GB (PREVENTS 1152px RF-DETR 2XL 2.04GB MATMUL OOM)
        let default_limit = get_cuda_gpu_memory_limit();
        assert!(
            default_limit >= 6 * 1024 * 1024 * 1024,
            "Default CUDA memory limit must be at least 6GB to prevent RF-DETR 2XL OOM, got: {} bytes",
            default_limit
        );

        // 2. EXPLICIT ENV OVERRIDE MUST BE HONORED
        unsafe {
            std::env::set_var("ORT_CUDA_MEM_LIMIT_MB", "10240");
        }
        let env_limit = get_cuda_gpu_memory_limit();
        assert_eq!(env_limit, 10240 * 1024 * 1024);
        unsafe {
            std::env::remove_var("ORT_CUDA_MEM_LIMIT_MB");
        }

        // 3. RUNTIME EXPLICIT USER OVERRIDE OVERRULES ENV VAR
        let status = set_cuda_memory_limit_override(Some(12288));
        assert_eq!(status.configured_cuda_vram_limit_mb, Some(12288));
        assert_eq!(status.cuda_vram_limit_mb, Some(12288));
        assert_eq!(get_cuda_gpu_memory_limit(), 12288 * 1024 * 1024);

        // 4. RESET TO AUTO RESTORES ADAPTIVE ALLOCATION
        let reset_status = set_cuda_memory_limit_override(None);
        assert_eq!(reset_status.configured_cuda_vram_limit_mb, None);
        assert!(reset_status.cuda_vram_limit_mb.unwrap_or(0) >= 6144);
    }

    #[test]
    fn system_telemetry_returns_valid_metrics() {
        let telemetry = get_system_telemetry(1, 2);
        assert!(telemetry.cpu.cores >= 1);
        assert_eq!(telemetry.queue.active_jobs, 1);
        assert_eq!(telemetry.queue.queued_jobs, 2);
        assert!(telemetry.timestamp_ms > 0);
    }
}
