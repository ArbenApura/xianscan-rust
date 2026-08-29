// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_snake_skewer_crackle_sfx_tadak` (RESOLUTION: 690 × 970)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PURE ARTWORK / SFX SCENE (ZERO DIALOGUE)**:
///   The page contains only a snake being roasted on a skewer with fire crackle sound effects (`"타닥"`).
/// - **SUPPRESSED SOUND EFFECTS**:
///   All `"타닥"` onomatopoeia sound effects must be filtered out.
/// - **EXACT COUNTS**: Exactly 0 regions detected on the entire page.
#[test]
fn test_regression_page_snake_skewer_crackle_sfx_tadak() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_snake_skewer_crackle_sfx_tadak/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_snake_skewer_crackle_sfx_tadak: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Snake Skewer SFX Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 0 REGIONS
    crate::assert_element_counts!(res, 0, 0, 0, 0);

    // 2. NEGATIVE CHECK: NO "타닥" SOUND EFFECT DETECTED AS TEXT
    assert!(
        !res.regions.iter().any(|r| r.text.contains("타닥")),
        "Sound effect '타닥' must be filtered out"
    );
}
