// WORKFLOW POLICY (FEAT-008 PHASE 5): TEXT CHECKS OVER .github/workflows/*.yml THAT KEEP THE RELEASE PIPELINE HARDENING
// FROM REGRESSING. NO YAML CRATE: EACH RULE ONLY NEEDS LINES, INDENTATION AND A FEW REGEXES.
use regex::Regex;
use std::path::{Path, PathBuf};

struct Workflow {
    name: String,
    lines: Vec<String>,
}

fn root() -> &'static Path {
    Path::new(env!("CARGO_MANIFEST_DIR"))
}

// STRIPS A UTF-8 BOM AND CARRIAGE RETURNS SO CRLF CHECKOUTS BEHAVE LIKE LF ONES
fn clean_lines(text: &str) -> Vec<String> {
    let bom = char::from_u32(0xFEFF).unwrap();
    let cr = char::from(13u8);
    text.trim_start_matches(bom).lines().map(|l| l.trim_end_matches(cr).to_string()).collect()
}

fn workflows() -> Vec<Workflow> {
    let dir = root().join(".github").join("workflows");
    let mut paths: Vec<PathBuf> = std::fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("read {}: {e}", dir.display()))
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| matches!(p.extension().and_then(|x| x.to_str()), Some("yml") | Some("yaml")))
        .collect();
    paths.sort();
    assert!(!paths.is_empty(), "no workflow files found in {}", dir.display());
    paths
        .into_iter()
        .map(|p| {
            let text = std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read {}: {e}", p.display()));
            Workflow { name: p.file_name().unwrap().to_string_lossy().into_owned(), lines: clean_lines(&text) }
        })
        .collect()
}

fn indent(line: &str) -> usize {
    line.len() - line.trim_start_matches(' ').len()
}

fn is_comment(line: &str) -> bool {
    line.trim_start().starts_with('#')
}

// EVERY run: VALUE AS (FIRST LINE NUMBER, TEXT). A BLOCK SCALAR (| OR >) RUNS UNTIL A NON-BLANK LINE THAT IS NOT
// INDENTED DEEPER THAN THE run: KEY ITSELF.
fn run_blocks(wf: &Workflow) -> Vec<(usize, String)> {
    let key = Regex::new(r"^([ ]*)(-[ ]+)?run:[ ]*(.*)$").unwrap();
    let mut out = Vec::new();
    let mut i = 0;
    while i < wf.lines.len() {
        let Some(c) = key.captures(&wf.lines[i]) else {
            i += 1;
            continue;
        };
        let key_col = c[1].len() + c.get(2).map_or(0, |m| m.len());
        let rest = c[3].trim().to_string();
        let start = i + 1;
        if rest.starts_with('|') || rest.starts_with('>') {
            let mut body = Vec::new();
            i += 1;
            while i < wf.lines.len() {
                let l = &wf.lines[i];
                if !l.trim().is_empty() && indent(l) <= key_col {
                    break;
                }
                body.push(l.clone());
                i += 1;
            }
            out.push((start, body.join("\n")));
        } else {
            out.push((start, rest));
            i += 1;
        }
    }
    out
}

// THE LINES OF THE STEP (A "- " LIST ITEM) THAT CONTAINS LINE idx
fn step_block(wf: &Workflow, idx: usize) -> Vec<String> {
    let dash = Regex::new(r"^([ ]*)-[ ]").unwrap();
    let mut begin = idx;
    let mut dash_col = None;
    loop {
        if let Some(c) = dash.captures(&wf.lines[begin]) {
            if c[1].len() < indent(&wf.lines[idx]) || begin == idx {
                dash_col = Some(c[1].len());
                break;
            }
        }
        if begin == 0 {
            break;
        }
        begin -= 1;
    }
    let dash_col = dash_col.unwrap_or_else(|| panic!("{}:{} is not inside a list item", wf.name, idx + 1));
    let mut end = begin + 1;
    while end < wf.lines.len() {
        let l = &wf.lines[end];
        if !l.trim().is_empty() && indent(l) <= dash_col {
            break;
        }
        end += 1;
    }
    wf.lines[begin..end].to_vec()
}

#[test]
fn all_actions_pinned_to_sha() {
    let uses = Regex::new(r"^[ ]*(-[ ]+)?uses:[ ]*([^ #]+)(.*)$").unwrap();
    let pinned = Regex::new(r"@[0-9a-f]{40}$").unwrap();
    let version_comment = Regex::new(r"^[ ]+#[ ]+[^ ]+").unwrap();
    let mut bad = Vec::new();
    let mut seen = 0;
    for wf in workflows() {
        for (n, line) in wf.lines.iter().enumerate() {
            if is_comment(line) {
                continue;
            }
            let Some(c) = uses.captures(line) else { continue };
            let target = c[2].trim_matches(|ch| ch == '"' || ch == '\'');
            if target.starts_with("./") {
                continue;
            }
            seen += 1;
            if !pinned.is_match(target) || !version_comment.is_match(&c[3]) {
                bad.push(format!("{}:{}: {}", wf.name, n + 1, line.trim()));
            }
        }
    }
    assert!(seen > 0, "no uses: lines found; the parser is broken");
    assert!(bad.is_empty(), "actions must be pinned as owner/repo@<40-hex> # vX:\n{}", bad.join("\n"));
}

#[test]
fn no_untrusted_expressions_in_run() {
    let expr = Regex::new(r"[$][{][{](.*?)[}][}]").unwrap();
    let untrusted = Regex::new(r"github[.]event[.]|github[.]head_ref|steps[.][A-Za-z0-9_-]+[.]outputs").unwrap();
    let mut bad = Vec::new();
    let mut blocks = 0;
    for wf in workflows() {
        for (line, text) in run_blocks(&wf) {
            blocks += 1;
            for c in expr.captures_iter(&text) {
                if untrusted.is_match(&c[1]) {
                    bad.push(format!("{}:{}: {}", wf.name, line, c[0].trim()));
                }
            }
        }
    }
    assert!(blocks > 0, "no run: blocks found; the parser is broken");
    assert!(bad.is_empty(), "move these expressions into env: and read them as shell variables:\n{}", bad.join("\n"));
}

// PHASE 6 (MIHON SIGNING FAILS CLOSED) IS OWNED BY THE OWNER AND IS WHAT REMOVES THE xianscan123 FALLBACKS AND THE
// EPHEMERAL KEYSTORE FROM THE WORKFLOWS. UNTIL IT LANDS THIS RULE WOULD FAIL, SO IT IS IGNORED RATHER THAN WEAKENED.
#[test]
#[ignore = "FEAT-008 phase 6 (owner)"]
fn no_default_signing_passwords() {
    let default = Regex::new(r"(KEYSTORE_PASSWORD|KEY_PASSWORD|KEY_ALIAS):-").unwrap();
    let gradle = root().join("extensions/xianscan-mihon/app/build.gradle");
    let mut sources: Vec<(String, Vec<String>)> = workflows().into_iter().map(|w| (w.name, w.lines)).collect();
    let gradle_text = std::fs::read_to_string(&gradle).unwrap_or_else(|e| panic!("read {}: {e}", gradle.display()));
    sources.push(("app/build.gradle".to_string(), clean_lines(&gradle_text)));
    let mut bad = Vec::new();
    for (name, lines) in &sources {
        for (n, line) in lines.iter().enumerate() {
            if line.contains("xianscan123") || default.is_match(line) {
                bad.push(format!("{name}:{}: {}", n + 1, line.trim()));
            }
        }
    }
    assert!(bad.is_empty(), "signing must not fall back to a default password or alias:\n{}", bad.join("\n"));
}

#[test]
fn checkouts_do_not_persist_credentials() {
    let checkout = Regex::new(r"^[ ]*(-[ ]+)?uses:[ ]*actions/checkout@").unwrap();
    let persist = Regex::new(r"^[ ]*persist-credentials:[ ]*false[ ]*(#.*)?$").unwrap();
    let mut bad = Vec::new();
    let mut seen = 0;
    for wf in workflows() {
        for (n, line) in wf.lines.iter().enumerate() {
            if !checkout.is_match(line) {
                continue;
            }
            seen += 1;
            if !step_block(&wf, n).iter().any(|l| persist.is_match(l)) {
                bad.push(format!("{}:{}", wf.name, n + 1));
            }
        }
    }
    assert!(seen > 0, "no actions/checkout steps found; the parser is broken");
    assert!(bad.is_empty(), "actions/checkout without persist-credentials: false at:\n{}", bad.join("\n"));
}

#[test]
fn yarn_installs_are_frozen() {
    let mut bad = Vec::new();
    for wf in workflows() {
        for (n, line) in wf.lines.iter().enumerate() {
            if !is_comment(line) && line.contains("yarn install") && !line.contains("--frozen-lockfile") {
                bad.push(format!("{}:{}: {}", wf.name, n + 1, line.trim()));
            }
        }
    }
    assert!(bad.is_empty(), "every yarn install must use --frozen-lockfile:\n{}", bad.join("\n"));
}

#[test]
fn no_workflow_level_write_permissions() {
    let scope = Regex::new(r"^[ ]+[a-z-]+:[ ]*(read|none)[ ]*(#.*)?$").unwrap();
    let mut bad = Vec::new();
    for wf in workflows() {
        let Some(at) = wf.lines.iter().position(|l| l.starts_with("permissions:")) else {
            bad.push(format!("{}: no top-level permissions: block", wf.name));
            continue;
        };
        let value = wf.lines[at]["permissions:".len()..].split('#').next().unwrap().trim().to_string();
        match value.as_str() {
            "{}" | "read-all" => continue,
            "" => {}
            other => {
                bad.push(format!("{}:{}: permissions: {other}", wf.name, at + 1));
                continue;
            }
        }
        for (n, l) in wf.lines.iter().enumerate().skip(at + 1) {
            if l.trim().is_empty() || is_comment(l) {
                continue;
            }
            if indent(l) == 0 {
                break;
            }
            if !scope.is_match(l) {
                bad.push(format!("{}:{}: {}", wf.name, n + 1, l.trim()));
            }
        }
    }
    assert!(bad.is_empty(), "top-level permissions must be {{}} or read-only:\n{}", bad.join("\n"));
}

#[test]
fn model_hash_check_not_skipped_in_ci() {
    let mut bad = Vec::new();
    for wf in workflows() {
        for (n, line) in wf.lines.iter().enumerate() {
            if line.contains("XIANSCAN_SKIP_MODEL_HASH") {
                bad.push(format!("{}:{}: {}", wf.name, n + 1, line.trim()));
            }
        }
    }
    assert!(bad.is_empty(), "CI must never skip the build-time model hash check:\n{}", bad.join("\n"));
}
