// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_in_decades_years_narration_box` (RESOLUTION: 900 × 1211)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **NARRATION RECTANGLE OVERLAPPING PANEL**: Rectangular narration box `在数十年的岁月里…` crossing panel border.
/// - **SFX & WATERMARK SUPPRESSION**: Background glowing `嗡` sound effects and `腾讯动漫` watermark are suppressed.
/// - **EXPECTED COUNT**: Exactly 1 region (1 DialogueBubble/Narration, 0 SoundEffect, 0 FreeText).
/// - **BOUNDS & TEXT INTEGRITY**: Text must contain `在数十年的岁月里`.
#[test]
fn test_regression_page_in_decades_years_narration_box() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_in_decades_years_narration_box/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_in_decades_years_narration_box: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Chinese In Decades of Years Narration Page detected {} regions:",
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 1 REGION (1 DIALOGUE/NARRATION, 0 SOUNDEFFECT, 0 FREETEXT)
    crate::assert_element_counts!(res, 1, 1, 0, 0);

    // 2. REGION 0: NARRATION RECTANGLE BOUNDS & TEXT
    let r0 = &res.regions[0];
    crate::assert_region_bounds!(r0, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 112, 282, 400, 70, 8);
    crate::assert_bubble_bounds!(r0, 52, 242, 512, 153, 8);
    crate::assert_region_angle!(r0, 0.0, 2.0);
    assert!(
        r0.text.contains("在数十年的岁月里"),
        "Region 0 text must contain '在数十年的岁月里', got '{}'",
        r0.text
    );

    // 3. NEGATIVE GUARDS: NO SFX OR WATERMARK REGIONS
    assert!(
        !res.regions.iter().any(|r| r.text.contains('嗡')),
        "Must NOT detect uncontained '嗡' SFX as region"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.contains("腾讯")),
        "Must NOT detect '腾讯动漫' watermark as region"
    );
}
