// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_meditating_martial_artist_vibration_sfx` (RESOLUTION: 690 × 1909)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP NARRATION BOX**: `"지금 나의\n내공은 이갑자 반."` (Martial artist evaluating internal energy)
/// - **BOTTOM NARRATION BOX**: `"지금 이 몸으로\n더 버틸 수 있을까"` (Martial artist questioning body endurance)
/// - **VIBRATION SFX SUPPRESSION**: Suppress background vibration humming sound effects (`웅 웅 ...`) outside speech containers.
#[test]
fn test_regression_page_meditating_martial_artist_vibration_sfx() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_meditating_martial_artist_vibration_sfx/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_meditating_martial_artist_vibration_sfx: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Meditating Martial Artist Vibration SFX Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 2 REGIONS (2 FREETEXT / DIALOGUE REGIONS, 0 SFX)
    crate::assert_element_counts!(res, 2, 0, 2);

    // 2. NEGATIVE GUARD: NO BACKGROUND VIBRATION SFX '웅' EXTRACTED AS FREETEXT
    assert!(!res.regions.iter().any(|r| r.text.contains('웅')), "Must NOT extract vibration SFX '웅'");

    // 3. TOP NARRATION BOX: [X: 171, Y: 261, W: 374, H: 128]
    let top_box = res.regions.iter().find(|r| r.text.contains("지금 나의") || r.text.contains("내공은"));
    assert!(top_box.is_some(), "Must detect top narration box about internal energy");
    let top_box = top_box.unwrap();
    assert_eq!(top_box.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(top_box, RegionKind::FreeText, 171, 261, 374, 128, 25);

    // 4. BOTTOM NARRATION BOX: [X: 162, Y: 1577, W: 394, H: 136]
    let bot_box = res.regions.iter().find(|r| r.text.contains("지금 이 몸으로") || r.text.contains("버틸 수"));
    assert!(bot_box.is_some(), "Must detect bottom narration box '지금 이 몸으로 더 버틸 수 있을까'");
    let bot_box = bot_box.unwrap();
    assert_eq!(bot_box.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(bot_box, RegionKind::FreeText, 162, 1577, 394, 136, 25);
}
