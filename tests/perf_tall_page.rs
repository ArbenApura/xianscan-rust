// TALL-PAGE MEMORY AND TIME BASELINE (FEAT-004 PHASE 1).
// EVERY TEST IS #[ignore]: RUN ONE SCENARIO PER PROCESS (PEAK RSS IS PER PROCESS), IN RELEASE, BY NAME:
//   cargo test --release --test perf_tall_page perf_tall_analyze_native -- --ignored --nocapture
// EACH TEST PRINTS ONE `PERF ...` LINE FOR docs/features/ml-pipeline-memory-and-geometry/PROGRESS.md.
// THE CANVAS LIVES IN MEMORY ONLY; FIXTURES ARE NEVER RESIZED OR WRITTEN.
mod common;

use std::collections::BTreeMap;
use std::time::Instant;

use image::{DynamicImage, GenericImageView};
use xianscan_rust::ml::intake::IntakeLimits;
use xianscan_rust::ml::schemas::{AnalyzeOptions, AnalyzeResponse, CleanRequestRegion};
use xianscan_rust::pipeline::PipelineEngine;

// -- MEMORY -- //

#[cfg(windows)]
fn peak_rss_mb() -> f64 {
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
        fn K32GetProcessMemoryInfo(hProcess: *mut std::ffi::c_void, ppsmc: *mut PROCESS_MEMORY_COUNTERS, cb: u32) -> i32;
    }
    unsafe {
        let mut pmc = MaybeUninit::<PROCESS_MEMORY_COUNTERS>::uninit();
        let cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
        if K32GetProcessMemoryInfo(GetCurrentProcess(), pmc.as_mut_ptr(), cb) != 0 {
            pmc.assume_init().PeakWorkingSetSize as f64 / (1024.0 * 1024.0)
        } else {
            f64::NAN
        }
    }
}

#[cfg(target_os = "linux")]
fn peak_rss_mb() -> f64 {
    std::fs::read_to_string("/proc/self/status")
        .ok()
        .and_then(|s| {
            s.lines()
                .find(|l| l.starts_with("VmHWM:"))
                .and_then(|l| l.split_whitespace().nth(1).and_then(|kb| kb.parse::<f64>().ok()))
        })
        .map(|kb| kb / 1024.0)
        .unwrap_or(f64::NAN)
}

// MACOS: MEASURE EXTERNALLY WITH `/usr/bin/time -l` (SEE PLAN PHASE 1)
#[cfg(not(any(windows, target_os = "linux")))]
fn peak_rss_mb() -> f64 {
    f64::NAN
}

// -- CANVAS -- //

/// A TALL CANVAS OF EXACTLY `target_h` ROWS BUILT FROM THE LARGEST SAME-WIDTH GROUP OF KOREAN FIXTURE PAGES, OR A
/// SYNTHETIC ONE WHEN NO FIXTURES EXIST. RETURNS (CANVAS, SOURCE LABEL).
fn build_tall_canvas(target_h: u32) -> (DynamicImage, &'static str) {
    let mut groups: BTreeMap<u32, Vec<DynamicImage>> = BTreeMap::new();
    if let Some(dataset) = common::get_dataset_dir() {
        if let Ok(entries) = std::fs::read_dir(dataset.join("ko")) {
            let mut names: Vec<String> = entries.flatten().filter_map(|e| e.file_name().into_string().ok()).collect();
            names.sort();
            for name in names {
                if let Some(img) = common::load_fixture_or_skip("ko", &name) {
                    groups.entry(img.width()).or_default().push(img);
                }
            }
        }
    }
    let largest = groups.into_values().max_by_key(|g| g.len()).unwrap_or_default();
    let (pages, source) = if largest.is_empty() {
        let page = common::generate_synthetic_bubble_image(690, 2200, 120, 300, 420, 260);
        (vec![page], "SYNTHETIC")
    } else {
        (largest, "fixture")
    };
    let mut parts = Vec::new();
    let mut h = 0;
    while h < target_h {
        for p in &pages {
            if h >= target_h {
                break;
            }
            h += p.height();
            parts.push(p.clone());
        }
    }
    let stitched = xianscan_rust::ml::reslice::stitch_images_vertically(&parts, &IntakeLimits::default()).expect("stitch canvas");
    (stitched.crop_imm(0, 0, stitched.width(), target_h), source)
}

fn native_page() -> Option<DynamicImage> {
    common::load_fixture_or_skip("ko", "page_dull_ending_black_bubble.webp")
}

fn models_present() -> bool {
    std::path::Path::new("models").join("PP-OCRv6_rec_small.onnx").exists()
}

fn ko_options() -> AnalyzeOptions {
    AnalyzeOptions { source_lang: Some("ko".to_string()), ..Default::default() }
}

fn median(mut v: Vec<f64>) -> f64 {
    v.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    v[v.len() / 2]
}

fn provider_label() -> String {
    xianscan_rust::ml::device::get_hardware_status().active_provider
}

fn report(scenario: &str, canvas: &DynamicImage, source: &str, wall_ms: f64, res: Option<&AnalyzeResponse>, regions: usize) {
    let stats = res.and_then(|r| r.stats.as_ref());
    let (det, ocr, build) = stats.map(|s| (s.detector_time_ms, s.ocr_fullpage_time_ms, s.assembly_time_ms)).unwrap_or((0.0, 0.0, 0.0));
    let (w, h) = canvas.dimensions();
    println!(
        "PERF scenario={scenario} canvas={w}x{h} source={source} wall_ms={wall_ms:.0} detector_ms={det:.0} ocr_ms={ocr:.0} build_ms={build:.0} peak_rss_mb={:.0} regions={regions} provider={}",
        peak_rss_mb(),
        provider_label()
    );
}

/// WARM UP ON A SMALL PAGE (ENGINE LOAD AND ORT GRAPH INIT STAY OUT OF THE MEASUREMENT).
fn warm_engine() -> PipelineEngine {
    let mut engine = PipelineEngine::new("models");
    let small = common::generate_synthetic_bubble_image(690, 1000, 120, 300, 420, 260);
    let _ = xianscan_rust::pipeline::analyzer::analyze_image_with_options(&mut engine, &small, Some(&ko_options()));
    engine
}

fn run_analyze(scenario: &str, canvas: DynamicImage, source: &str) {
    let mut engine = warm_engine();
    let mut times = Vec::new();
    let mut last = None;
    for _ in 0..3 {
        let t = Instant::now();
        let res = xianscan_rust::pipeline::analyzer::analyze_image_with_options(&mut engine, &canvas, Some(&ko_options())).expect("analyze");
        times.push(t.elapsed().as_secs_f64() * 1000.0);
        last = Some(res);
    }
    let regions = last.as_ref().map(|r| r.regions.len()).unwrap_or(0);
    report(scenario, &canvas, source, median(times), last.as_ref(), regions);
}

fn clean_regions(res: &AnalyzeResponse) -> Vec<CleanRequestRegion> {
    res.regions
        .iter()
        .map(|r| CleanRequestRegion {
            id: r.id.clone(),
            box_: Some(r.box_.clone()),
            polygon: Some(r.polygon.clone()),
            bubble_box: r.bubble_box.clone(),
        })
        .collect()
}

fn run_clean(scenario: &str, mode: &str, runs: usize) {
    if !models_present() {
        eprintln!("[INFO] Skipping {scenario}: models not found");
        return;
    }
    let (canvas, source) = build_tall_canvas(20_000);
    let mut engine = warm_engine();
    let analyzed = xianscan_rust::pipeline::analyzer::analyze_image_with_options(&mut engine, &canvas, Some(&ko_options())).expect("analyze");
    let regions = clean_regions(&analyzed);
    let small = common::generate_synthetic_bubble_image(690, 1000, 120, 300, 420, 260);
    let _ = engine.clean_image(&small, &[], mode, true);
    let mut times = Vec::new();
    for _ in 0..runs {
        let t = Instant::now();
        let out = engine.clean_image(&canvas, &regions, mode, true);
        times.push(t.elapsed().as_secs_f64() * 1000.0);
        if let Err(e) = out {
            println!("PERF scenario={scenario} canvas={}x{} source={source} result=error error={e}", canvas.width(), canvas.height());
            return;
        }
    }
    report(scenario, &canvas, source, median(times), None, regions.len());
}

// -- SCENARIOS -- //

#[test]
#[ignore]
fn perf_tall_analyze_native() {
    let Some(page) = native_page() else {
        eprintln!("[INFO] Skipping perf_tall_analyze_native: fixture missing");
        return;
    };
    if !models_present() {
        eprintln!("[INFO] Skipping perf_tall_analyze_native: models not found");
        return;
    }
    run_analyze("analyze_native", page, "fixture");
}

#[test]
#[ignore]
fn perf_tall_analyze_20000() {
    if !models_present() {
        eprintln!("[INFO] Skipping perf_tall_analyze_20000: models not found");
        return;
    }
    let (canvas, source) = build_tall_canvas(20_000);
    run_analyze("analyze_20000", canvas, source);
}

#[test]
#[ignore]
fn perf_tall_clean_patch_20000() {
    run_clean("clean_patch_20000", "patch", 3);
}

#[test]
#[ignore]
fn perf_tall_clean_scaled_20000() {
    run_clean("clean_scaled_20000", "scaled", 3);
}

// EXPECTED TO CRASH OR RUN OUT OF MEMORY ON THE BASE COMMIT. RUN IT LAST, WITH A TIMEOUT, ONE RUN ONLY.
#[test]
#[ignore]
fn perf_tall_clean_full_20000() {
    run_clean("clean_full_20000", "full", 1);
}

#[test]
#[ignore]
fn perf_tall_reslice_40000() {
    if !models_present() {
        eprintln!("[INFO] Skipping perf_tall_reslice_40000: models not found");
        return;
    }
    let (canvas, source) = build_tall_canvas(40_000);
    let mut engine = warm_engine();
    let limits = IntakeLimits::default();
    let mut times = Vec::new();
    let mut slices = 0;
    for run in 0..3 {
        let t = Instant::now();
        let out = xianscan_rust::ml::reslice::smart_reslice_chapter(
            std::slice::from_ref(&canvas),
            1600,
            1200,
            2000,
            engine.detector.as_mut(),
            engine.ocr.as_mut(),
            None,
            None,
            run + 1,
            &limits,
        )
        .expect("reslice");
        times.push(t.elapsed().as_secs_f64() * 1000.0);
        slices = out.len();
    }
    report("reslice_40000", &canvas, source, median(times), None, slices);
}

// -- TILING A/B (FEAT-004 PHASE 5) -- //

/// FOR EVERY ko AND zh_hans FIXTURE WITH h > 2 * w: THE LIVE DETECTOR WITH TILING OFF, THEN ON. WRITES BOTH BOX LISTS
/// TO target/perf/tiling_ab/<case>.json (NEVER INTO THE FIXTURES) AND PRINTS ONE `AB ...` LINE PER CASE. lost COUNTS
/// OFF-BOXES WITHOUT AN ON-BOX AT IoU >= 0.5; new COUNTS THE REVERSE.
#[test]
#[ignore]
fn ab_detector_tiling_on_tall_fixtures() {
    use xianscan_rust::ml::detect::tiling::TilingConfig;
    use xianscan_rust::ml::detect::{ComicTextDetector, DetectResult};
    use xianscan_rust::ml::geometry::box_iou;
    use xianscan_rust::ml::schemas::BoxRect;
    let Some(dataset) = common::get_dataset_dir() else {
        eprintln!("[INFO] Skipping ab_detector_tiling_on_tall_fixtures: no private dataset");
        return;
    };
    let Ok(mut det) = ComicTextDetector::new("models/rfdetr-seg-2xlarge.onnx") else {
        eprintln!("[INFO] Skipping ab_detector_tiling_on_tall_fixtures: detector model not found");
        return;
    };
    let out_dir = std::path::Path::new("target/perf/tiling_ab");
    std::fs::create_dir_all(out_dir).expect("create A/B dir");
    let all = |r: &DetectResult| -> Vec<BoxRect> {
        r.bubbles
            .iter()
            .cloned()
            .chain(r.text_bubbles.iter().map(|(b, _)| b.clone()))
            .chain(r.text_free.iter().map(|(b, _)| b.clone()))
            .chain(r.onomatopoeia.iter().map(|(b, _)| b.clone()))
            .collect()
    };
    let (mut total_lost, mut total_new, mut cases) = (0, 0, 0);
    for lang in ["ko", "zh_hans"] {
        let Ok(entries) = std::fs::read_dir(dataset.join(lang)) else { continue };
        let mut names: Vec<String> = entries.flatten().filter_map(|e| e.file_name().into_string().ok()).collect();
        names.sort();
        for name in names {
            let Some(img) = common::load_fixture_or_skip(lang, &name) else { continue };
            if img.height() <= 2 * img.width() {
                continue;
            }
            det.set_tiling(TilingConfig::disabled());
            let t = Instant::now();
            let off = det.detect(&img).expect("detect off");
            let ms_off = t.elapsed().as_secs_f64() * 1000.0;
            det.set_tiling(TilingConfig::recommended());
            let t = Instant::now();
            let on = det.detect(&img).expect("detect on");
            let ms_on = t.elapsed().as_secs_f64() * 1000.0;
            let (a, b) = (all(&off), all(&on));
            let lost = a.iter().filter(|x| !b.iter().any(|y| box_iou(x, y) >= 0.5)).count();
            let new = b.iter().filter(|y| !a.iter().any(|x| box_iou(x, y) >= 0.5)).count();
            total_lost += lost;
            total_new += new;
            cases += 1;
            let tiles = det.plan_for(img.width(), img.height()).len();
            println!(
                "AB case={lang}/{name} size={}x{} tiles={tiles} off_boxes={} on_boxes={} new={new} lost={lost} ms_off={ms_off:.0} ms_on={ms_on:.0}",
                img.width(),
                img.height(),
                a.len(),
                b.len()
            );
            let dump = |v: &[BoxRect]| v.iter().map(|r| [r.x, r.y, r.w, r.h]).collect::<Vec<_>>();
            let json = serde_json::json!({ "off": dump(&a), "on": dump(&b) });
            let _ = std::fs::write(out_dir.join(format!("{lang}__{name}.json")), json.to_string());
        }
    }
    println!("AB summary cases={cases} new={total_new} lost={total_lost}");
}

// -- PER-MODEL LOCKS (FEAT-004 PHASE 10) -- //

/// A RESLICE OF A 40000 PX CANVAS RUNS ON ONE THREAD; A 256x256 CLEAN ON ANOTHER MUST FINISH IN SECONDS, NOT AFTER THE
/// RESLICE (CLEAN TAKES ONLY THE INPAINTER LOCK; RESLICE LOCKS OCR PER WINDOW).
#[test]
#[ignore]
fn concurrency_clean_not_blocked_by_reslice() {
    use xianscan_rust::pipeline::shared::SharedEngine;
    if !models_present() {
        eprintln!("[INFO] Skipping concurrency_clean_not_blocked_by_reslice: models not found");
        return;
    }
    let (canvas, _) = build_tall_canvas(40_000);
    let shared = std::sync::Arc::new(SharedEngine::from_engine(PipelineEngine::new("models")));
    let reslice_done = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let (s2, done2) = (shared.clone(), reslice_done.clone());
    let reslicer = std::thread::spawn(move || {
        let mut models: &SharedEngine = &s2;
        let t = Instant::now();
        let out = xianscan_rust::ml::reslice::smart_reslice_chapter_with_models(
            std::slice::from_ref(&canvas), 1600, 1200, 2000, &mut models, None, None, 1, &IntakeLimits::default(),
        );
        done2.store(true, std::sync::atomic::Ordering::SeqCst);
        (out.map(|v| v.len()).unwrap_or(0), t.elapsed())
    });
    std::thread::sleep(std::time::Duration::from_millis(300));
    let small = common::generate_synthetic_bubble_image(256, 256, 40, 40, 160, 120);
    let regions = vec![CleanRequestRegion { id: "r0".to_string(), box_: Some(xianscan_rust::ml::schemas::BoxRect { x: 60, y: 60, w: 100, h: 60 }), polygon: None, bubble_box: None }];
    let t = Instant::now();
    let mut inpainter = shared.inpainter.lock().unwrap();
    let cleaned = xianscan_rust::pipeline::cleaner::clean_image(&mut inpainter, &small, &regions, "patch", true);
    drop(inpainter);
    let clean_ms = t.elapsed().as_millis();
    let reslice_still_running = !reslice_done.load(std::sync::atomic::Ordering::SeqCst);
    let (pages, reslice_time) = reslicer.join().expect("reslice thread");
    println!("CONCURRENCY clean_ms={clean_ms} reslice_ms={} pages={pages} clean_finished_during_reslice={reslice_still_running}", reslice_time.as_millis());
    assert!(cleaned.is_ok());
    assert!(clean_ms < 10_000, "clean waited {clean_ms} ms");
}
