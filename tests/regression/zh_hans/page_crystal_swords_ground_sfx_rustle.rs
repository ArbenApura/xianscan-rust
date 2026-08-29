// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_crystal_swords_ground_sfx_rustle` (RESOLUTION: 900 × 1160)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **ACTION BATTLE GROUND SFX**: Two glowing swords stabbed into ground with scattered ground onomatopoeia (`碌`, `咔`, `骨`).
/// - **WATERMARK & SFX SUPPRESSION**: Aggregator watermarks (`集云数据`, `ACloudMerge`) and sound effects are suppressed.
/// - **EXPECTED COUNT**: Exactly 0 regions detected (0 DialogueBubble, 0 SoundEffect, 0 FreeText).
/// - **NEGATIVE GUARDS**: Must NOT leak non-bubble SFX glyphs (`"碌"`, `"咔"`, `"骨"`) or watermarks into FreeText.
#[test]
fn test_regression_page_crystal_swords_ground_sfx_rustle() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_crystal_swords_ground_sfx_rustle/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_crystal_swords_ground_sfx_rustle: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Chinese Crystal Swords Ground SFX Page detected {} regions:",
        res.regions.len()
    );
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 0 REGIONS (0 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 0 FREETEXT)
    crate::assert_element_counts!(res, 0, 0, 0, 0);

    // 2. NEGATIVE GUARDS: NO UNCONTAINED SFX OR WATERMARKS LEAKING INTO FREE-TEXT
    assert!(
        !res.regions.iter().any(|r| r.text.contains('碌')),
        "Must NOT detect uncontained '碌' SFX as region"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.contains('咔')),
        "Must NOT detect uncontained '咔' SFX as region"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.contains('骨')),
        "Must NOT detect uncontained '骨' SFX as region"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.contains("集云") || r.text.contains("ACloud")),
        "Must NOT detect aggregator watermark as region"
    );
}
