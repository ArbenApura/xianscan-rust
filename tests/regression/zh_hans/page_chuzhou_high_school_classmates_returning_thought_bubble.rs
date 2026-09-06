// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_chuzhou_high_school_classmates_returning_thought_bubble` (RESOLUTION: 827 x 1616)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 LEFT THOUGHT BUBBLE**: `"今天是校庆？"` (DialogueBubble)
/// - **PANEL 1 RIGHT THOUGHT BUBBLE**: `"这么巧，这么说，许多故人同学都会回来了？"` (DialogueBubble, left-side thought lobe severed, centered inside oval chamber)
/// - **PANEL 2 SPEECH BUBBLE**: `"学长，快进来吧，我带您去校庆礼堂，您叫什么？"` (DialogueBubble)
/// - **PANEL 2 CHEN FAN BUBBLE**: `"好啊，谢谢你，我叫陈凡。"` (DialogueBubble)
/// - **PANEL 3 SCHOOLMATE BUBBLE**: `"你是谁啊？"` (DialogueBubble)
/// - **EXACT COUNTS**: Exactly 5 dialogue bubble regions.
#[test]
fn test_regression_page_chuzhou_high_school_classmates_returning_thought_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_chuzhou_high_school_classmates_returning_thought_bubble.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_chuzhou_high_school_classmates_returning_thought_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Classmates Returning Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, bubble={:?}, carrier={:?}, typeset={:?}, text='{}'", i, r.kind, r.angle, r.box_, r.bubble_box, r.carrier_box, r.typeset_box, r.text);
    }

    // 1. EXACT ELEMENT COUNTS
    crate::assert_element_counts!(res, 5, 5, 0);

    // 2. CHEN FAN THOUGHT BUBBLE (REGION WITH CLASSMATES RETURNING)
    let thought = res.regions.iter().find(|r| r.text.contains("这么巧") || r.text.contains("同学"));
    assert!(thought.is_some(), "Must detect Chen Fan thought bubble '这么巧，这么说，许多故人同学都会回来了？'");
    let thought = thought.unwrap();
    assert_eq!(thought.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 3. CARRIER BOX MUST BE VALIDATED AND SEVER THE LEFT THOUGHT LOBE
    assert!(thought.carrier_box.is_some(), "Carrier box must be published for thought bubble with severed lobe");
    let carrier = thought.carrier_box.as_ref().unwrap();
    assert!(carrier.x > thought.bubble_box.as_ref().unwrap().x, "Left thought lobe must be cut from carrier X");
    assert!(carrier.x >= 570, "Carrier X must be trimmed rightward away from the lobe, got {}", carrier.x);

    // 4. TYPESET BOX MUST REMAIN CENTERED INSIDE THE OVAL CHAMBER (NOT DRAGGED LEFT INTO THE LOBE)
    let tb = thought.typeset_box.as_ref().expect("typeset_box must exist");
    assert!(tb.x >= 605, "Typeset box X must be centered inside the oval without left collision, got {}", tb.x);
    assert!((tb.x + tb.w / 2 - (carrier.x + carrier.w / 2)).abs() <= 5, "Typeset box must align with carrier chamber center");
}
