// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_iv_drip_sedative_squeeze_sfx` (RESOLUTION: 690 × 1669)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP SPEECH BUBBLE**: `"선생님 들어오시면\n바로 수면약 들어갈\n거예요."` (Doctor entrance & sedative dialogue)
/// - **SLANTED ONOMATOPOEIA / SFX**: `"꾸욱"` (Arm squeeze SFX, slanted at approx -10.8°, classified as SoundEffect)
/// - **BOTTOM THOUGHT BUBBLE**: `"아야;;"` / `"아야:;"` (Pain thought bubble with bubble tail circles)
#[test]
fn test_regression_page_iv_drip_sedative_squeeze_sfx() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_iv_drip_sedative_squeeze_sfx/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_iv_drip_sedative_squeeze_sfx: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean IV Drip Sedative Squeeze SFX Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 2 REGIONS (2 DIALOGUEBUBBLES, 0 FREETEXT)
    crate::assert_element_counts!(res, 2, 2, 0);

    // 2. NEGATIVE GUARD: NO MIDDLE SLANTED SFX '꾸욱' EXTRACTED AS FREETEXT
    assert!(!res.regions.iter().any(|r| r.text.contains("꾸욱")), "Must NOT extract squeeze SFX '꾸욱'");

    // 3. TOP SPEECH BUBBLE: [X: ~301, Y: ~404, W: ~328, H: ~196]
    let top_bubble = res.regions.iter().find(|r| r.text.contains("선생님") || r.text.contains("수면약"));
    assert!(top_bubble.is_some(), "Must detect top dialogue bubble about doctor & sedative");
    let top_bubble = top_bubble.unwrap();
    assert_eq!(top_bubble.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(top_bubble, RegionKind::DialogueBubble, 301, 404, 328, 196, 15);
    crate::assert_bubble_bounds!(top_bubble, 283, 386, 365, 238, 20);

    // 4. BOTTOM THOUGHT BUBBLE: [X: ~42, Y: ~1265, W: ~128, H: ~52]
    let bot_bubble = res.regions.iter().find(|r| r.text.contains("아야"));
    assert!(bot_bubble.is_some(), "Must detect bottom thought bubble '아야;;'");
    let bot_bubble = bot_bubble.unwrap();
    assert_eq!(bot_bubble.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(bot_bubble, RegionKind::DialogueBubble, 35, 1240, 142, 102, 15);
    crate::assert_bubble_bounds!(bot_bubble, 25, 1230, 164, 127, 20);
}
