// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # CHINESE REAL-PAGE REGRESSION: `page_chuzhou_internal_energy_true_essence_watermark` (RESOLUTION: 827 x 1653)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **NARRATION BOUNDS & WATERMARK TRIMMING**: `"是内力，\n质量上远\n远比不上\n修仙者的\n真元法力。"` must not swallow trailing site watermark letters (`"·PAMA"`).
/// - **TIGHT TYPESET WIDTH**: The narration typeset width must clamp tightly to the narration column ($W \le 145\text{px}$) instead of stretching across the character's eye ($W = 235\text{px}$).
/// - **STRICT REGION COUNT**: Exactly 8 valid regions (4 DialogueBubble, 0 SoundEffect, 4 FreeText).
#[test]
fn test_regression_page_chuzhou_internal_energy_true_essence_watermark() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_chuzhou_internal_energy_true_essence_watermark/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_chuzhou_internal_energy_true_essence_watermark: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh"));
    println!("Chinese Internal Energy True Essence Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: 8 REGIONS (4 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 4 FREETEXT)
    crate::assert_element_counts!(res, 8, 4, 0, 4);

    // 2. NARRATION BOX: "是内力..." MUST NOT CONTAIN "PAMA" OR EXTEND WIDE OVER THE EYE
    let narration = res
        .regions
        .iter()
        .find(|r| r.text.contains("内力") && r.text.contains("真元"))
        .expect("Narration box '是内力...' must be detected");

    assert!(
        !narration.text.contains("PAMA") && !narration.text.contains("pama"),
        "Narration box text must not contain trailing watermark 'PAMA', found: '{}'",
        narration.text
    );

    assert!(
        narration.box_.w <= 150,
        "Narration box width must be tightly bounded to text column (<= 150px), found: {}",
        narration.box_.w
    );

    // 3. VERIFY BUBBLE CAVITY CLEANING & BOUNDARY PRESERVATION
    crate::assert_bubble_cleaned!(&img, &res);
}
