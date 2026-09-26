// DETECTOR A/B SNAPSHOTS (FEAT-004 PHASES 4 AND 5). #[ignore]: RUN BY NAME.
//   XIANSCAN_DET_TAG=<tag> cargo test --test detector_ab detector_snapshot -- --ignored --nocapture
//   XIANSCAN_DET_BASE=<a> XIANSCAN_DET_HEAD=<b> cargo test --test detector_ab detector_compare -- --nocapture
// A SNAPSHOT HOLDS THE RAW DETECTOR OUTPUT (BUBBLES, TEXT, SFX, PANELS) OF EVERY FIXTURE page.webp. IT WRITES ONLY TO
// target/detector_ab/<tag>/ (OR XIANSCAN_DET_DIR), NEVER INTO THE FIXTURE FOLDERS. MODELS COME FROM
// XIANSCAN_MODELS_DIR (DEFAULT models), FIXTURES FROM XIANSCAN_TEST_DATA_DIR OR tests/fixtures/private.
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use xianscan_rust::ml::detect::ComicTextDetector;

fn root() -> PathBuf {
    std::env::var("XIANSCAN_DET_DIR").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("target/detector_ab"))
}

fn dataset() -> Option<PathBuf> {
    let p = std::env::var("XIANSCAN_TEST_DATA_DIR").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("tests/fixtures/private"));
    p.exists().then_some(p)
}

fn pages(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            pages(&p, out);
        } else if p.file_name().map(|n| n == "page.webp").unwrap_or(false) {
            out.push(p);
        }
    }
}

fn boxes(list: &[xianscan_rust::ml::schemas::BoxRect]) -> Value {
    json!(list.iter().map(|b| [b.x, b.y, b.w, b.h]).collect::<Vec<_>>())
}

fn scored(list: &[(xianscan_rust::ml::schemas::BoxRect, f32)]) -> Value {
    json!(list.iter().map(|(b, s)| json!([b.x, b.y, b.w, b.h, s.to_bits()])).collect::<Vec<_>>())
}

#[test]
#[ignore]
fn detector_snapshot() {
    let Ok(tag) = std::env::var("XIANSCAN_DET_TAG") else {
        eprintln!("[INFO] Skipping detector_snapshot: set XIANSCAN_DET_TAG");
        return;
    };
    let Some(data) = dataset() else {
        eprintln!("[INFO] Skipping detector_snapshot: no private dataset");
        return;
    };
    let models = PathBuf::from(std::env::var("XIANSCAN_MODELS_DIR").unwrap_or_else(|_| "models".to_string()));
    let model = models.join("rfdetr-seg-2xlarge.onnx");
    let Ok(mut det) = ComicTextDetector::new(&model) else {
        eprintln!("[INFO] Skipping detector_snapshot: {} not loadable", model.display());
        return;
    };
    let out = root().join(&tag);
    std::fs::create_dir_all(&out).expect("create snapshot dir");
    let mut list = Vec::new();
    pages(&data, &mut list);
    list.sort();
    let mut written = 0;
    for page in list {
        let Ok(img) = image::open(&page) else { continue };
        let res = det.detect(&img).expect("detect");
        let rel = page.strip_prefix(&data).unwrap_or(&page).parent().map(|p| p.to_string_lossy().replace(['/', std::path::MAIN_SEPARATOR], "__")).unwrap_or_default();
        let snap = json!({
            "bubbles": boxes(&res.bubbles),
            "panels": boxes(&res.panels),
            "text_bubbles": scored(&res.text_bubbles),
            "text_free": scored(&res.text_free),
            "onomatopoeia": scored(&res.onomatopoeia),
        });
        std::fs::write(out.join(format!("{rel}.json")), serde_json::to_string(&snap).expect("serialize")).expect("write");
        written += 1;
    }
    eprintln!("detector snapshot '{tag}': {written} pages written to {}", out.display());
    assert!(written > 0);
}

#[test]
fn detector_compare() {
    let (Ok(base), Ok(head)) = (std::env::var("XIANSCAN_DET_BASE"), std::env::var("XIANSCAN_DET_HEAD")) else {
        eprintln!("[INFO] Skipping detector_compare: set XIANSCAN_DET_BASE and XIANSCAN_DET_HEAD");
        return;
    };
    let list = |tag: &str| -> BTreeSet<String> {
        std::fs::read_dir(root().join(tag)).map(|rd| rd.flatten().filter_map(|e| e.file_name().into_string().ok()).collect()).unwrap_or_default()
    };
    let (a, b) = (list(&base), list(&head));
    let (mut pages_changed, mut boxes_changed, mut edge_only) = (0, 0, true);
    let mut report = Vec::new();
    for name in a.intersection(&b) {
        let read = |tag: &str| -> Value { serde_json::from_str(&std::fs::read_to_string(root().join(tag).join(name)).unwrap_or_default()).unwrap_or(Value::Null) };
        let (x, y) = (read(&base), read(&head));
        if x == y {
            continue;
        }
        pages_changed += 1;
        for key in ["bubbles", "panels", "text_bubbles", "text_free", "onomatopoeia"] {
            let (xa, ya) = (x[key].as_array().cloned().unwrap_or_default(), y[key].as_array().cloned().unwrap_or_default());
            if xa.len() != ya.len() {
                edge_only = false;
                report.push(format!("{name} {key}: count {} -> {}", xa.len(), ya.len()));
                continue;
            }
            for (i, (p, q)) in xa.iter().zip(ya.iter()).enumerate() {
                if p != q {
                    boxes_changed += 1;
                    // AN EDGE FIX MAY ONLY MOVE x/y TO 0 OR SHRINK w/h; ANY OTHER CHANGE IS FLAGGED
                    let v = |r: &Value, k: usize| r[k].as_i64().unwrap_or(0);
                    let same_score = p.get(4) == q.get(4);
                    let shrink_only = v(q, 2) <= v(p, 2) && v(q, 3) <= v(p, 3) && same_score;
                    if !shrink_only {
                        edge_only = false;
                    }
                    report.push(format!("{name} {key}[{i}]: {p} -> {q}"));
                }
            }
        }
    }
    let summary = format!("detector {head} vs {base}: {} pages compared, {pages_changed} changed, {boxes_changed} boxes changed, edge-only: {edge_only}", a.intersection(&b).count());
    eprintln!("{summary}");
    for r in report.iter().take(60) {
        eprintln!("  {r}");
    }
    let _ = std::fs::write(root().join(format!("{head}_vs_{base}.txt")), [vec![summary], report].concat().join("\n"));
}
