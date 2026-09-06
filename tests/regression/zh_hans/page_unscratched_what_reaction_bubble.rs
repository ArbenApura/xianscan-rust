// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_unscratched_what_reaction_bubble` (RESOLUTION: 900 × 1277)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - Verifies speech bubble and dialogue detection for unscratched reaction balloon.
/// - Unifies 2-line reaction balloon ("什么？\n毫发无损？") into a single dialogue bubble.
#[test]
fn test_regression_page_unscratched_what_reaction_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_unscratched_what_reaction_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_unscratched_what_reaction_bubble, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Unscratched Reaction Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, box={:?}, bubble_box={:?}, text='{}', conf={:.2}", i, r.kind, r.box_, r.bubble_box, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. MUST UNIFY REACTION BUBBLE INTO A SINGLE REGION
    let reaction_bubble = res.regions.iter().find(|r| r.text.contains("什么") && r.text.contains("毫发无损"));
    assert!(reaction_bubble.is_some(), "Must unify reaction balloon into a single region '什么？\\n毫发无损？'");
    let reaction_bubble = reaction_bubble.unwrap();
    assert_eq!(reaction_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 2. MUST DETECT '该我了！'
    assert!(res.regions.iter().any(|r| r.text.contains("该我了")), "Must detect '该我了！'");

    // 3. EXACT COUNTS: 2 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 2, 2, 0);
}
