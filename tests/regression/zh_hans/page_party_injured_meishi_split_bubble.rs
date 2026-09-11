// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_party_injured_meishi_split_bubble` (RESOLUTION: 800 × 1246)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP DIALOGUE BUBBLE (PANEL 1)**:
///   `"他没事吧？"` (DialogueBubble).
/// - **MID DIALOGUE BUBBLE (PANEL 2)**:
///   `"你怎么样？"` (DialogueBubble).
/// - **BOTTOM UNIFIED DIALOGUE BUBBLE (PANEL 2)**:
///   `"没事，我\n没事！"` (DialogueBubble, must NOT be split into two conflicting regions or hallucinate '沿事 / 一').
/// - **EXPLICIT NEGATIVE GUARDS**:
///   - MUST NOT SPLIT BOTTOM BUBBLE INTO MULTIPLE REGIONS.
///   - MUST NOT ISOLATE '我' AS AN INDEPENDENT REGION.
///   - MUST NOT HALLUCINATE CROP ARTIFACTS '沿事' OR '一'.
///   - MUST NOT DETECT '漫客栈' WATERMARK.
/// - **EXACT COUNTS**: EXACTLY 3 REGIONS TOTAL (3 DIALOGUE BUBBLE, 0 SFX, 0 FREE TEXT).
#[test]
fn test_regression_page_party_injured_meishi_split_bubble() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_party_injured_meishi_split_bubble/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_party_injured_meishi_split_bubble: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Party Injured Meishi Split Bubble Page detected {} regions:",
        res.regions.len()
    );
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}°, box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 3 REGIONS (3 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT)
    crate::assert_element_counts!(res, 3, 3, 0, 0);

    // 2. TOP DIALOGUE BUBBLE: '他没事吧？'
    let bubble_ta = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("他没事吧")
    });
    assert!(
        bubble_ta.is_some(),
        "Must detect top panel dialogue bubble '他没事吧？'"
    );
    let bubble_ta = bubble_ta.unwrap();
    crate::assert_region_bounds!(bubble_ta, RegionKind::DialogueBubble, 269, 338, 157, 54, 12);
    crate::assert_bubble_bounds!(bubble_ta, 260, 316, 175, 98, 15);

    // 3. MID DIALOGUE BUBBLE: '你怎么样？'
    let bubble_zenme = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("你怎么样")
    });
    assert!(
        bubble_zenme.is_some(),
        "Must detect mid panel dialogue bubble '你怎么样？'"
    );
    let bubble_zenme = bubble_zenme.unwrap();
    crate::assert_region_bounds!(bubble_zenme, RegionKind::DialogueBubble, 183, 732, 172, 52, 12);
    crate::assert_bubble_bounds!(bubble_zenme, 168, 711, 202, 95, 15);

    // 4. BOTTOM UNIFIED DIALOGUE BUBBLE: '没事，我\n没事！' (Must be single unified bubble)
    let bottom_bubble = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("没事，我")
    });
    assert!(
        bottom_bubble.is_some(),
        "Must detect unified bottom dialogue bubble '没事，我没事！'"
    );
    let bottom_bubble = bottom_bubble.unwrap();
    assert!(
        bottom_bubble.text.contains("我") && bottom_bubble.text.contains("没事"),
        "Bottom bubble must unify both lines '没事，我' and '没事！', got '{}'",
        bottom_bubble.text
    );
    crate::assert_region_bounds!(bottom_bubble, RegionKind::DialogueBubble, 275, 1050, 160, 120, 20);
    crate::assert_bubble_bounds!(bottom_bubble, 265, 1053, 180, 116, 15);

    // 5. EXPLICIT NEGATIVE GUARDS
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "我"),
        "Must NOT split '我' into an isolated micro-box region"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.contains("沿事")),
        "Must NOT hallucinate crop artifact '沿事'"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客栈")),
        "Must NOT detect publisher watermark '漫客栈'"
    );
}
