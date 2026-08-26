// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_demon_hands_green_flame_zero_text_artwork` (RESOLUTION: 880 × 1613)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PURE DRAMATIC ARTWORK PAGE**: Two demonic hands with cyan/green flames hovering over a bowing man.
/// - **ZERO TEXT / ZERO REGIONS**: Must detect exactly 0 regions.
/// - **NEGATIVE GUARD**: Must NOT hallucinate single-character pseudo-text (e.g. `"市"`) on dark background shadows.
#[test]
fn test_regression_page_demon_hands_green_flame_zero_text_artwork() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_demon_hands_green_flame_zero_text_artwork/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_demon_hands_green_flame_zero_text_artwork: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!("Chinese Demon Hands Artwork Page detected {} regions:", res.regions.len());
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

    // 2. NEGATIVE GUARD: NO ARTWORK HALLUCINATIONS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("市")),
        "Must NOT hallucinate '市' on background artwork"
    );
}
