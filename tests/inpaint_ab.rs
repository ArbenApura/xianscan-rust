// LAMA OUTPUT A/B (FEAT-004 PHASE 6). #[ignore]: RUN BY NAME ON TWO BUILDS, THEN DIFF THE TWO FILES.
//   XIANSCAN_INPAINT_TAG=<tag> cargo test --test inpaint_ab inpaint_output_hashes -- --ignored --nocapture
// FOR A SAMPLE OF FIXTURE PAGES UNDER THE PIXEL BUDGET, MASKS THE SAVED TEXT BOXES (layout_debug.json) AND RECORDS A
// HASH OF THE patch AND full OUTPUTS IN target/inpaint_ab/<tag>.txt. WRITES NOTHING INTO THE FIXTURES.
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

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

#[test]
#[ignore]
fn inpaint_output_hashes() {
    let Ok(tag) = std::env::var("XIANSCAN_INPAINT_TAG") else {
        eprintln!("[INFO] Skipping inpaint_output_hashes: set XIANSCAN_INPAINT_TAG");
        return;
    };
    let model = Path::new("models/lama.onnx");
    let data = PathBuf::from("tests/fixtures/private");
    if !model.exists() || !data.exists() {
        eprintln!("[INFO] Skipping inpaint_output_hashes: model or fixtures missing");
        return;
    }
    let mut inp = xianscan_rust::ml::inpaint::LamaInpainter::new(model).expect("load LaMa");
    let mut list = Vec::new();
    pages(&data, &mut list);
    list.sort();
    let mut lines = Vec::new();
    for page in list.iter().step_by(16) {
        let Ok(img) = image::open(page) else { continue };
        let (w, h) = (img.width(), img.height());
        if (w as u64) * (h as u64) > 2048 * 2048 || w > 4096 || h > 4096 {
            continue;
        }
        let layout = std::fs::read_to_string(page.with_file_name("layout_debug.json")).unwrap_or_default();
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&layout) else { continue };
        let mut polys = Vec::new();
        for key in ["text_bubbles", "text_free"] {
            for item in v[key].as_array().cloned().unwrap_or_default() {
                let b = &item[0];
                let (x, y, bw, bh) = (b["x"].as_i64().unwrap_or(0) as i32, b["y"].as_i64().unwrap_or(0) as i32, b["w"].as_i64().unwrap_or(0) as i32, b["h"].as_i64().unwrap_or(0) as i32);
                polys.push(vec![[x, y], [x + bw, y], [x + bw, y + bh], [x, y + bh]]);
            }
        }
        if polys.is_empty() {
            continue;
        }
        let mask = xianscan_rust::ml::inpaint::build_mask(h, w, &polys, 3);
        for mode in ["patch", "full"] {
            let out = inp.inpaint(&img, &mask, mode).expect("inpaint");
            let mut hasher = DefaultHasher::new();
            out.to_rgb8().as_raw().hash(&mut hasher);
            lines.push(format!("{} {mode} {:016x}", page.parent().and_then(|p| p.file_name()).map(|n| n.to_string_lossy().to_string()).unwrap_or_default(), hasher.finish()));
        }
    }
    std::fs::create_dir_all("target/inpaint_ab").expect("create dir");
    std::fs::write(format!("target/inpaint_ab/{tag}.txt"), lines.join("\n")).expect("write");
    eprintln!("inpaint hashes '{tag}': {} outputs", lines.len());
    assert!(!lines.is_empty());
}
