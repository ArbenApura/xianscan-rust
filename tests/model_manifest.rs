// MODEL MANIFEST (FEAT-008 PHASE 3): models/manifest.tsv IS WELL FORMED, PINNED, AND COVERS EVERY EMBEDDED MODEL.
use std::path::Path;

fn root() -> &'static Path {
    Path::new(env!("CARGO_MANIFEST_DIR"))
}

fn rows() -> Vec<Vec<String>> {
    let text = std::fs::read_to_string(root().join("models/manifest.tsv")).expect("models/manifest.tsv");
    let tab = char::from(9);
    text.lines()
        .skip(1)
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.split(tab).map(str::to_string).collect())
        .collect()
}

#[test]
fn manifest_rows_are_well_formed() {
    let rows = rows();
    assert!(!rows.is_empty());
    for r in &rows {
        assert_eq!(r.len(), 4, "row {r:?} needs file, size_bytes, sha256, url");
        assert!(r[0].ends_with(".onnx"), "{r:?}");
        assert!(r[1].parse::<u64>().map(|n| n > 0).unwrap_or(false), "size in {r:?}");
        assert!(r[2].len() == 64 && r[2].chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()), "sha256 in {r:?}");
        assert!(r[3].starts_with("https://"), "url in {r:?}");
    }
}

#[test]
fn manifest_urls_are_pinned() {
    for r in rows() {
        assert!(!r[3].contains("/resolve/main/") && !r[3].contains("/resolve/master/"), "unpinned url {}", r[3]);
    }
}

#[test]
fn manifest_covers_embedded_models() {
    let src = std::fs::read_to_string(root().join("src/ml/embedded_models.rs")).expect("embedded_models.rs");
    let listed: Vec<String> = rows().into_iter().map(|r| r[0].clone()).collect();
    let re = regex::Regex::new(r#"include_bytes!\("[.][.]/[.][.]/models/([^"]+[.]onnx)"\)"#).unwrap();
    let embedded: Vec<String> = re.captures_iter(&src).map(|c| c[1].to_string()).collect();
    assert!(!embedded.is_empty(), "no include_bytes! of a model found");
    for f in embedded {
        assert!(listed.contains(&f), "embedded model {f} has no manifest row");
    }
}
