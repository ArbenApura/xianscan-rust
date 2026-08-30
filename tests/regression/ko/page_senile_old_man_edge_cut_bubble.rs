// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_senile_old_man_edge_cut_bubble` (RESOLUTION: 640 × 1301)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP SPEECH BUBBLE**:
///   `"뒈져!"`
///   Clean top dialogue bubble in the upper quadrant.
/// - **BOTTOM EDGE-CUT SPEECH BUBBLE**:
///   `"노망난\n노인네!!"`
///   Located right at the bottom edge of the image (`b.y + b.h >= 1295`).
///   Because the bubble is cut by the canvas bottom edge, directional tail detection
///   and carrier recentering must be safely bypassed so the typeset box strictly preserves its text centroid anchor.
/// - **EXACT COUNTS**: Exactly 2 dialogue bubbles (2 bubbles, 0 SFX, 0 free text).
#[test]
fn test_regression_page_senile_old_man_edge_cut_bubble() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_senile_old_man_edge_cut_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_senile_old_man_edge_cut_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Senile Old Man Page detected {} regions:", res.regions.len());
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

    // 2. TOP SPEECH BUBBLE: "뒈져!"
    let top_reg = &res.regions[0];
    assert_eq!(
        top_reg.kind,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        "Top region must be classified as DialogueBubble"
    );
    assert!(
        top_reg.text.contains("뒈") || top_reg.text.contains("둬") || top_reg.text.contains("져"),
        "Must contain top dialogue text '뒈져!' (or OCR font variant '둬져!'), got: '{}'",
        top_reg.text
    );

    // 3. BOTTOM EDGE-CUT SPEECH BUBBLE: "노망난\n노인네!!"
    let bot_reg = &res.regions[1];
    assert_eq!(
        bot_reg.kind,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        "Bottom region must be classified as DialogueBubble"
    );
    assert!(
        bot_reg.text.contains("노망") && bot_reg.text.contains("노인"),
        "Must contain bottom dialogue text, got: '{}'",
        bot_reg.text
    );

    // Assert outer bubble touches bottom edge (page_h = 1301)
    let bb = bot_reg.bubble_box.as_ref().expect("bubble_box must exist");
    assert!(
        bb.y + bb.h >= 1290,
        "Outer bubble must extend to the bottom edge of the page (>= 1290), got {}",
        bb.y + bb.h
    );

    // Assert typeset box remains vertically anchored to text centroid (not drifted/shrunk by tail trimming)
    if let Some(tb) = &bot_reg.typeset_box {
        let text_cy = bot_reg.box_.y + bot_reg.box_.h / 2;
        let tb_cy = tb.y + tb.h / 2;
        assert!(
            (tb_cy - text_cy).abs() <= 10,
            "Typeset box center Y ({}) must stay close to text centroid Y ({}), not pulled into edge",
            tb_cy,
            text_cy
        );
    }
}
