// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # CHINESE REAL-PAGE REGRESSION: `page_pirate_flag_east_wind_caption` (RESOLUTION: 640 × 1135)
///
/// ## CONTEXT & PURPOSE:
/// - Source: Production page 109978 (seq 3), native 640 × 1135 (One Piece Chinese edition).
/// - Scene: 5 narration boxes + 4 speech bubbles; the black pirate flag panel carries a vertical caption
///   `"吹的是东风。"` to the right of the flag, beside the white-outlined SFX `バギュ` burst.
/// - PRODUCTION FAILURE (v0.5.0-beta.1): The flag-panel caption `"吹的是东风"` was not recognized at all,
///   so it stayed untranslated in the exported page.
/// - EXPECTED: 9 regions — the 8 verified bubbles/narrations + the missing flag caption as FreeText.
#[test]
fn test_regression_page_pirate_flag_east_wind_caption() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_pirate_flag_east_wind_caption/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_pirate_flag_east_wind_caption: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("=== Chinese Pirate Flag East Wind Caption Page ===");
    println!("Detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  [Region {}] id={}, kind={:?}, text=\"{}\", conf={:.3}, angle={:.2}, vertical={}, box={:?}, bubble_box={:?}",
            i,
            r.id,
            r.kind,
            r.text.replace('\n', "\\n"),
            r.confidence,
            r.angle,
            r.vertical,
            r.box_,
            r.bubble_box
        );
    }

    // 1. EXACT ELEMENT COUNTS: ALL 9 REGIONS ARE DIALOGUE BUBBLES (CAPTION SITS IN ITS OWN BOX)
    crate::assert_element_counts!(res, 9, 9, 0, 0);

    // 2. THE FLAG-PANEL CAPTION "吹的是东风。" MUST BE DETECTED (DIALOGUE-BACKED NARRATION BOX)
    let caption = res
        .regions
        .iter()
        .find(|r| r.text.contains("东风"))
        .expect("Flag panel caption '吹的是东风。' must be detected");
    assert_eq!(
        caption.kind,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        "Flag caption must be classified as DialogueBubble"
    );
    assert!(
        caption.text.contains("东风"),
        "Caption must capture '吹的是东风', got: '{}'",
        caption.text.replace('\n', "\\n")
    );
    crate::assert_region_angle!(caption, 0.0, 2.0);
    crate::assert_region_bounds!(caption, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 522, 361, 38, 114, 8);
    crate::assert_bubble_bounds!(caption, 512, 361, 62, 117, 8);
    assert!(
        caption.box_.x + caption.box_.w <= 640,
        "Caption must stay inside the flag panel column, got box={:?}",
        caption.box_
    );

    // 3. EXISTING REGIONS REMAIN CORRECT (KEY SANITY)
    assert!(
        res.regions.iter().any(|r| r.text.contains("路飞") && r.text.contains("干什么")),
        "'喂！路飞，你想干什么？' bubble must exist"
    );
    assert!(
        res.regions.iter().any(|r| r.text.contains("蒙奇") && r.text.contains("路飞")),
        "'小镇少年蒙奇·D·路飞' caption bubble must exist"
    );
}
