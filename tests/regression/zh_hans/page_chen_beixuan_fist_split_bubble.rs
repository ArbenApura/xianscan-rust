// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_chen_beixuan_fist_split_bubble` (RESOLUTION: 827 × 1798)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 5 LEFT SPEECH BUBBLE**: `"陈北玄的拳头，竟\n然比钢铁还硬？"` MUST NOT SPLIT `"竟"` INTO A SEPARATE REGION.
/// - **PANEL 6 RIGHT SPEECH BUBBLE**: `"差点遭到异\n能反噬。"`
/// - **EXACT COUNTS**: Exactly 2 dialogue bubbles (2 Dialogue Bubbles, 0 Free Text).
#[test]
fn test_regression_page_chen_beixuan_fist_split_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_chen_beixuan_fist_split_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_chen_beixuan_fist_split_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Chen Beixuan Fist Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 2 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 2, 2, 0);

    // 2. PANEL 5 LEFT SPEECH BUBBLE: MUST UNIFY "竟" WITH "陈北玄的拳头"
    let fist_bubble = res.regions.iter().find(|r| r.text.contains("陈北玄"));
    assert!(fist_bubble.is_some(), "Must detect Chen Beixuan fist dialogue bubble");
    let fist_bubble = fist_bubble.unwrap();
    assert_eq!(fist_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(fist_bubble.text.contains("拳头"), "Must contain 拳头");
    assert!(fist_bubble.text.contains("竟"), "Must contain 竟 within the same unified bubble");
    assert!(fist_bubble.text.contains("钢铁还硬") || fist_bubble.text.contains("铁还硬"), "Must contain 钢铁还硬");
    crate::assert_region_bounds!(fist_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 349, 1257, 209, 80, 6);
    crate::assert_bubble_bounds!(fist_bubble, 339, 1209, 224, 176, 6);

    // 3. NEGATIVE CHECK: ZERO ISOLATED "竟" REGIONS
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "竟"),
        "Must NOT have isolated '竟' as a separate region"
    );

    // 4. PANEL 6 RIGHT SPEECH BUBBLE: "差点遭到异能反噬"
    let backlash_bubble = res.regions.iter().find(|r| r.text.contains("异能") || r.text.contains("反噬") || r.text.contains("差点遭到"));
    assert!(backlash_bubble.is_some(), "Must detect backlash dialogue bubble");
    let backlash_bubble = backlash_bubble.unwrap();
    assert_eq!(backlash_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(backlash_bubble.text.contains("异"), "Must contain 异");
    assert!(backlash_bubble.text.contains("反噬"), "Must contain 反噬");
    crate::assert_region_bounds!(backlash_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 690, 1504, 130, 78, 6);
    crate::assert_bubble_bounds!(backlash_bubble, 671, 1482, 156, 125, 6);
}
