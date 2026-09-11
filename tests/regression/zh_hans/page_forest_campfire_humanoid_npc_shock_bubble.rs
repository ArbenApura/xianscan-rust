// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_forest_campfire_humanoid_npc_shock_bubble` (RESOLUTION: 800 × 1801)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 2 SHOCK BUBBLE**:
///   `"人形NPC！"` (DialogueBubble, shock balloon with radiating speedlines).
///   - MUST capture both the Chinese prefix `"人形"` and the Latin acronym with punctuation `"NPC！"`.
///   - MUST NOT truncate to only `"人形"` or drop the Latin gaming term `"NPC"`.
///   - Text bounding box and inpaint envelope must span the full text width across the bubble (width ≥ 90px).
/// - **EXPLICIT NEGATIVE GUARDS**:
///   - MUST NOT TRUNCATE TEXT TO ONLY `"人形"`.
///   - MUST NOT DETECT THE '漫客栈' PUBLISHER WATERMARK AT THE LOWER RIGHT OF PANEL 2.
/// - **EXACT COUNTS**: EXACTLY 1 REGION TOTAL (1 DIALOGUE BUBBLE, 0 SFX, 0 FREE TEXT).
#[test]
fn test_regression_page_forest_campfire_humanoid_npc_shock_bubble() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_forest_campfire_humanoid_npc_shock_bubble/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_forest_campfire_humanoid_npc_shock_bubble: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Forest Campfire Humanoid NPC Page detected {} regions:",
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 1 DIALOGUE BUBBLE
    crate::assert_element_counts!(res, 1, 1, 0, 0);

    // 2. SHOCK DIALOGUE BUBBLE: '人形NPC！'
    let bubble = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("人形")
    });
    assert!(
        bubble.is_some(),
        "Must detect shock dialogue bubble '人形NPC！'"
    );
    let bubble = bubble.unwrap();

    // MUST CAPTURE BOTH CJK '人形' AND LATIN 'NPC'
    assert!(
        bubble.text.contains("人形") && bubble.text.to_uppercase().contains("NPC"),
        "Dialogue bubble must contain full text '人形NPC！' including Latin term, got '{}'",
        bubble.text
    );

    // TEXT BOX WIDTH MUST SPAN THE COMPLETE PHRASE RATHER THAN A 45PX SLIVER
    assert!(
        bubble.box_.w >= 90,
        "Text box width must encompass the full phrase (expected >= 90px), got {}px",
        bubble.box_.w
    );

    crate::assert_region_bounds!(bubble, RegionKind::DialogueBubble, 458, 960, 139, 54, 20);
    crate::assert_bubble_bounds!(bubble, 455, 916, 145, 143, 15);

    // 3. EXPLICIT NEGATIVE GUARDS
    assert_ne!(
        bubble.text.trim(),
        "人形",
        "Must NOT truncate text to only '人形', missing 'NPC！'"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客栈")),
        "Must NOT detect publisher watermark '漫客栈'"
    );
}
