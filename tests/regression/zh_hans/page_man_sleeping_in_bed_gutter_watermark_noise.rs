// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_man_sleeping_in_bed_gutter_watermark_noise` (RESOLUTION: 880 × 2344)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **SILENT RAINSTORM SCENE**: Man sleeping / sweating in bed across 3 panels.
/// - **ZERO TEXT / ZERO REGIONS**: Must detect exactly 0 regions.
/// - **NEGATIVE GUARD**: Must NOT extract faint gutter platform watermark text (e.g. `"朱达"` / `"集云数据"` / `"腾讯动漫"`) as free text or dialogue.
#[test]
fn test_regression_page_man_sleeping_in_bed_gutter_watermark_noise() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_man_sleeping_in_bed_gutter_watermark_noise/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_man_sleeping_in_bed_gutter_watermark_noise: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!("Chinese Man Sleeping in Bed Page detected {} regions:", res.regions.len());
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

    // 2. NEGATIVE GUARD: NO WATERMARK / GUTTER HALLUCINATIONS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("朱达") || r.text.contains("集云") || r.text.contains("腾讯")),
        "Must NOT extract gutter watermark noise as text"
    );
}
