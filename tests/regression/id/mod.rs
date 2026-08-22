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
///      are cleanly detected and recognized as distinct regions.
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


/// # Indonesian Real-Page Regression: `page_summon_holy_maiden_cheer_sfx.webp` (Resolution: 720 × 2239 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Disparate Element Separation (Bubble vs. SFX vs. Distinct Reaction Bubble)**:
///   Guarantees that:
///   1. Top Maiden Speech Bubble (`BER-BERHASIL...`)
///   2. Free-floating Sound Effect / Exclamation (`HOOO`)
///   3. Distinct Right Spiky Bubble (`HEBAT!!`)
///      are never unified into a single giant monologue box.
/// - **Artwork Hallucination Filtering**:
///   Guarantees that isolated suit fold artifact `"Dr"` is filtered.
/// - **Full Dialogue Unification**:
///   Guarantees middle speech bubble (`KAU BENAR-BENAR GADIS SUCI!`) and bottom
///   monologue (`KITA TELAH BERHASIL MEMANGGIL PARA KESATRIA...`) are captured intact.
#[test]
fn test_regression_page_summon_holy_maiden_cheer_sfx() {
    let img = match crate::common::load_fixture_or_skip("id", "page_summon_holy_maiden_cheer_sfx.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_summon_holy_maiden_cheer_sfx: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("id"));
    println!("Holy Maiden Cheer Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. Exact count: 4 or 5 regions (depending on whether HOOO SFX is detected as separate free text or preserved)
    assert!(
        res.regions.len() >= 4 && res.regions.len() <= 5,
        "Holy Maiden Cheer Page must have 4 or 5 clean detected regions, got {}",
        res.regions.len()
    );

    // 2. Top Bubble (Holy Maiden): 'BER-BERHASIL...'
    let top_bubble = res.regions.iter().find(|r| {
        let t = r.text.to_uppercase();
        t.contains("BERHASIL") && (t.contains("MEMANGGIL") || t.contains("MEREKA"))
    });
    assert!(top_bubble.is_some(), "Must detect top Holy Maiden speech bubble");
    let top_bubble = top_bubble.unwrap();
    // Top bubble must NOT be bloated to include HEBAT or the lower panel
    assert!(
        top_bubble.box_.y + top_bubble.box_.h <= 1050,
        "Top bubble bottom edge ({}) must not bleed into lower panel / SFX / HEBAT bubble (expected <= 1050)",
        top_bubble.box_.y + top_bubble.box_.h
    );
    assert!(
        !top_bubble.text.to_uppercase().contains("HEBAT"),
        "Top speech bubble must not merge with 'HEBAT!!' bubble"
    );

    // 3. Separate Right Spiky Bubble: 'HEBAT!!'
    let hebat_bubble = res.regions.iter().find(|r| r.text.to_uppercase().contains("HEBAT"));
    assert!(hebat_bubble.is_some(), "Must detect separate 'HEBAT!!' bubble");
    let hebat_bubble = hebat_bubble.unwrap();
    assert!(
        !hebat_bubble.text.to_uppercase().contains("MEMANGGIL"),
        "'HEBAT!!' bubble must be separate from maiden speech bubble"
    );

    // 4. Middle Left Bubble: 'KAU BENAR-BENAR GADIS SUCI!'
    let middle_bubble = res.regions.iter().find(|r| {
        let t = r.text.to_uppercase();
        t.contains("GADIS SUCI") || (t.contains("BENAR") && t.contains("KAU"))
    });
    assert!(middle_bubble.is_some(), "Must detect middle 'GADIS SUCI' bubble");

    // 5. Bottom Bubble: 'KITA TELAH BERHASIL MEMANGGIL PARA KESATRIA...'
    let bottom_bubble = res.regions.iter().find(|r| {
        let t = r.text.to_uppercase();
        t.contains("KESATRIA") || t.contains("TERSELAMATKAN")
    });
    assert!(bottom_bubble.is_some(), "Must detect bottom speech bubble");

    // 6. Explicit negative guards against hallucinated artifacts & giant merges
    assert!(!res.regions.iter().any(|r| r.text.trim() == "Dr"), "Must filter isolated 'Dr' artwork artifact");
    assert!(
        !res.regions.iter().any(|r| {
            let t = r.text.to_uppercase();
            t.contains("MEMANGGIL MEREKA") && t.contains("HEBAT")
        }),
        "Must never produce giant merged box containing both maiden speech and HEBAT"
    );
}


