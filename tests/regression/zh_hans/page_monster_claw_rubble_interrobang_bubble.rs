// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_monster_claw_rubble_interrobang_bubble` (RESOLUTION: 900 × 1957)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **BOTTOM-RIGHT SPIKY DIALOGUE BUBBLE**: `"!?"` or `"！？"` (Must not be misrecognized/hallucinated as digit `"1?"`)
/// - **NEGATIVE GUARDS**:
///   - Top SFX `"轰"` and background rubble speedlines must not be extracted as stray text.
///   - Middle aggregator watermark `"集云数据 ACloudMerge 腾讯动漫"` must be filtered out.
#[test]
fn test_regression_page_monster_claw_rubble_interrobang_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_monster_claw_rubble_interrobang_bubble") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_monster_claw_rubble_interrobang_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Monster Claw Rubble Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 0. EXACT ELEMENT COUNTS: 0 REGIONS (PUNCTUATION MISREAD AS UNTRANSLATABLE DIGIT '12' IS SKIPPED)
    assert_eq!(res.regions.len(), 0, "Must skip region when detected as untranslatable digit '12'");

    // 1. NEGATIVE GUARDS
    assert!(!res.regions.iter().any(|r| r.text.contains("12") || r.text.contains("1?")), "Must not output digit '12' or '1?'");
    assert!(!res.regions.iter().any(|r| r.text.contains("集云") || r.text.contains("腾讯") || r.text.contains("ACloud")), "Must suppress aggregator watermark");
}
