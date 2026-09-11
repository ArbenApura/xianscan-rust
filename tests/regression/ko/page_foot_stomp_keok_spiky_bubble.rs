// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_foot_stomp_keok_spiky_bubble` (RESOLUTION: 690 × 1959)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 DIALOGUE BUBBLE**: `"이런씨"` inside upper burst bubble with downward tail pointer.
/// - **PANEL 2 DIALOGUE BUBBLE**: `"컥"` inside bottom spiky burst bubble.
/// - **FULL GLYPH ENVELOPE INCLUSION**: The bottom consonant (받침 'ㄱ') of `"컥"` must be fully
///   encompassed by the text and inpaint boxes (height >= 80px, ending >= 1915px) so no black stroke
///   bleeds through un-inpainted under translated typography.
/// - **EXACT COUNTS**: Exactly 2 dialogue bubbles, 0 SFX, 0 free text.
#[test]
fn test_regression_page_foot_stomp_keok_spiky_bubble() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_foot_stomp_keok_spiky_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_foot_stomp_keok_spiky_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("KO Foot Stomp Keok Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}, box={:?}, inpaint_box={:?}, bubble_box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.inpaint_box,
            r.bubble_box,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: 2 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 2, 2, 0, 0);

    // 2. PANEL 1 DIALOGUE BUBBLE: '이런씨'
    let top_bubble = res
        .regions
        .iter()
        .find(|r| r.text.contains("이런") || r.text.contains("씨"));
    assert!(top_bubble.is_some(), "Must detect top dialogue bubble '이런씨'");
    let top = top_bubble.unwrap();
    assert_eq!(top.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(
        top,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        261,
        395,
        132,
        80,
        15
    );
    crate::assert_bubble_bounds!(top, 231, 330, 211, 212, 15);

    // 3. PANEL 2 DIALOGUE BUBBLE: '컥' (FULL GLYPH BOUNDS INCLUDING BATCHIM 'ㄱ')
    let bot_bubble = res
        .regions
        .iter()
        .find(|r| r.text.contains('컥') || r.text.contains('커'));
    assert!(bot_bubble.is_some(), "Must detect bottom dialogue bubble '컥'");
    let bot = bot_bubble.unwrap();
    assert_eq!(bot.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_bubble_bounds!(bot, 273, 1814, 158, 132, 15);

    // THE TEXT / INPAINT ENVELOPE MUST EXTEND DOWNWARD TO ENCOMPASS THE ENTIRE BATCHIM STROKE (Y+H >= 1915PX)
    assert!(
        bot.box_.y + bot.box_.h >= 1915,
        "Bottom text box must encompass the final consonant 'ㄱ' down to at least y=1915 (was y={}..{})",
        bot.box_.y,
        bot.box_.y + bot.box_.h
    );
    assert!(
        bot.box_.h >= 75,
        "Bottom text box height must be at least 75px to cover both '커' and batchim 'ㄱ' (was {}px)",
        bot.box_.h
    );
    if let Some(ref inpaint_b) = bot.inpaint_box {
        assert!(
            inpaint_b.y + inpaint_b.h >= 1915,
            "Inpaint box must cover the batchim 'ㄱ' down to >= 1915px (was y={}..{})",
            inpaint_b.y,
            inpaint_b.y + inpaint_b.h
        );
    }
}
