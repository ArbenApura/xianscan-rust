use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::detect::filter_text_by_source_lang;

/// # Indonesian Comic Regression Test: Latin Script & Reduplication Hyphens
///
/// ## Purpose & Behavior Tested:
/// - **Language Routing (`id`)**:
///   Verifies Indonesian source mode handles standard Latin characters, exclamation marks,
///   and word reduplication hyphens (e.g. `tiba-tiba`, `anak-anak`).
#[test]
fn test_regression_indonesian_script_handling() {
    let sample = "Tiba-tiba musuh menyerang! Kita harus bertahan.";
    let filtered = filter_text_by_source_lang(sample, Some("id"));
    assert_eq!(filtered, "Tiba-tiba musuh menyerang! Kita harus bertahan.");

    let mixed = "Tiba-tiba musuh datang! 你好 Привет";
    let cleaned = filter_text_by_source_lang(mixed, Some("id"));
    assert_eq!(cleaned.trim(), "Tiba-tiba musuh datang!");
}

/// # Indonesian Real-Page Regression: `page_zhang_yude_chengdu_cemetery.webp` with `id` Source Routing
#[test]
fn test_regression_page_with_indonesian_source_routing() {
    let img = match crate::common::load_fixture_or_skip("id", "sample.webp")
        .or_else(|| crate::common::load_fixture_or_skip("zh_hans", "page_zhang_yude_chengdu_cemetery.webp"))
    {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_with_indonesian_source_routing: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("id"));
    for r in &res.regions {
        assert!(
            !xianscan_rust::ml::detect::has_cjk_characters(&r.text),
            "Region in 'id' mode should not contain CJK: {}",
            r.text
        );
    }
}

/// # Indonesian Real-Page Regression: `page_who_is_she_bottom_box.png` (Resolution: 720 × 1801 PNG)
///
/// ## Purpose & Behavior Tested:
/// - **Tall Manhwa Strip Bottom-Box Boundary Capture**:
///   Guarantees that both narration/dialogue boxes across the tall strip:
///   1. Top Box (left-center): `PEREMPUAN...?`
///   2. Bottom Box (bottom-right edge): `SIAPA DIA...?`
///   are cleanly detected and recognized as distinct regions.
/// - **Language Routing Integrity (`id`)**:
///   Verifies that `source_lang = Some("id")` cleanly processes Latin uppercase text.
#[test]
fn test_regression_page_who_is_she_bottom_box() {
    let img = match crate::common::load_fixture_or_skip("id", "page_who_is_she_bottom_box.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_who_is_she_bottom_box: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("id"));
    println!("Indonesian Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. Exact count: exactly 2 regions
    assert_eq!(res.regions.len(), 2, "Indonesian Page must have exactly 2 detected regions, got {}", res.regions.len());

    // 2. Upper box: 'PEREMPUAN...?'
    let top_box = res.regions.iter().find(|r| r.text.to_uppercase().contains("PEREMPUAN"));
    assert!(top_box.is_some(), "Must detect upper box 'PEREMPUAN...?'");
    let top_box = top_box.unwrap();
    assert!(top_box.box_.y < (res.height as f32 * 0.65) as i32, "Upper box must be in top half of image");

    // 3. Bottom box: 'SIAPA DIA...?'
    let bottom_box = res.regions.iter().find(|r| r.text.to_uppercase().contains("SIAPA") || r.text.to_uppercase().contains("DIA"));
    assert!(bottom_box.is_some(), "Must detect bottom box 'SIAPA DIA...?'");
    let bottom_box = bottom_box.unwrap();
    assert!(bottom_box.box_.y >= (res.height as f32 * 0.70) as i32, "Bottom box must be in bottom panel of image, got y={}", bottom_box.box_.y);
}

/// # Indonesian Real-Page Regression: `page_rising_aura_particle_noise.webp` (Resolution: 720 × 2080 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Zero Hallucination Filter on Ambient Particle / Magical Aura Artwork**:
///   Guarantees that magical aura crystal shards and floating particle rings
///   are not hallucinated as `"0.0"`, `"0"`, or `"……"` speech regions.
/// - **Pure Artwork Assertions**:
///   Asserts that total detected regions count is exactly 0.
#[test]
fn test_regression_page_rising_aura_particle_noise() {
    let img = match crate::common::load_fixture_or_skip("id", "page_rising_aura_particle_noise.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_rising_aura_particle_noise: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("id"));
    println!("Indonesian Particle Noise Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. Exact count: exactly 0 regions
    assert_eq!(res.regions.len(), 0, "Artwork-only particle page must have 0 detected regions, got {}", res.regions.len());

    // 2. Explicit negative guards against hallucinated artifacts
    assert!(!res.regions.iter().any(|r| r.text.contains("0.0") || r.text.contains("O.O")), "Must not detect '0.0' or 'O.O'");
    assert!(!res.regions.iter().any(|r| r.text.trim() == "0" || r.text.trim() == "O"), "Must not detect isolated '0' or 'O'");
}

