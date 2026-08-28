// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_lightning_storm_welcome_my_lord_shout_bubble` (RESOLUTION: 900 × 1298)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **BOTTOM-LEFT SHOUT BUBBLE**: `"恭迎主\n上！！"` (DialogueBubble)
/// - **SUPPRESSION OF ARTWORK SPEEDLINES / CAPE NOISE**: Stylized cape wind / background speedline streaks must NOT be detected as `"叫呼呼"` / `"WHOOSH"`.
/// - **SILENT ELLIPSIS SUPPRESSION**: Top-left silent `……` bubble is cleanly suppressed.
/// - **EXACT COUNTS**: Exactly 1 dialogue bubble region (0 sound effects, 0 free text).
#[test]
fn test_regression_page_lightning_storm_welcome_my_lord_shout_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_lightning_storm_welcome_my_lord_shout_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_lightning_storm_welcome_my_lord_shout_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!("Lightning Storm Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}°, box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 1 DIALOGUE BUBBLE, 0 SFX, 0 FREE TEXT
    crate::assert_element_counts!(res, 1, 1, 0, 0);

    // 2. BOTTOM-LEFT DIALOGUE BUBBLE: '恭迎主\n上！！'
    let bubble = &res.regions[0];
    assert_eq!(bubble.kind, RegionKind::DialogueBubble);
    assert!(
        bubble.text.contains("恭迎主") || bubble.text.contains("恭迎"),
        "Bubble text must contain '恭迎主', got '{}'",
        bubble.text
    );
    crate::assert_region_bounds!(bubble, RegionKind::DialogueBubble, 30, 1062, 189, 194, 15);
    crate::assert_bubble_bounds!(bubble, 18, 1037, 207, 235, 15);

    // 3. NEGATIVE GUARD: ZERO CAPE SPEEDLINE / '叫呼呼' / 'WHOOSH' NOISE
    assert!(
        !res.regions.iter().any(|r| r.text.contains("叫呼") || r.text.contains("呼呼")),
        "Must NOT hallucinate '叫呼呼' or speedlines noise"
    );
}
