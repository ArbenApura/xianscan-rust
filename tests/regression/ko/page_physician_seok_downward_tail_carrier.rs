// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_physician_seok_downward_tail_carrier` (RESOLUTION: 640 × 1193)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP DIALOGUE BUBBLE**:
///   `"…맹?\n무슨 맹?"`
///   Clean top dialogue bubble in the upper quadrant.
/// - **BOTTOM SPEECH BUBBLE WITH PROTRUDING DOWNWARD TAIL**:
///   `"그리고\n수배령이라니?"`
///   Speech bubble with an elongated downward pointing tail.
///   Derive carrier trims the tail slack to extract the true visual balloon chamber, and verifies
///   the resulting typeset box is centered within the new carrier boundary without bleeding into the tail.
/// - **EXACT COUNTS**: Exactly 2 dialogue bubbles (2 bubbles, 0 SFX, 0 free text).
#[test]
fn test_regression_page_physician_seok_downward_tail_carrier() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_physician_seok_downward_tail_carrier/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_physician_seok_downward_tail_carrier: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Physician Seok Tail Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}, box={:?}, bubble_box={:?}, typeset_box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.bubble_box,
            r.typeset_box,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 2 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 2, 2, 0, 0);

    // 2. TOP DIALOGUE BUBBLE: "…맹? 무슨 맹?"
    let top_reg = &res.regions[0];
    assert_eq!(
        top_reg.kind,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        "Top region must be classified as DialogueBubble"
    );
    assert!(
        top_reg.text.contains("맹"),
        "Must contain top dialogue text, got: '{}'",
        top_reg.text
    );

    // 3. BOTTOM SPEECH BUBBLE WITH TAIL: "그리고 수배령이라니?"
    let bot_reg = &res.regions[1];
    assert_eq!(
        bot_reg.kind,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        "Bottom region must be classified as DialogueBubble"
    );
    assert!(
        bot_reg.text.contains("수배령") || bot_reg.text.contains("그리고"),
        "Must contain bottom dialogue text, got: '{}'",
        bot_reg.text
    );

    let bb = bot_reg.bubble_box.as_ref().expect("bubble_box must exist");
    let tb = bot_reg.typeset_box.as_ref().expect("typeset_box must exist");

    // Typeset box must not expand into the bottom tail
    assert!(
        tb.y + tb.h < bb.y + bb.h,
        "Typeset box bottom ({}) must be well above the raw bubble tail bottom ({})",
        tb.y + tb.h,
        bb.y + bb.h
    );

    // Typeset box center matches the carrier balloon centroid (X ~ 189, Y ~ 841)
    let tb_cx = tb.x + tb.w / 2;
    let tb_cy = tb.y + tb.h / 2;
    let raw_bubble_cx = bb.x + bb.w / 2;
    let raw_bubble_cy = bb.y + bb.h / 2;
    assert!(
        (tb_cx - raw_bubble_cx).abs() <= 5,
        "Typeset box center X ({}) should match carrier X center ({})",
        tb_cx,
        raw_bubble_cx
    );
    assert!(
        (tb_cy - raw_bubble_cy).abs() <= 5,
        "Typeset box center Y ({}) should match carrier Y center ({})",
        tb_cy,
        raw_bubble_cy
    );
}
