// VERSION SYNC GUARD (FEAT-008 PHASE 2): THE APP VERSION IN Cargo.toml, web/package.json, Cargo.lock AND THE WEB
// FALLBACK LITERALS MUST AGREE. THE RELEASE WORKFLOW RUNS scripts/check-release-version.sh FOR THE TAG ITSELF.
use std::path::Path;

const VERSION: &str = env!("CARGO_PKG_VERSION");

fn read(rel: &str) -> String {
    std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join(rel)).unwrap_or_else(|e| panic!("read {rel}: {e}"))
}

#[test]
fn cargo_toml_matches_web_package_json() {
    let pkg: serde_json::Value = serde_json::from_str(&read("web/package.json")).expect("web/package.json parses");
    assert_eq!(pkg["version"].as_str(), Some(VERSION), "web/package.json version differs from Cargo.toml");
}

#[test]
fn cargo_lock_matches_cargo_toml() {
    let lock = read("Cargo.lock");
    let mut lines = lock.lines();
    let mut found = None;
    while let Some(line) = lines.next() {
        if line.trim() == "name = \"xianscan-rust\"" {
            found = lines.next().map(|v| v.trim().trim_start_matches("version = ").trim_matches('"').to_string());
            break;
        }
    }
    assert_eq!(found.as_deref(), Some(VERSION), "Cargo.lock has a different xianscan-rust version");
}

#[test]
fn web_fallback_literals_match() {
    let re = regex::Regex::new(r"'([0-9]+[.][0-9]+[.][0-9]+(?:-[0-9A-Za-z.]+)?)(?:[+]dev)?'").unwrap();
    let files = [
        "web/src/routes/api/system/version/+server.ts",
        "web/src/routes/api/system/hardware/+server.ts",
        "web/src/lib/stores/version-check.ts",
    ];
    let mut seen = 0;
    let mut wrong = Vec::new();
    for f in files {
        for cap in re.captures_iter(&read(f)) {
            seen += 1;
            if &cap[1] != VERSION {
                wrong.push(format!("{f}: {}", &cap[0]));
            }
        }
    }
    assert!(seen > 0, "no fallback version literal found (did the files move?)");
    assert!(wrong.is_empty(), "fallback literals differ from {VERSION}: {wrong:?}");
}
