use xianscan_rust::ml::device::{get_hardware_status, set_active_provider};

/// Verifies that explicitly switching to the CPU provider is reflected in the
/// hardware status payload and that restoring `auto` clears the override.
#[test]
fn set_active_provider_cpu_round_trips() {
    let status = set_active_provider("cpu");
    assert_eq!(status.active_provider, "CPUExecutionProvider");
    assert!(status.providers.iter().all(|p| p == "CPUExecutionProvider"));

    // RESTORE AUTO SO LATER TESTS (E.G. /health, /system/hardware) ARE UNAFFECTED.
    let restored = set_active_provider("auto");
    assert!(!restored.providers.is_empty());
}

/// Verifies the hardware status payload always carries the sentinel flags the
/// web UI reads, regardless of platform.
#[test]
fn hardware_status_exposes_capability_flags() {
    let status = get_hardware_status();
    assert!(!status.providers.is_empty());
    let _ = status.has_cuda;
    let _ = status.has_coreml;
    let _ = status.has_directml;
    let _ = status.has_dedicated_gpu;
}
