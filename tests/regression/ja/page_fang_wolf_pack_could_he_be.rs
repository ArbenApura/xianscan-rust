// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_fang_wolf_pack_could_he_be` (RESOLUTION: 1125 × 1417 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **MISSED BOTTOM MONOLOGUE DETECTION (`彼が―― ……？`)**:
///   IN THE BOTTOM PANEL ABOVE GALE'S HEAD, A VERTICAL MONOLOGUE ASKS `彼が――\n……？`.
///   DETECTION MUST NOT MISS THIS REGION ENTIRELY.
/// - **LINE TAIL TRUNCATION PREVENTION (`このパーティに`)**:
///   IN PANEL 2, `このパーティに` WAS TRUNCATED TO `このパーテ`, DROPPING `に` AND LEAVING IT VISIBLE ON THE ARTWORK.
///   THE OCR BOUNDING BOX AND TEXT MUST COVER THE TERMINAL PARTICLE `に`.
#[test]
fn test_regression_page_fang_wolf_pack_could_he_be() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_fang_wolf_pack_could_he_be.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_fang_wolf_pack_could_he_be: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 1125x1417 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, box={:?}, bubble_box={:?}, text='{}', conf={:.2}, vert={}",
            i, r.kind, r.box_, r.bubble_box, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. MUST DETECT AT LEAST 4 REGIONS (PREVIOUSLY ONLY 3 DUE TO MISSED '彼が―― ……？')
    assert!(res.regions.len() >= 4, "Must detect at least 4 regions on page, found {}", res.regions.len());

    // 1. PANEL 2 UPPER-RIGHT MONOLOGUE: 'それが可能な呪具師が今このパーティにいないなら'
    let party_monologue = res.regions.iter().find(|r| r.text.contains("呪具師") || r.text.contains("それが可能"));
    assert!(party_monologue.is_some(), "Must detect panel 2 party cursed tool smith monologue");
    let party_monologue = party_monologue.unwrap();
    assert!(
        party_monologue.text.contains("パーティに") || party_monologue.text.contains("にいない") || party_monologue.text.contains("に"),
        "Must not truncate line to 'パーテ', text='{}'", party_monologue.text
    );

    // 2. PANEL 2 MID-LEFT MONOLOGUE: '牙狼の群れはそもそもSランクに相当する腕前なのか'
    let wolf_pack = res.regions.iter().find(|r| r.text.contains("牙狼") || r.text.contains("Sランク"));
    assert!(wolf_pack.is_some(), "Must detect panel 2 fang wolf pack monologue");

    // 3. PANEL 2 HOODED CHARACTER: 'まさか'
    let masaka = res.regions.iter().find(|r| r.text.contains("まさか"));
    assert!(masaka.is_some(), "Must detect panel 2 'まさか' monologue");

    // 4. BOTTOM PANEL: '彼が―― ……？'
    // PREVIOUSLY MISSED ENTIRELY
    let could_he_be = res.regions.iter().find(|r| r.box_.y >= 750 && (r.text.contains("彼") || r.text.contains("?") || r.text.contains("？")));
    assert!(could_he_be.is_some(), "Must detect bottom panel '彼が―― ……？' monologue");
}
