// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_master_hu_shunshi_mid_sentence_split` (RESOLUTION: 880 × 1254)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 BUBBLE**: `"虎爷，我卖您这个\n面子。你的要求，\n我全答应。"` (DialogueBubble)
/// - **PANEL 2 THOUGHT BUBBLE**: `"啧，我还想他硬拼\n下去，让杨擒虎顺\n势杀了他呢。"` (DialogueBubble, strictly unified across continuous idiom "顺势")
/// - **PANEL 3 BUBBLE**: `"虎爷？"` (DialogueBubble)
/// - **EXACT COUNTS**: Exactly 3 dialogue bubble regions (3 dialogue bubbles, 0 sound effects, 0 free text).
/// - **NO MID-SENTENCE SPLIT**: `"顺势"` must never be split into two separate dialogue boxes inside the same bubble container.
#[test]
fn test_regression_page_master_hu_shunshi_mid_sentence_split() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_master_hu_shunshi_mid_sentence_split.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_master_hu_shunshi_mid_sentence_split: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Master Hu Shunshi Mid-Sentence Split Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 3 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 3, 3, 0);

    // 2. PANEL 1 BUBBLE
    let p1_bubble = res.regions.iter().find(|r| r.text.contains("虎爷，我卖您") || r.text.contains("我全答应"));
    assert!(p1_bubble.is_some(), "Must detect panel 1 dialogue bubble '虎爷，我卖您这个面子...'");
    let p1_bubble = p1_bubble.unwrap();
    assert_eq!(p1_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(p1_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 66, 71, 220, 134, 10);

    // 3. PANEL 2 THOUGHT BUBBLE (MUST UNIFY "顺势" INTO ONE CONTINUOUS DIALOGUE)
    let p2_thought = res.regions.iter().find(|r| r.text.contains("硬拼") || r.text.contains("顺势"));
    assert!(p2_thought.is_some(), "Must detect panel 2 unified thought bubble '啧，我还想他硬拼下去，让杨擒虎顺势杀了他呢。'");
    let p2_thought = p2_thought.unwrap();
    assert_eq!(p2_thought.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(p2_thought.text.contains("顺势") || (p2_thought.text.contains("顺") && p2_thought.text.contains("势")), "Must contain full idiom '顺势' in same region");
    assert!(!res.regions.iter().any(|r| r.text.trim() == "势杀了他呢。" || r.text.trim() == "势杀了他呢"), "Must NOT emit split fragment for second half of sentence");
    crate::assert_bubble_bounds!(p2_thought, 575, 492, 282, 228, 10);

    // 4. PANEL 3 BUBBLE
    let p3_bubble = res.regions.iter().find(|r| r.text.trim() == "虎爷？" || (r.text.contains("虎爷") && !r.text.contains("卖您")));
    assert!(p3_bubble.is_some(), "Must detect panel 3 question bubble '虎爷？'");
    let p3_bubble = p3_bubble.unwrap();
    assert_eq!(p3_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(p3_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 512, 775, 96, 46, 10);
}
