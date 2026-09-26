// OCR SCORE CALIBRATION PARITY HARNESS (FEAT-003 PHASE 1).
// NEEDS THE PRIVATE FIXTURES AND THE OCR MODELS; EVERY TEST SKIPS WHEN THE DATASET IS ABSENT.
//   fixture_json_all_parse            EVERY SAVED layout/ocr JSON PARSES.
//   parity_snapshot                   XIANSCAN_PARITY_TAG=<tag>: SNAPSHOT THE REGION OUTPUT OF EVERY MANIFEST FIXTURE.
//   parity_compare                    XIANSCAN_PARITY_BASE / _HEAD: COMPARE TWO SNAPSHOTS (FAILS ON ANY DIFF UNLESS
//                                     XIANSCAN_PARITY_ALLOW_DIFF=1).
//   parity_manifest_covers_fixtures   EVERY CASE FOLDER IS USED BY SOME TEST.
//   rec_models_emit_softmax           EVERY RECOGNISER EMITS A PROBABILITY ROW PER TIME STEP (ADR-009).
//   fixture_scores_in_legacy_range    STORED SCORES ARE ON THE LEGACY SCALE; ATTACHED PROBABILITIES AGREE WITH THEM.
//   attach_fixture_ocr_probs          (#[ignore], MAINTAINER TOOL) ADDS REAL prob / line_probs TO ocr_debug.json.
//   live_fusion_snapshot / _compare   (#[ignore] SNAPSHOT) LIVE fuse_detections OUTPUT FOR A FIXTURE SAMPLE, BEFORE/AFTER.
mod common;

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use common::{
    fixture_manifest, get_dataset_dir, load_fusion_from_case_folder, resolve_fixture_path, write_fixture_atomic, FolderLayoutReport,
    FolderOcrReport,
};
use serde_json::{json, Value};
use xianscan_rust::ml::schemas::AnalyzeOptions;
use xianscan_rust::pipeline::PipelineEngine;

// -- HELPERS -- //

fn parity_root() -> PathBuf {
    std::env::var("XIANSCAN_PARITY_DIR").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("target/score_parity"))
}

/// EVERY FILE NAMED `name` UNDER `dir`, RECURSIVELY.
fn find_named(dir: &Path, name: &str, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            find_named(&path, name, out);
        } else if path.file_name().map(|n| n == name).unwrap_or(false) {
            out.push(path);
        }
    }
}

/// EVERY FILE WITH EXTENSION `ext` UNDER `dir`, RECURSIVELY (SKIPPING THE FIXTURE DATA ITSELF).
fn find_named_ext(dir: &Path, ext: &str, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if path.file_name().map(|n| n != "fixtures").unwrap_or(false) {
                find_named_ext(&path, ext, out);
            }
        } else if path.extension().map(|e| e == ext).unwrap_or(false) {
            out.push(path);
        }
    }
}

/// FIELDS THAT MUST MATCH BITWISE ACROSS A PARITY RUN; `confidence` IS STORED AS ITS f32 BIT PATTERN.
const REGION_FIELDS: &[&str] = &[
    "id", "kind", "text", "box", "polygon", "inpaint_box", "typeset_box", "bubble_box", "bubble_polygon",
    "carrier_box", "centroid", "vertical", "angle", "is_title", "is_subtitle", "confidence",
];

fn region_snapshot(region: &xianscan_rust::ml::schemas::Region) -> Value {
    let full = serde_json::to_value(region).expect("region serializes");
    let mut out = serde_json::Map::new();
    for field in REGION_FIELDS {
        let value = if *field == "confidence" { json!(region.confidence.to_bits()) } else { full.get(*field).cloned().unwrap_or(Value::Null) };
        out.insert((*field).to_string(), value);
    }
    Value::Object(out)
}

/// THE CASE FOLDER NAME OF A FIXTURE REFERENCE ("case/page.webp", "case.webp" OR "case").
fn case_name(fixture: &str) -> String {
    let first = fixture.split(['/', '\\']).next().unwrap_or(fixture);
    first.strip_suffix(".webp").unwrap_or(first).to_string()
}

fn snapshot_name(lang: &str, fixture: &str, source_lang: Option<&str>) -> String {
    format!("{}__{}__{}.json", lang, case_name(fixture), source_lang.unwrap_or("none"))
}

// -- TESTS -- //

#[test]
fn fixture_json_all_parse() {
    let Some(dataset) = get_dataset_dir() else {
        eprintln!("[INFO] Skipping fixture_json_all_parse: no private dataset");
        return;
    };
    let mut bad = Vec::new();
    let mut layouts = Vec::new();
    let mut ocrs = Vec::new();
    find_named(&dataset, "layout_debug.json", &mut layouts);
    find_named(&dataset, "ocr_debug.json", &mut ocrs);
    for path in &layouts {
        let text = std::fs::read_to_string(path).unwrap_or_default();
        if let Err(e) = serde_json::from_str::<FolderLayoutReport>(&text) {
            bad.push(format!("{}: {}", path.display(), e));
        }
    }
    for path in &ocrs {
        let text = std::fs::read_to_string(path).unwrap_or_default();
        if let Err(e) = serde_json::from_str::<FolderOcrReport>(&text) {
            bad.push(format!("{}: {}", path.display(), e));
        }
    }
    eprintln!("checked {} layout and {} ocr fixture files", layouts.len(), ocrs.len());
    assert!(bad.is_empty(), "unparseable fixture JSON:\n{}", bad.join("\n"));
}

#[test]
fn parity_snapshot() {
    let Ok(tag) = std::env::var("XIANSCAN_PARITY_TAG") else {
        eprintln!("[INFO] Skipping parity_snapshot: set XIANSCAN_PARITY_TAG");
        return;
    };
    if get_dataset_dir().is_none() {
        eprintln!("[INFO] Skipping parity_snapshot: no private dataset");
        return;
    }
    let out_dir = parity_root().join(&tag);
    std::fs::create_dir_all(&out_dir).expect("create parity dir");
    let mut engine = PipelineEngine::new_ocr_only("models");

    let mut written = 0;
    let mut skipped = Vec::new();
    for entry in fixture_manifest() {
        let Some(src_path) = resolve_fixture_path(&entry.lang, &entry.fixture) else {
            skipped.push(format!("{}/{} (not found)", entry.lang, entry.fixture));
            continue;
        };
        let Ok(img) = image::open(&src_path) else {
            skipped.push(format!("{}/{} (unreadable image)", entry.lang, entry.fixture));
            continue;
        };
        let Ok((fusion, crops_before)) = load_fusion_from_case_folder(&src_path, &img) else {
            skipped.push(format!("{}/{} (no saved layout/ocr)", entry.lang, entry.fixture));
            continue;
        };
        let opts = AnalyzeOptions {
            source_lang: entry.source_lang.clone(),
            target_lang: Some("en".to_string()),
            ..Default::default()
        };
        let res = xianscan_rust::pipeline::analyzer::analyze_image_with_fusion(&mut engine, &img, &fusion, Some(&opts))
            .expect("analyze_image_with_fusion failed");
        let mut snapshot = json!({
            "lang": entry.lang,
            "fixture": entry.fixture,
            "source_lang": entry.source_lang,
            "regions": res.regions.iter().map(region_snapshot).collect::<Vec<_>>(),
            "onomatopoeia": serde_json::to_value(&res.onomatopoeia).unwrap_or(Value::Null),
            "crop_cache_before": crops_before,
            "crop_cache_after": res.crop_cache.len(),
        });
        if let Some(attempts) = res.stats.as_ref().map(|st| st.refine_crop_attempts) {
            snapshot["refine_crop_attempts"] = json!(attempts);
        }
        let path = out_dir.join(snapshot_name(&entry.lang, &entry.fixture, entry.source_lang.as_deref()));
        std::fs::write(&path, serde_json::to_string_pretty(&snapshot).expect("snapshot serializes")).expect("write snapshot");
        written += 1;
    }
    eprintln!("parity snapshot '{}': {} cases written to {}, {} skipped", tag, written, out_dir.display(), skipped.len());
    for s in &skipped {
        eprintln!("  skipped {s}");
    }
    assert!(written > 0, "no fixture could be snapshotted");
}

/// FIRST DIFFERENCE BETWEEN TWO REGION SNAPSHOTS: FLOATS BITWISE (confidence IS ALREADY BITS), angle WITHIN 1e-4.
fn first_region_diff(a: &Value, b: &Value) -> Option<String> {
    for field in REGION_FIELDS {
        let (va, vb) = (&a[*field], &b[*field]);
        if *field == "angle" {
            let (fa, fb) = (va.as_f64().unwrap_or(0.0), vb.as_f64().unwrap_or(0.0));
            if (fa - fb).abs() > 1e-4 {
                return Some(format!("angle {fa} -> {fb}"));
            }
        } else if va != vb {
            return Some(format!("{field}: {va} -> {vb}"));
        }
    }
    None
}

#[test]
fn parity_compare() {
    let (Ok(base), Ok(head)) = (std::env::var("XIANSCAN_PARITY_BASE"), std::env::var("XIANSCAN_PARITY_HEAD")) else {
        eprintln!("[INFO] Skipping parity_compare: set XIANSCAN_PARITY_BASE and XIANSCAN_PARITY_HEAD");
        return;
    };
    let root = parity_root();
    let list = |tag: &str| -> BTreeSet<String> {
        std::fs::read_dir(root.join(tag))
            .map(|rd| rd.flatten().filter_map(|e| e.file_name().into_string().ok()).filter(|n| n.ends_with(".json")).collect())
            .unwrap_or_default()
    };
    let (base_files, head_files) = (list(&base), list(&head));
    let mut report = Vec::new();
    let (mut identical, mut differing) = (0, 0);
    let mut crop_growth: i64 = 0;
    let mut refine_delta: i64 = 0;
    for name in base_files.intersection(&head_files) {
        let read = |tag: &str| -> Value { serde_json::from_str(&std::fs::read_to_string(root.join(tag).join(name)).unwrap_or_default()).unwrap_or(Value::Null) };
        let (a, b) = (read(&base), read(&head));
        let crops = |v: &Value| v["crop_cache_after"].as_i64().unwrap_or(0) - v["crop_cache_before"].as_i64().unwrap_or(0);
        crop_growth += crops(&b) - crops(&a);
        // ABSENT IN SNAPSHOTS TAKEN BEFORE PHASE 2: ONLY COUNT CASES WHERE BOTH SIDES RECORD IT
        if let (Some(x), Some(y)) = (a["refine_crop_attempts"].as_i64(), b["refine_crop_attempts"].as_i64()) {
            refine_delta += y - x;
        }
        let (ra, rb) = (a["regions"].as_array().cloned().unwrap_or_default(), b["regions"].as_array().cloned().unwrap_or_default());
        let mut diffs = Vec::new();
        if ra.len() != rb.len() {
            diffs.push(format!("region count {} -> {}", ra.len(), rb.len()));
        }
        for (i, (x, y)) in ra.iter().zip(rb.iter()).enumerate() {
            if let Some(d) = first_region_diff(x, y) {
                diffs.push(format!("region {i}: {d}"));
            }
        }
        if a["onomatopoeia"] != b["onomatopoeia"] {
            diffs.push("onomatopoeia changed".to_string());
        }
        if diffs.is_empty() {
            identical += 1;
        } else {
            differing += 1;
            report.push(format!("{name}\n  {}", diffs.join("\n  ")));
        }
    }
    let only_base: Vec<_> = base_files.difference(&head_files).cloned().collect();
    let only_head: Vec<_> = head_files.difference(&base_files).cloned().collect();
    let summary = format!(
        "{head} vs {base}: {} compared, {identical} identical, {differing} differing, {} missing in head, {} missing in base, crop growth delta {crop_growth}, refine_crop_attempts delta {refine_delta}",
        identical + differing,
        only_base.len(),
        only_head.len()
    );
    let mut text = vec![summary.clone()];
    text.extend(report.iter().cloned());
    text.extend(only_base.iter().map(|n| format!("missing in head: {n}")));
    text.extend(only_head.iter().map(|n| format!("missing in base: {n}")));
    let out = root.join(format!("{head}_vs_{base}.txt"));
    let _ = std::fs::write(&out, text.join("\n"));
    eprintln!("{summary}\nreport: {}", out.display());
    let allow = std::env::var("XIANSCAN_PARITY_ALLOW_DIFF").map(|v| v == "1").unwrap_or(false);
    assert!(allow || (differing == 0 && only_base.is_empty() && only_head.is_empty()), "{summary}");
}

#[test]
fn parity_manifest_covers_fixtures() {
    let Some(dataset) = get_dataset_dir() else {
        eprintln!("[INFO] Skipping parity_manifest_covers_fixtures: no private dataset");
        return;
    };
    let mut used: BTreeSet<(String, String)> = fixture_manifest()
        .into_iter()
        .map(|e| (e.lang, case_name(&e.fixture)))
        .collect();
    // SOME TESTS (E.G. shrinkwrap_visual.rs) OPEN A CASE FOLDER BY ITS LITERAL PATH INSTEAD OF THROUGH THE LOADER
    let path_re = regex::Regex::new(r"tests/fixtures/private/([A-Za-z_]+)/([A-Za-z0-9_]+)").unwrap();
    let mut sources = Vec::new();
    find_named_ext(Path::new("tests"), "rs", &mut sources);
    for file in sources {
        let text = std::fs::read_to_string(&file).unwrap_or_default();
        for cap in path_re.captures_iter(&text) {
            used.insert((cap[1].to_string(), cap[2].to_string()));
        }
    }
    let mut unused: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for lang_dir in std::fs::read_dir(&dataset).into_iter().flatten().flatten() {
        if !lang_dir.path().is_dir() {
            continue;
        }
        let lang = lang_dir.file_name().to_string_lossy().to_string();
        for case in std::fs::read_dir(lang_dir.path()).into_iter().flatten().flatten() {
            if case.path().join("page.webp").exists() {
                let name = case.file_name().to_string_lossy().to_string();
                if !used.contains(&(lang.clone(), name.clone())) {
                    unused.entry(lang.clone()).or_default().push(name);
                }
            }
        }
    }
    let total: usize = unused.values().map(Vec::len).sum();
    assert!(total == 0, "{total} case folders are not used by any test: {unused:#?}");
}

#[test]
fn rec_models_emit_softmax() {
    use ort::{session::Session, value::Tensor};
    let models = ["PP-OCRv6_rec_small", "korean_mobile_v2.0_rec", "cyrillic_mobile_v2.0_rec", "th_PP-OCRv5_mobile_rec"];
    // A SYNTHETIC 48 PX STRIP: LIGHT BACKGROUND WITH A FEW DARK GLYPH-LIKE BARS (NO REAL TEXT NEEDED)
    let (h, w) = (48_usize, 320_usize);
    let mut data = vec![0.0_f32; 3 * h * w];
    for y in 0..h {
        for x in 0..w {
            let ink = (8..40).contains(&y) && (x / 12) % 3 == 0 && x < 280;
            let v = if ink { -0.9 } else { 0.9 };
            for c in 0..3 {
                data[c * h * w + y * w + x] = v;
            }
        }
    }
    let mut checked = 0;
    for name in models {
        let path = Path::new("models").join(format!("{name}.onnx"));
        if !path.exists() {
            eprintln!("[INFO] Skipping {name}: model not found");
            continue;
        }
        let mut session = Session::builder().expect("session builder").commit_from_memory(&std::fs::read(&path).expect("read rec model")).expect("load rec model");
        let input = Tensor::from_array(([1_usize, 3, h, w], data.clone())).expect("input tensor");
        let outputs = session.run(ort::inputs![input]).expect("rec run");
        let (shape, values) = outputs[0].try_extract_tensor::<f32>().expect("rec output");
        let dims: Vec<usize> = shape.iter().map(|&d| d as usize).collect();
        assert!(dims.len() >= 3, "{name}: unexpected output shape {dims:?}");
        let (steps, classes) = (dims[1], dims[2]);
        for t in 0..steps {
            let row = &values[t * classes..(t + 1) * classes];
            let sum: f64 = row.iter().map(|v| *v as f64).sum();
            assert!(row.iter().all(|v| (-1e-6..=1.0 + 1e-6).contains(v)), "{name}: step {t} has a value outside [0, 1]");
            assert!((sum - 1.0).abs() <= 1e-3, "{name}: step {t} sums to {sum}");
        }
        eprintln!("{name}: {steps} steps x {classes} classes, every row is a probability distribution");
        checked += 1;
    }
    if checked == 0 {
        eprintln!("[INFO] Skipping rec_models_emit_softmax: no rec models under models/");
    }
}

/// ocr_debug.json AS THE HARNESS WRITES IT (save_ocr_fixture_with_crops), SO A REWRITE KEEPS THE SAME LAYOUT.
#[derive(serde::Serialize, serde::Deserialize)]
struct OcrDebugFile {
    image_dimensions: (u32, u32),
    lines: Vec<xianscan_rust::ml::ocr::OcrLine>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    crops: Vec<xianscan_rust::ml::ocr::CachedCropEntry>,
}

/// REMOVES THE FIELDS attach_fixture_ocr_probs ADDS, TO PROVE NOTHING ELSE CHANGED.
fn strip_prob_fields(v: &mut Value) {
    match v {
        Value::Object(map) => {
            map.remove("prob");
            map.remove("line_probs");
            for (_, child) in map.iter_mut() {
                strip_prob_fields(child);
            }
        }
        Value::Array(items) => items.iter_mut().for_each(strip_prob_fields),
        _ => {}
    }
}

fn same_line(a: &(Vec<[i32; 2]>, String, f32), b: &(Vec<[i32; 2]>, String, f32)) -> bool {
    a.0 == b.0 && a.1 == b.1 && a.2.to_bits() == b.2.to_bits()
}

/// EVERY CASE FOLDER WITH AN ocr_debug.json, WITH THE source_lang TAGS TO TRY (MANIFEST TAGS, THEN THE TAGS THE
/// STORED CROPS RECORD, THEN None).
fn attach_targets(dataset: &Path) -> Vec<(PathBuf, Vec<Option<String>>)> {
    let mut by_folder: BTreeMap<PathBuf, Vec<Option<String>>> = BTreeMap::new();
    for entry in fixture_manifest() {
        if let Some(src) = resolve_fixture_path(&entry.lang, &entry.fixture) {
            if let Some(dir) = src.parent() {
                let tags = by_folder.entry(dir.to_path_buf()).or_default();
                if !tags.contains(&entry.source_lang) {
                    tags.push(entry.source_lang.clone());
                }
            }
        }
    }
    let mut files = Vec::new();
    find_named(dataset, "ocr_debug.json", &mut files);
    let mut out = Vec::new();
    for file in files {
        let Some(dir) = file.parent() else { continue };
        let mut tags = by_folder.get(dir).cloned().unwrap_or_default();
        if let Ok(stored) = serde_json::from_str::<OcrDebugFile>(&std::fs::read_to_string(&file).unwrap_or_default()) {
            for crop in &stored.crops {
                if !tags.contains(&crop.source_lang) {
                    tags.push(crop.source_lang.clone());
                }
            }
        }
        if !tags.contains(&None) {
            tags.push(None);
        }
        out.push((dir.to_path_buf(), tags));
    }
    out
}

#[test]
#[ignore]
fn attach_fixture_ocr_probs() {
    let Some(dataset) = get_dataset_dir() else {
        eprintln!("[INFO] Skipping attach_fixture_ocr_probs: no private dataset");
        return;
    };
    let mut engine = PipelineEngine::new("models");
    let (mut lines_total, mut lines_matched, mut crops_total, mut crops_matched) = (0_usize, 0_usize, 0_usize, 0_usize);
    let mut per_case = Vec::new();
    for (dir, tags) in attach_targets(&dataset) {
        let ocr_path = dir.join("ocr_debug.json");
        let Ok(img) = image::open(dir.join("page.webp")) else {
            eprintln!("  skipped {} (no page.webp)", dir.display());
            continue;
        };
        let original_text = std::fs::read_to_string(&ocr_path).expect("read ocr_debug.json");
        let mut stored: OcrDebugFile = serde_json::from_str(&original_text).expect("ocr_debug.json parses");

        // 1. FULL-PAGE LINES: MATCH A LIVE FUSION LINE WITH THE SAME POLYGON, TEXT AND SCORE BITS
        for tag in &tags {
            if stored.lines.iter().all(|l| l.prob.is_some()) {
                break;
            }
            let Ok(live) = xianscan_rust::pipeline::fusion::fuse_detections(&mut engine.detector, &mut engine.ocr, &img, tag.as_deref(), false) else {
                continue;
            };
            for line in stored.lines.iter_mut().filter(|l| l.prob.is_none()) {
                if let Some(hit) = live.rapid_lines.iter().find(|r| r.polygon == line.polygon && r.text == line.text && r.score.to_bits() == line.score.to_bits()) {
                    line.prob = hit.prob;
                }
            }
        }

        // 2. CROP CACHE: RE-RUN THE PIPELINE'S CROP CHAIN ON THE SAME RECT; ACCEPT A CANDIDATE WITH THE SAME SCORE BITS
        //    WHOSE LINES CONTAIN EVERY STORED LINE (THE FALLBACK PATH STORES A FILTERED SUBSET)
        if let Some(ocr) = engine.ocr.as_mut() {
            for crop in stored.crops.iter_mut().filter(|c| c.result.prob.is_none()) {
                let [x, y, w, h] = crop.crop_rect;
                if x < 0 || y < 0 || w <= 0 || h <= 0 || (x + w) as u32 > img.width() || (y + h) as u32 > img.height() {
                    continue;
                }
                let sub = img.crop_imm(x as u32, y as u32, w as u32, h as u32);
                let lang = crop.source_lang.clone();
                let candidates = [
                    ocr.recognize_crop_with_lang(&sub, lang.as_deref()).ok().flatten(),
                    ocr.recognize_line_with_lang(&sub, lang.as_deref()).ok().flatten(),
                    ocr.recognize_crop_with_lang(&sub, None).ok().flatten(),
                ];
                for live in candidates.into_iter().flatten() {
                    if live.score.to_bits() != crop.result.score.to_bits() {
                        continue;
                    }
                    let mapped: Option<Vec<f32>> = crop
                        .result
                        .lines
                        .iter()
                        .map(|l| live.lines.iter().position(|r| same_line(r, l)).map(|i| live.line_prob(i)))
                        .collect();
                    let text_ok = !crop.result.lines.is_empty() || live.text == crop.result.text;
                    if let (Some(line_probs), true) = (mapped, text_ok) {
                        crop.result.prob = Some(live.prob_or_derived());
                        crop.result.line_probs = line_probs;
                        break;
                    }
                }
            }
        }

        let (lt, lm) = (stored.lines.len(), stored.lines.iter().filter(|l| l.prob.is_some()).count());
        let (ct, cm) = (stored.crops.len(), stored.crops.iter().filter(|c| c.result.prob.is_some()).count());
        lines_total += lt;
        lines_matched += lm;
        crops_total += ct;
        crops_matched += cm;
        per_case.push(format!("{}: lines {lm}/{lt}, crops {cm}/{ct}", dir.display()));

        // 3. REWRITE ONLY WHEN SOMETHING WAS ATTACHED, AND ONLY IF STRIPPING THE NEW FIELDS GIVES BACK THE ORIGINAL
        if lm + cm == 0 {
            continue;
        }
        let new_text = serde_json::to_string_pretty(&stored).expect("serialize ocr_debug.json");
        let mut new_value: Value = serde_json::from_str(&new_text).expect("reparse");
        let mut old_value: Value = serde_json::from_str(&original_text).expect("reparse original");
        strip_prob_fields(&mut new_value);
        strip_prob_fields(&mut old_value);
        assert_eq!(new_value, old_value, "attach would change existing fields in {}", ocr_path.display());
        write_fixture_atomic(&ocr_path, new_text.as_bytes());
    }
    for line in &per_case {
        eprintln!("  {line}");
    }
    let rate = |m: usize, t: usize| if t == 0 { 100.0 } else { m as f64 * 100.0 / t as f64 };
    eprintln!(
        "attach_fixture_ocr_probs: lines {lines_matched}/{lines_total} ({:.1}%), crops {crops_matched}/{crops_total} ({:.1}%), overall {:.1}%",
        rate(lines_matched, lines_total),
        rate(crops_matched, crops_total),
        rate(lines_matched + crops_matched, lines_total + crops_total)
    );
}

#[test]
fn fixture_scores_in_legacy_range() {
    use xianscan_rust::ml::ocr::confidence::{prob_from_legacy, LEGACY_MAX, LEGACY_MIN};
    let Some(dataset) = get_dataset_dir() else {
        eprintln!("[INFO] Skipping fixture_scores_in_legacy_range: no private dataset");
        return;
    };
    let mut files = Vec::new();
    find_named(&dataset, "ocr_debug.json", &mut files);
    let mut bad: Vec<String> = Vec::new();
    let (mut scores, mut probs) = (0, 0);
    let mut check = |at: String, score: f32, prob: Option<f32>, bad: &mut Vec<String>| {
        scores += 1;
        if !(LEGACY_MIN..=LEGACY_MAX + 1e-6).contains(&score) {
            bad.push(format!("{at}: score {score} outside the legacy range"));
        }
        if let Some(p) = prob {
            probs += 1;
            if !(0.0..=1.0).contains(&p) {
                bad.push(format!("{at}: prob {p} outside [0, 1]"));
            } else if (prob_from_legacy(score) - p).abs() >= 0.05 {
                bad.push(format!("{at}: prob {p} far from prob_from_legacy({score}) = {}", prob_from_legacy(score)));
            }
        }
    };
    for file in &files {
        let Ok(stored) = serde_json::from_str::<OcrDebugFile>(&std::fs::read_to_string(file).unwrap_or_default()) else {
            bad.push(format!("{}: does not parse", file.display()));
            continue;
        };
        for (i, line) in stored.lines.iter().enumerate() {
            check(format!("{} line {i}", file.display()), line.score, line.prob, &mut bad);
        }
        for (j, crop) in stored.crops.iter().enumerate() {
            check(format!("{} crop {j}", file.display()), crop.result.score, crop.result.prob, &mut bad);
            for (k, l) in crop.result.lines.iter().enumerate() {
                check(format!("{} crop {j} line {k}", file.display()), l.2, crop.result.line_probs.get(k).copied(), &mut bad);
            }
        }
    }
    eprintln!("checked {scores} stored scores ({probs} with an attached prob) in {} files", files.len());
    assert!(bad.is_empty(), "{} problems: {}", bad.len(), bad.iter().take(40).cloned().collect::<Vec<_>>().join(" | "));
}

/// ONE MANIFEST ENTRY PER CASE FOLDER, EVERY `stride`-TH FOLDER IN MANIFEST ORDER.
fn live_sample(stride: usize) -> Vec<common::ManifestEntry> {
    let mut seen = BTreeSet::new();
    let mut folders = Vec::new();
    for entry in fixture_manifest() {
        if seen.insert((entry.lang.clone(), case_name(&entry.fixture))) {
            folders.push(entry);
        }
    }
    folders.into_iter().step_by(stride.max(1)).collect()
}

/// FIXTURE PLAYBACK LOADS FUSION FROM JSON, SO IT NEVER RUNS THE LIVE engine.rs / fusion.rs DECISIONS. THIS SNAPSHOTS
/// LIVE fuse_detections OUTPUT (LINES, RESCUE COUNT, CROP CACHE; SCORES AS BITS, prob LEFT OUT) FOR A SAMPLE OF
/// FIXTURES, SO A CHANGE TO THOSE DECISIONS CAN BE COMPARED BEFORE AND AFTER. XIANSCAN_LIVE_TAG=<tag>,
/// XIANSCAN_LIVE_STRIDE=<n> (DEFAULT 8). SLOW: THE FULL DETECTOR RUNS ON EVERY SAMPLED PAGE.
#[test]
#[ignore]
fn live_fusion_snapshot() {
    let Ok(tag) = std::env::var("XIANSCAN_LIVE_TAG") else {
        eprintln!("[INFO] Skipping live_fusion_snapshot: set XIANSCAN_LIVE_TAG");
        return;
    };
    if get_dataset_dir().is_none() {
        eprintln!("[INFO] Skipping live_fusion_snapshot: no private dataset");
        return;
    }
    let stride = std::env::var("XIANSCAN_LIVE_STRIDE").ok().and_then(|v| v.parse().ok()).unwrap_or(8);
    let out_dir = parity_root().join(format!("live-{tag}"));
    std::fs::create_dir_all(&out_dir).expect("create live dir");
    let mut engine = PipelineEngine::new("models");
    let mut written = 0;
    // XIANSCAN_LIVE_ONLY=<case>,<case>: RESTRICT THE SAMPLE (FOR BISECTING A DIFF)
    let only: Vec<String> = std::env::var("XIANSCAN_LIVE_ONLY").map(|v| v.split(',').map(|x| x.trim().to_string()).collect()).unwrap_or_default();
    for entry in live_sample(stride) {
        if !only.is_empty() && !only.contains(&case_name(&entry.fixture)) {
            continue;
        }
        let Some(src_path) = resolve_fixture_path(&entry.lang, &entry.fixture) else { continue };
        let Ok(img) = image::open(&src_path) else { continue };
        let fusion = xianscan_rust::pipeline::fusion::fuse_detections(&mut engine.detector, &mut engine.ocr, &img, entry.source_lang.as_deref(), false)
            .expect("fuse_detections failed");
        let lines: Vec<Value> = fusion
            .rapid_lines
            .iter()
            .map(|l| json!({ "polygon": l.polygon, "text": l.text, "score": l.score.to_bits() }))
            .collect();
        let crops: Vec<Value> = fusion
            .crop_cache
            .iter()
            .map(|c| json!({ "rect": c.crop_rect, "text": c.result.text, "score": c.result.score.to_bits(), "lines": c.result.lines.len() }))
            .collect();
        let snapshot = json!({ "lines": lines, "rescued": fusion.rescued_crops_count, "crops": crops });
        let path = out_dir.join(snapshot_name(&entry.lang, &entry.fixture, entry.source_lang.as_deref()));
        std::fs::write(&path, serde_json::to_string_pretty(&snapshot).expect("serialize")).expect("write live snapshot");
        written += 1;
    }
    eprintln!("live fusion snapshot '{tag}': {written} cases (stride {stride}) written to {}", out_dir.display());
    assert!(written > 0, "no fixture could be snapshotted");
}

/// COMPARES TWO live_fusion_snapshot TAGS (XIANSCAN_LIVE_BASE / XIANSCAN_LIVE_HEAD). FAILS ON ANY DIFF UNLESS
/// XIANSCAN_PARITY_ALLOW_DIFF=1.
#[test]
fn live_fusion_compare() {
    let (Ok(base), Ok(head)) = (std::env::var("XIANSCAN_LIVE_BASE"), std::env::var("XIANSCAN_LIVE_HEAD")) else {
        eprintln!("[INFO] Skipping live_fusion_compare: set XIANSCAN_LIVE_BASE and XIANSCAN_LIVE_HEAD");
        return;
    };
    let root = parity_root();
    let dir = |tag: &str| root.join(format!("live-{tag}"));
    let list = |tag: &str| -> BTreeSet<String> {
        std::fs::read_dir(dir(tag))
            .map(|rd| rd.flatten().filter_map(|e| e.file_name().into_string().ok()).filter(|n| n.ends_with(".json")).collect())
            .unwrap_or_default()
    };
    let (base_files, head_files) = (list(&base), list(&head));
    let mut differing = Vec::new();
    let mut compared = 0;
    for name in base_files.intersection(&head_files) {
        let read = |tag: &str| -> Value { serde_json::from_str(&std::fs::read_to_string(dir(tag).join(name)).unwrap_or_default()).unwrap_or(Value::Null) };
        let (a, b) = (read(&base), read(&head));
        compared += 1;
        if a != b {
            let count = |v: &Value, k: &str| v[k].as_array().map(|x| x.len()).unwrap_or(0);
            differing.push(format!(
                "{name}: lines {} -> {}, crops {} -> {}, rescued {} -> {}",
                count(&a, "lines"),
                count(&b, "lines"),
                count(&a, "crops"),
                count(&b, "crops"),
                a["rescued"],
                b["rescued"]
            ));
        }
    }
    let missing = base_files.symmetric_difference(&head_files).count();
    let summary = format!("live {head} vs {base}: {compared} compared, {} differing, {missing} missing on one side", differing.len());
    let mut text = vec![summary.clone()];
    text.extend(differing.iter().cloned());
    let _ = std::fs::write(root.join(format!("live-{head}_vs_{base}.txt")), text.join(" ; "));
    eprintln!("{summary}");
    for d in &differing {
        eprintln!("  {d}");
    }
    let allow = std::env::var("XIANSCAN_PARITY_ALLOW_DIFF").map(|v| v == "1").unwrap_or(false);
    assert!(allow || (differing.is_empty() && missing == 0), "{summary}");
}
