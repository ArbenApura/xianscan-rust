// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # RUSSIAN REAL-PAGE REGRESSION: `page_girl_shiver_curved_sfx_tyayan.webp` (RESOLUTION: 720 × 2054)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **CURVED RUSSIAN SFX (`ТЯ-ЯНЬ`)**:
///   ENSURES SLANTED SOUND EFFECT IS RECOGNIZED AS CYRILLIC `ТЯ-ЯНЬ` WITHOUT MISREADING AS LATIN `ЛаН`/`Lan`.
/// - **HANDWRITTEN CYRILLIC ACTION SFX (`вздрог` / `ВЗДРОГ`)**:
///   ENSURES THE STARTLE/SHIVER SFX IS CLASSIFIED CLEANLY AS SOUNDEFFECT.
/// - **NEGATIVE GUARDS**:
///   STRICTLY FORBIDS LATIN HALLUCINATION SLIVERS (`e3tfo`, `ЛаН`).
#[test]
fn test_regression_page_girl_shiver_curved_sfx_tyayan() {
    let img = match crate::common::load_fixture_or_skip("ru", "page_girl_shiver_curved_sfx_tyayan.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_girl_shiver_curved_sfx_tyayan: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ru"));
    println!("Russian Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 2 REGIONS (0 DIALOGUEBUBBLES, 2 SOUNDEFFECTS, 0 FREETEXT)
    crate::assert_element_counts!(res, 2, 0, 2, 0);

    // 2. NO LATIN HALLUCINATIONS OR WRONG GLYPH SLIVERS
    assert!(
        !res.regions.iter().any(|r| r.text.to_lowercase().contains("e3tfo") || r.text.contains("ЛаН")),
        "Must not contain hallucinated Latin noise 'e3tfo' or 'ЛаН'"
    );

    // 3. CURVED SFX: «ТЯ-ЯНЬ» -> [X: 73, Y: 842, W: 365, H: 291] (ANGLE ~29.4 DEG)
    let tyayan = res.regions.iter().find(|r| r.text.to_uppercase().contains("ТЯ-ЯНЬ") || r.text.to_uppercase().contains("ТЯЯНЬ"));
    assert!(tyayan.is_some(), "Must recognize curved Cyrillic SFX 'ТЯ-ЯНЬ'");
    let tyayan = tyayan.unwrap();
    crate::assert_region_bounds!(tyayan, xianscan_rust::ml::schemas::RegionKind::SoundEffect, 73, 842, 365, 291, 8);
    crate::assert_region_angle!(tyayan, 29.4, 3.0);

    // 4. ACTION SFX 2: 'ВЗДРОГ' -> [X: 569, Y: 1145, W: 144, H: 112] (ANGLE ~26.97 DEG)
    let sfx2 = res.regions.iter().find(|r| r.text.to_uppercase().contains("ВЗДРОГ") || r.text.contains("З202"));
    assert!(sfx2.is_some(), "Must recognize secondary action SFX 'ВЗДРОГ'");
    let sfx2 = sfx2.unwrap();
    assert_eq!(sfx2.text.trim(), "ВЗДРОГ");
    crate::assert_region_bounds!(sfx2, xianscan_rust::ml::schemas::RegionKind::SoundEffect, 569, 1145, 144, 112, 8);
    crate::assert_region_angle!(sfx2, 26.97, 3.0);
}
