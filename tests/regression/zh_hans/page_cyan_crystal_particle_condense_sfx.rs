// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_cyan_crystal_particle_condense_sfx` (RESOLUTION: 900 × 1844)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **ZERO DETECTIONS / PURE ARTWORK & SFX PAGE**:
///   - Large non-bubble onomatopoeia / SFX glyphs (`"锁"`, `"凝聚"`) and particle effects must be suppressed.
///   - Must result in exactly 0 detected regions.
#[test]
fn test_regression_page_cyan_crystal_particle_condense_sfx() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_cyan_crystal_particle_condense_sfx") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_cyan_crystal_particle_condense_sfx: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Cyan Crystal Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 0. EXACT ELEMENT COUNTS: EXACTLY 0 REGIONS (0 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT)
    crate::assert_element_counts!(res, 0, 0, 0);
}
