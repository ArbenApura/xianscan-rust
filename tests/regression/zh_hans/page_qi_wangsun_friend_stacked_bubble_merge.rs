// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_qi_wangsun_friend_stacked_bubble_merge` (RESOLUTION: 880 × 1244)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 2 UPPER BUBBLE**: `"少爷，我知道您对\n齐东胜感官不好。\n但齐王孙终究是你\n朋友。"` (DialogueBubble, strictly horizontal, separated from lower bubble)
/// - **PANEL 2 LOWER BUBBLE**: `"您若见死不救的\n话，齐王孙未必\n会原谅您的。"` (DialogueBubble, strictly horizontal, separated from upper bubble)
/// - **PANEL 3 LEFT BUBBLE**: `"……"` (DialogueBubble)
/// - **PANEL 3 RIGHT BUBBLE**: `"雪代沙的确冰雪聪\n明，我这人吃软不吃\n硬，齐东胜蔑视我，\n我自然不想出手。"` (DialogueBubble)
/// - **EXACT COUNTS**: Exactly 4 dialogue bubble regions (4 dialogue bubbles, 0 sound effects, 0 free text).
/// - **ZERO STRAY ARTIFACTS**: Stray characters `'7'`, `'1'`, and `'A'` must not pollute OCR or create phantom regions.
#[test]
fn test_regression_page_qi_wangsun_friend_stacked_bubble_merge() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_qi_wangsun_friend_stacked_bubble_merge.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_qi_wangsun_friend_stacked_bubble_merge: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Qi Wangsun Friend Stacked Bubble Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}, vertical={}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 1. EXACT ELEMENT COUNTS: 4 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 4, 4, 0);

    // 2. PANEL 2 UPPER BUBBLE (4 LINES, HORIZONTAL)
    let upper_bubble = res.regions.iter().find(|r| r.text.contains("感官不好") || r.text.contains("齐东胜"));
    assert!(upper_bubble.is_some(), "Must detect panel 2 upper bubble '少爷，我知道您对齐东胜感官不好...'");
    let upper_bubble = upper_bubble.unwrap();
    assert_eq!(upper_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!upper_bubble.vertical, "Panel 2 upper bubble must be horizontal (vertical=false)");
    assert!(!upper_bubble.text.contains("见死不救"), "Upper bubble must NOT merge with lower bubble");
    assert!(!upper_bubble.text.trim().starts_with('7'), "Must not start with stray noise character '7'");

    // 3. PANEL 2 LOWER BUBBLE (3 LINES, HORIZONTAL)
    let lower_bubble = res.regions.iter().find(|r| r.text.contains("见死不救") || r.text.contains("原谅"));
    assert!(lower_bubble.is_some(), "Must detect panel 2 lower bubble '您若见死不救的话...'");
    let lower_bubble = lower_bubble.unwrap();
    assert_eq!(lower_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!lower_bubble.vertical, "Panel 2 lower bubble must be horizontal (vertical=false)");
    assert!(!lower_bubble.text.contains("感官不好"), "Lower bubble must NOT merge with upper bubble");
    assert!(!lower_bubble.text.contains('\n') || !lower_bubble.text.lines().any(|l| l.trim() == "1"), "Must not contain stray noise line '1'");

    // 4. VERTICAL SEPARATION BETWEEN UPPER AND LOWER BUBBLE IN PANEL 2
    assert!(
        upper_bubble.box_.y + upper_bubble.box_.h <= lower_bubble.box_.y + 20,
        "Upper bubble bottom ({}) must sit above lower bubble top ({})",
        upper_bubble.box_.y + upper_bubble.box_.h,
        lower_bubble.box_.y
    );

    // 5. PANEL 3 RIGHT BUBBLE
    let right_bubble = res.regions.iter().find(|r| r.text.contains("雪代沙") || r.text.contains("吃软不吃硬"));
    assert!(right_bubble.is_some(), "Must detect panel 3 right bubble '雪代沙的确冰雪聪明...'");
    let right_bubble = right_bubble.unwrap();
    assert_eq!(right_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 6. ZERO STRAY ARTIFACT NOISE REGIONS
    assert!(!res.regions.iter().any(|r| r.text.trim() == "7" || r.text.trim() == "1" || r.text.trim() == "A"), "Must not emit stray single-character regions");
}
