// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_tang_san_hammer_forging_timing_force` (RESOLUTION: 900 x 1296)
///
/// ## PURPOSE & BEHAVIOR TESTED
/// - Verify that panel 2 left dialogue bubble is detected:
///   - `"厉害！"` (DialogueBubble)
/// - Verify that panel 2 right narration / thought is unified into a single clean region:
///   - `"力量、时机、着力\n点……全部恰到好\n处！"` (FreeText)
/// - Verify that the wide phantom line spanning Tang San's hair (`w: 460`) is eliminated.
/// - Verify that total element count is exactly 2 regions (1 DialogueBubble, 0 SFX, 1 FreeText).
#[test]
fn test_regression_page_tang_san_hammer_forging_timing_force() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_tang_san_hammer_forging_timing_force/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_tang_san_hammer_forging_timing_force, fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!(
        "Douluo Hammer Forging Page detected {} regions:",
        res.regions.len()
    );
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2} deg, box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: 2 REGIONS (1 DIALOGUE BUBBLE, 1 FREE TEXT)
    crate::assert_element_counts!(res, 2, 1, 1);

    // 2. PANEL 2 LEFT BUBBLE: "厉害！"
    let amazing = res
        .regions
        .iter()
        .find(|r| r.text.contains("厉害"));
    assert!(amazing.is_some(), "Must detect panel 2 dialogue bubble '厉害！'");
    let amazing = amazing.unwrap();
    assert_eq!(amazing.kind, RegionKind::DialogueBubble);

    // 3. PANEL 2 RIGHT NARRATION: "力量、时机、着力\n点……全部恰到好\n处！"
    let timing_force = res
        .regions
        .iter()
        .find(|r| r.text.contains("时机") && r.text.contains("恰到好"));
    assert!(
        timing_force.is_some(),
        "Must detect panel 2 right narration '力量、时机、着力...全部恰到好处！'"
    );
    let timing_force = timing_force.unwrap();
    assert_eq!(timing_force.kind, RegionKind::FreeText);
    assert!(
        timing_force.text.contains("力量") && timing_force.text.contains("着力"),
        "Right narration must contain full sentence context"
    );

    // 4. NEGATIVE GUARDS: NO PHANTOM SPANNING LINE OR GARBLED DUPLICATION
    assert!(
        !res.regions.iter().any(|r| r.box_.w >= 300 && r.box_.y < 400),
        "Must not generate wide phantom line spanning Tang San's head"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.contains("7量") || r.text.contains("差力")),
        "Must not include garbled OCR duplicate fragments"
    );
}
