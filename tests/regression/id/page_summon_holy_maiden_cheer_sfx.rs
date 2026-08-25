// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # INDONESIAN REAL-PAGE REGRESSION: `page_summon_holy_maiden_cheer_sfx.webp` (RESOLUTION: 720 × 2239)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **UPPER HOLY MAIDEN DIALOGUE BUBBLE**:
///   `"BER-\nBERHASIL...\nAKU BERHASIL\nMEMANGGIL\nMEREKA."`
/// - **SLANTED INDONESIAN CROWD SFX & SHOUTS**:
///   1. `"HO0O"` (SoundEffect)
///   2. `"WAAA!"` (SoundEffect)
///   3. `"SUCI...!"` (DialogueBubble / EXCLAMATION BUBBLE)
///   4. `"GADIS SUCI\nTELAH TIBA!"` (DialogueBubble)
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
    println!("Indonesian Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 5 REGIONS (4 DIALOGUEBUBBLES, 1 SOUNDEFFECT, 0 FREETEXT)
    crate::assert_element_counts!(res, 5, 4, 1, 0);

    // 2. UPPER HOLY MAIDEN DIALOGUE BUBBLE:
    // TEXT BOUNDS: 'BER-\nBERHASIL...' -> [X: 140, Y: 589, W: 242, H: 207]
    // OUTER SPEECH BUBBLE BOUNDS: [X: 19, Y: 508, W: 490, H: 350]
    let summon_bubble = res.regions.iter().find(|r| r.text.to_uppercase().contains("BERHASIL") || r.text.to_uppercase().contains("MEMANGGIL"));
    assert!(summon_bubble.is_some(), "Must detect upper speech bubble 'BER-BERHASIL...'");
    let summon_bubble = summon_bubble.unwrap();
    crate::assert_region_bounds!(summon_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 140, 589, 242, 207, 8);
    crate::assert_bubble_bounds!(summon_bubble, 19, 508, 490, 350, 10);
    assert!(
        !summon_bubble.text.to_uppercase().contains("HEBAT"),
        "Top speech bubble must not merge with 'HEBAT!!' bubble"
    );

    // 3. SOUND EFFECT: 'HO0O' / 'HOOO' -> [X: 47, Y: 1007, W: 344, H: 218] (SLANTED ~6.88 DEG)
    let sfx = res.regions.iter().find(|r| r.text.to_uppercase().contains("HO0O") || r.text.to_uppercase().contains("HOOO"));
    assert!(sfx.is_some(), "Must detect 'HO0O' / 'HOOO' SoundEffect");
    let sfx = sfx.unwrap();
    crate::assert_region_bounds!(sfx, xianscan_rust::ml::schemas::RegionKind::SoundEffect, 47, 1007, 344, 218, 10);
    crate::assert_region_angle!(sfx, 6.88, 2.0);

    // 4. SEPARATE RIGHT SPIKY BUBBLE:
    // TEXT BOUNDS: 'HEBAT!!' -> [X: 468, Y: 1171, W: 127, H: 37]
    // OUTER SPEECH BUBBLE BOUNDS: [X: 393, Y: 1081, W: 292, H: 223]
    let hebat_bubble = res.regions.iter().find(|r| r.text.to_uppercase().contains("HEBAT"));
    assert!(hebat_bubble.is_some(), "Must detect separate 'HEBAT!!' bubble");
    let hebat_bubble = hebat_bubble.unwrap();
    crate::assert_region_bounds!(hebat_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 468, 1171, 127, 37, 8);
    crate::assert_bubble_bounds!(hebat_bubble, 393, 1081, 292, 223, 10);
    assert!(
        !hebat_bubble.text.to_uppercase().contains("MEMANGGIL"),
        "'HEBAT!!' bubble must be separate from maiden speech bubble"
    );

    // 5. MIDDLE LEFT BUBBLE:
    // TEXT BOUNDS: 'KAU BENAR-BENAR GADIS SUCI!' -> [X: 68, Y: 1324, W: 211, H: 108]
    // OUTER SPEECH BUBBLE BOUNDS: [X: 6, Y: 1267, W: 364, H: 231]
    let middle_bubble = res.regions.iter().find(|r| {
        let t = r.text.to_uppercase();
        t.contains("GADIS SUCI") || (t.contains("BENAR") && t.contains("KAU"))
    });
    assert!(middle_bubble.is_some(), "Must detect middle 'GADIS SUCI' bubble");
    let middle_bubble = middle_bubble.unwrap();
    crate::assert_region_bounds!(middle_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 68, 1324, 211, 108, 8);
    crate::assert_bubble_bounds!(middle_bubble, 6, 1267, 364, 231, 10);

    // 6. BOTTOM BUBBLE:
    // TEXT BOUNDS: 'KITA TELAH BERHASIL MEMANGGIL PARA KESATRIA...' -> [X: 274, Y: 2008, W: 330, H: 215]
    // OUTER SPEECH BUBBLE BOUNDS: [X: 187, Y: 1918, W: 510, h: 314]
    let bottom_bubble = res.regions.iter().find(|r| {
        let t = r.text.to_uppercase();
        t.contains("KESATRIA") || t.contains("TERSELAMATKAN")
    });
    assert!(bottom_bubble.is_some(), "Must detect bottom speech bubble");
    let bottom_bubble = bottom_bubble.unwrap();
    crate::assert_region_bounds!(bottom_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 274, 2008, 330, 215, 8);
    crate::assert_bubble_bounds!(bottom_bubble, 187, 1918, 510, 314, 10);

    // 7. EXPLICIT NEGATIVE GUARDS AGAINST HALLUCINATED ARTIFACTS & GIANT MERGES
    assert!(!res.regions.iter().any(|r| r.text.trim() == "Dr"), "Must filter isolated 'Dr' artwork artifact");
    assert!(
        !res.regions.iter().any(|r| {
            let t = r.text.to_uppercase();
            t.contains("MEMANGGIL MEREKA") && t.contains("HEBAT")
        }),
        "Must never produce giant merged box containing both maiden speech and HEBAT"
    );
}
