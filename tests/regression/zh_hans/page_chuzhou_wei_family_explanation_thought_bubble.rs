// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_chuzhou_wei_family_explanation_thought_bubble` (RESOLUTION: 827 x 1785)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 2 THOUGHT BUBBLE**: `"现在，魏家该给我一个交代了。"` (DialogueBubble, right-side thought lobe severed, centered inside oval chamber)
/// - **PANEL 3 NARRATION BOX**: `"楚州，常青藤中学。"` (DialogueBubble, caption box)
/// - **PANEL 4 LEFT THOUGHT BUBBLE**: `"怎么这么多车？"` (DialogueBubble)
/// - **PANEL 4 RIGHT BUBBLE**: `"学长，您也是来参加十周年校庆的吗？"` (DialogueBubble)
/// - **EXACT COUNTS**: Exactly 4 dialogue bubble regions.
#[test]
fn test_regression_page_chuzhou_wei_family_explanation_thought_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_chuzhou_wei_family_explanation_thought_bubble.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_chuzhou_wei_family_explanation_thought_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Wei Family Explanation Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, carrier={:?}, typeset={:?}, text='{}'", i, r.kind, r.angle, r.box_, r.carrier_box, r.typeset_box, r.text);
    }

    // 1. EXACT ELEMENT COUNTS
    crate::assert_element_counts!(res, 4, 4, 0);

    // 2. CHEN FAN THOUGHT BUBBLE (REGION WITH WEI FAMILY EXPLANATION)
    let thought = res.regions.iter().find(|r| r.text.contains("魏家") || r.text.contains("交代"));
    assert!(thought.is_some(), "Must detect Chen Fan thought bubble '现在，魏家该给我一个交代了。'");
    let thought = thought.unwrap();
    assert_eq!(thought.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 3. CARRIER BOX MUST BE VALIDATED AND SEVER THE RIGHT THOUGHT LOBE
    assert!(thought.carrier_box.is_some(), "Carrier box must be published for thought bubble with severed lobe");
    let carrier = thought.carrier_box.as_ref().unwrap();
    assert!(carrier.w < thought.bubble_box.as_ref().unwrap().w, "Right thought lobe must be cut from carrier width");
    assert!(carrier.w <= 200, "Carrier width must be trimmed, got {}", carrier.w);

    // 4. TYPESET BOX MUST REMAIN CENTERED INSIDE THE OVAL CHAMBER (NOT DRAGGED RIGHT INTO THE LOBE)
    let tb = thought.typeset_box.as_ref().expect("typeset_box must exist");
    assert!(tb.x <= 118, "Typeset box X must be centered inside the oval, got {}", tb.x);
    assert!((tb.x + tb.w / 2 - (carrier.x + carrier.w / 2)).abs() <= 5, "Typeset box must align with carrier chamber center");
}
