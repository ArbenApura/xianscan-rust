// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_talk_like_that_bottom_narration` (RESOLUTION: 690 x 1986)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP DIALOGUE BUBBLE**: `"마음 급하다고\n그렇게 억지로\n만나려고 하지 마."`
/// - **MIDDLE-RIGHT DIALOGUE BUBBLE**: `"오히려 더\n상처 받을 수\n있다고."`
/// - **BOTTOM LARGE NARRATION / FREE TEXT**: `"그래서 그렇게\n얘기했던 거였나?"`
/// - **STRICT REGION COUNT**: Exactly 3 regions (2 DialogueBubble, 0 SoundEffect, 1 FreeText).
#[test]
fn test_regression_page_talk_like_that_bottom_narration() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_talk_like_that_bottom_narration/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_talk_like_that_bottom_narration: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Talk Like That Bottom Narration Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 3 REGIONS (2 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 1 FREETEXT)
    crate::assert_element_counts!(res, 3, 2, 0, 1);

    // 2. TOP DIALOGUE BUBBLE: [X: 122, Y: 372, W: 248, H: 138]
    let r0 = &res.regions[0];
    assert_eq!(r0.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(r0.text.contains("마음 급하다고") && r0.text.contains("만나려고 하지 마"), "Top bubble must contain dialogue");
    crate::assert_region_bounds!(r0, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 122, 372, 248, 138, 10);

    // 3. MIDDLE-RIGHT DIALOGUE BUBBLE: [X: 443, Y: 1028, W: 190, H: 146]
    let r1 = &res.regions[1];
    assert_eq!(r1.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(r1.text.contains("오히려") && r1.text.contains("상처") && r1.text.contains("있다고"), "Middle-right bubble must contain dialogue");
    crate::assert_region_bounds!(r1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 443, 1028, 190, 146, 10);

    // 4. BOTTOM LARGE NARRATION / FREE TEXT: [X: ~47, Y: ~1461, W: ~602, H: ~205]
    let r2 = &res.regions[2];
    assert_eq!(r2.kind, xianscan_rust::ml::schemas::RegionKind::FreeText);
    assert!(r2.text.contains("그래서 그렇게") && r2.text.contains("얘기했던 거였나"), "Bottom narration must contain '그래서 그렇게\\n얘기했던 거였나?'");
    crate::assert_region_bounds!(r2, xianscan_rust::ml::schemas::RegionKind::FreeText, 47, 1461, 602, 205, 10);
}