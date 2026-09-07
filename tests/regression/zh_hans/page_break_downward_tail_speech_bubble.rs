// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_break_downward_tail_speech_bubble` (RESOLUTION: 900 × 1823)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 3 CHEN FAN EXCLAMATION BUBBLE WITH DOWNWARD TAIL**: `[147, 824, 111, 111]` (`"破！"`).
///   The bubble is an oval speech balloon with a downward pointer tail extending to y = 935.
///   The downward tail must be severed by the carrier box (h ≈ 75..85px) so that the typeset box
///   centers inside the upper oval chamber cavity (cy ≈ 855..865) rather than being dragged down into the tail (cy = 879).
/// - **EXACT COUNTS**: EXACTLY 2 REGIONS (2 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT).
#[test]
fn test_regression_page_break_downward_tail_speech_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_break_downward_tail_speech_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_break_downward_tail_speech_bubble, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Break Downward Tail Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, carrier={:?}, typeset={:?}, text='{}', conf={:.2}",
            i, r.kind, r.angle, r.box_, r.carrier_box, r.typeset_box, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 2 REGIONS (2 DIALOGUE BUBBLES, 0 SFX)
    crate::assert_element_counts!(res, 2, 2, 0);

    // 2. PANEL 3 LEFT BUBBLE WITH DOWNWARD TAIL: "破！"
    let break_bubble = res.regions.iter().find(|r| r.text.contains('破'));
    assert!(break_bubble.is_some(), "Must detect panel 3 break bubble '破！'");
    let break_bubble = break_bubble.unwrap();
    assert_eq!(break_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    let bb = break_bubble.bubble_box.as_ref().expect("bubble box must exist");
    assert_eq!(bb.x, 147);
    assert_eq!(bb.y, 824);
    assert_eq!(bb.w, 111);
    assert_eq!(bb.h, 111);

    // Carrier box must be validated and sever the downward tail without over-cutting into the oval contour
    let cb = break_bubble.carrier_box.as_ref().expect("Carrier box must be published for downward tail");
    assert_eq!(cb.x, 147);
    assert_eq!(cb.y, 824);
    assert_eq!(cb.h, 79, "Carrier height must preserve bottom oval curvature (h=79) without over-cutting to 68");

    let tb = break_bubble.typeset_box.as_ref().expect("typeset box must exist");
    assert_eq!(tb.y, 840, "Typeset box Y must be vertically centered in the h=79 chamber");
    assert_eq!(tb.h, 46);
    let tb_cy = tb.y + tb.h / 2;
    let cb_cy = cb.y + cb.h / 2;
    assert!((tb_cy - cb_cy).abs() <= 1, "Typeset box must align with carrier chamber center: tb_cy={}, cb_cy={}", tb_cy, cb_cy);
    assert_eq!(tb_cy, 863, "Typeset center must reside in upper chamber cavity, got tb_cy={}", tb_cy);

    // 3. PANEL 3 RIGHT BUBBLE: "唔!"
    let ugh = res.regions.iter().find(|r| r.text.contains('唔'));
    assert!(ugh.is_some(), "Must detect panel 3 ugh bubble '唔!'");
    let ugh = ugh.unwrap();
    assert_eq!(ugh.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
}
