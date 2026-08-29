// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_lightning_city_smoke_sfx_whoosh` (RESOLUTION: 900 × 1346)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **ATMOSPHERIC LIGHTNING & SMOKE SCENE**: City rooftop with smoke and lightning strikes.
/// - **ZERO DIALOGUE / ZERO SFX REGIONS**: Contains only stylized background sound effects (`滋`, `呼`), which must be filtered.
/// - **EXPECTED COUNT**: Exactly 0 regions detected (0 DialogueBubble, 0 SoundEffect, 0 FreeText).
/// - **NEGATIVE GUARDS**: Must NOT leak non-bubble SFX glyphs (`"滋"`, `"呼"`) into FreeText.
#[test]
fn test_regression_page_lightning_city_smoke_sfx_whoosh() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_lightning_city_smoke_sfx_whoosh/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_lightning_city_smoke_sfx_whoosh: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Chinese Lightning City Smoke SFX Page detected {} regions:",
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

    // 2. NEGATIVE GUARDS: NO NON-BUBBLE SFX LEAKING INTO FREE-TEXT
    assert!(
        !res.regions.iter().any(|r| r.text.contains('滋')),
        "Must NOT detect uncontained '滋' SFX as region"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.contains('呼')),
        "Must NOT detect uncontained '呼' SFX as region"
    );
}
