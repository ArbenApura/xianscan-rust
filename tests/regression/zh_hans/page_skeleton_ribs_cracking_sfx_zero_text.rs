// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_skeleton_ribs_cracking_sfx_zero_text` (RESOLUTION: 640 × 1118)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1**: Skeleton chest clutching action scene with watermark (Zero text/dialogue).
/// - **PANEL 2**: Slanted bone cracking SFX (`"咔嚓"` / `"味察"` misread on diagonal red ribs) must be suppressed.
/// - **PANEL 3**: Rib sizzling SFX (`"滋"`) must be suppressed.
/// - **PANEL 4**: Scream SFX calligraphy (`"啊！"`) on background must be suppressed.
/// - **EXACT COUNTS**: Exactly 0 regions (0 dialogue bubbles, 0 sound effects, 0 free text).
#[test]
fn test_regression_page_skeleton_ribs_cracking_sfx_zero_text() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_skeleton_ribs_cracking_sfx_zero_text.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_skeleton_ribs_cracking_sfx_zero_text: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Skeleton Ribs Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 0 REGIONS
    crate::assert_element_counts!(res, 0, 0, 0);

    // 2. NEGATIVE GUARDS AGAINST SFX HALLUCINATION / MISREADS
    assert!(!res.regions.iter().any(|r| r.text.contains("味察") || r.text.contains("咔嚓")), "Must NOT extract panel 2 bone cracking SFX as FreeText");
    assert!(!res.regions.iter().any(|r| r.text.contains("滋")), "Must NOT extract panel 3 sizzling SFX as FreeText");
    assert!(!res.regions.iter().any(|r| r.text.contains("啊")), "Must NOT extract panel 4 scream calligraphy as FreeText");
}
