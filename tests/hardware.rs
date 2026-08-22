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

#[test]
fn profile_engine_memory() {
    #[cfg(windows)]
    {
        use std::mem::MaybeUninit;
        #[repr(C)]
        #[allow(non_snake_case)]
        struct PROCESS_MEMORY_COUNTERS {
            cb: u32,
            PageFaultCount: u32,
            PeakWorkingSetSize: usize,
            WorkingSetSize: usize,
            QuotaPeakPagedPoolUsage: usize,
            QuotaPagedPoolUsage: usize,
            QuotaPeakNonPagedPoolUsage: usize,
            QuotaNonPagedPoolUsage: usize,
            PagefileUsage: usize,
            PeakPagefileUsage: usize,
        }

        extern "system" {
            fn GetCurrentProcess() -> *mut std::ffi::c_void;
            fn K32GetProcessMemoryInfo(
                hProcess: *mut std::ffi::c_void,
                ppsmc: *mut PROCESS_MEMORY_COUNTERS,
                cb: u32,
            ) -> i32;
        }

        fn get_mem() -> (f64, f64) {
            unsafe {
                let mut pmc = MaybeUninit::<PROCESS_MEMORY_COUNTERS>::uninit();
                let cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
                let handle = GetCurrentProcess();
                if K32GetProcessMemoryInfo(handle, pmc.as_mut_ptr(), cb) != 0 {
                    let pmc = pmc.assume_init();
                    let ws_mb = (pmc.WorkingSetSize as f64) / (1024.0 * 1024.0);
                    let private_mb = (pmc.PagefileUsage as f64) / (1024.0 * 1024.0);
                    return (ws_mb, private_mb);
                }
            }
            (0.0, 0.0)
        }

        let (ws0, priv0) = get_mem();
        println!("\n[MEM PROFILE] Baseline: WS = {:.2} MB, Private = {:.2} MB", ws0, priv0);

        let models_dir = std::path::Path::new("models");
        println!("[MEM PROFILE] Initializing PipelineEngine...");
        let mut engine = xianscan_rust::pipeline::PipelineEngine::new(models_dir);
        let (ws1, priv1) = get_mem();
        println!(
            "[MEM PROFILE] After PipelineEngine::new: WS = {:.2} MB (+{:.2} MB), Private = {:.2} MB (+{:.2} MB)",
            ws1, ws1 - ws0, priv1, priv1 - priv0
        );

        // CREATE A TEST IMAGE (1024x1536) TO SIMULATE A FULL WEBTOON/MANGA PAGE
        let test_img = image::DynamicImage::new_rgb8(1024, 1536);
        println!("[MEM PROFILE] Running analyze_image...");
        let _ = engine.analyze_image(&test_img);
        let (ws2, priv2) = get_mem();
        println!(
            "[MEM PROFILE] After analyze_image: WS = {:.2} MB (+{:.2} MB), Private = {:.2} MB (+{:.2} MB)",
            ws2, ws2 - ws1, priv2, priv2 - priv1
        );

        println!("[MEM PROFILE] Running clean_image (patch)...");
        let mask = image::ImageBuffer::new(1024, 1536);
        if let Some(ref mut inpainter) = engine.inpainter {
            let _ = inpainter.inpaint_scaled_mode(&test_img, &mask, 512);
            let (ws3, priv3) = get_mem();
            println!(
                "[MEM PROFILE] After LaMa scaled 512: WS = {:.2} MB (+{:.2} MB), Private = {:.2} MB (+{:.2} MB)",
                ws3, ws3 - ws2, priv3, priv3 - priv2
            );

            let _ = inpainter.inpaint_full_mode(&test_img, &mask);
            let (ws4, priv4) = get_mem();
            println!(
                "[MEM PROFILE] After LaMa full dynamic: WS = {:.2} MB (+{:.2} MB), Private = {:.2} MB (+{:.2} MB)",
                ws4, ws4 - ws3, priv4, priv4 - priv3
            );
        }

        // TEST WORKING SET TRIMMING WHILE ENGINE STAYS ALIVE (IDLE STATE)
        extern "system" {
            fn K32EmptyWorkingSet(hProcess: *mut std::ffi::c_void) -> i32;
        }
        unsafe {
            K32EmptyWorkingSet(GetCurrentProcess());
        }
        let (ws_trimmed, priv_trimmed) = get_mem();
        println!(
            "[MEM PROFILE] While engine is STILL ALIVE (after trim/idle): WS = {:.2} MB, Private = {:.2} MB",
            ws_trimmed, priv_trimmed
        );

        drop(engine);
        let (ws_end, priv_end) = get_mem();
        println!(
            "[MEM PROFILE] After drop(engine): WS = {:.2} MB, Private = {:.2} MB",
            ws_end, priv_end
        );
    }
}


