// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_rice_shop_kind_couple_thought_bubbles` (RESOLUTION: 640 × 1585)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 HUSBAND BUBBLE**: `"孩他娘，那边有\n些陈米，放着也是放着，\n就拿给小兄弟吧"` (DialogueBubble)
/// - **PANEL 2 WIFE BUBBLE**: `"全听当家的"` (DialogueBubble)
/// - **PANEL 2 YOUNG MAN BUBBLE**: `"这怎么行，你们\n也是小本经营"` (DialogueBubble)
/// - **PANEL 3 WIFE UPPER BUBBLE**: `"有什么使不得的，\n反正那些陈米也生了虫，\n是卖不出去的"` (DialogueBubble)
/// - **PANEL 3 WIFE LOWER BUBBLE**: `"不过当家的说，\n这些米虫啊，比白米\n还有营养呢"` (DialogueBubble)
/// - **PANEL 4 WIFE BUBBLE**: `"你等着，\n我给你拿去"` (DialogueBubble)
/// - **PANEL 4 PROTAGONIST UPPER THOUGHT LOBE**:
///   `"这段时间每次来米\n行买米，好心的老板和\n老板娘都会多送自己一些，"` (DialogueBubble, strictly separated from lower thought lobe)
/// - **PANEL 4 PROTAGONIST LOWER THOUGHT LOBE**:
///   `"而且他们也会找一\n些借口，诸如什么米生\n了虫之类的，其实那都是\n些上好的白米..."` (DialogueBubble)
/// - **EXACT COUNTS**: Exactly 8 dialogue/thought bubble regions (8 dialogue bubbles, 0 sound effects, 0 free text).
#[test]
fn test_regression_page_rice_shop_kind_couple_thought_bubbles() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_rice_shop_kind_couple_thought_bubbles.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_rice_shop_kind_couple_thought_bubbles: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Rice Shop Kind Couple Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 8 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 8, 8, 0);

    // 2. PANEL 4 UPPER THOUGHT LOBE (3 LINES)
    let upper_thought = res.regions.iter().find(|r| r.text.contains("每次来米") || r.text.contains("这段时间"));
    assert!(upper_thought.is_some(), "Must detect panel 4 upper thought lobe '这段时间每次来米...'");
    let upper_thought = upper_thought.unwrap();
    assert_eq!(upper_thought.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!upper_thought.text.contains("而且他们也会找"), "Upper thought lobe must NOT merge with lower thought lobe");
    assert!(upper_thought.text.contains("多送自己一些"), "Upper thought lobe must contain '多送自己一些'");
    crate::assert_region_bounds!(upper_thought, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 294, 1183, 249, 77, 8);
    crate::assert_bubble_bounds!(upper_thought, 262, 1153, 372, 244, 8);

    // 3. PANEL 4 LOWER THOUGHT LOBE (4 LINES)
    let lower_thought = res.regions.iter().find(|r| r.text.contains("而且他们也会找") || r.text.contains("借口"));
    assert!(lower_thought.is_some(), "Must detect panel 4 lower thought lobe '而且他们也会找一些借口...'");
    let lower_thought = lower_thought.unwrap();
    assert_eq!(lower_thought.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!lower_thought.text.contains("每次来米"), "Lower thought lobe must NOT contain upper thought start text");
    assert!(lower_thought.text.contains("上好的白米"), "Lower thought lobe must contain '上好的白米'");
    crate::assert_region_bounds!(lower_thought, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 381, 1270, 235, 102, 8);
    crate::assert_bubble_bounds!(lower_thought, 262, 1153, 372, 244, 8);

    // 4. BOUNDING BOX NON-OVERLAP INVARIANT BETWEEN THE TWO THOUGHT LOBES
    assert!(
        upper_thought.box_.y + upper_thought.box_.h <= lower_thought.box_.y + 10,
        "Upper thought typeset box (bottom={}) must NOT vertically overlap lower thought typeset box (top={})",
        upper_thought.box_.y + upper_thought.box_.h,
        lower_thought.box_.y
    );
}
