// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_town_chou_yatou_split_rangkai_freetext` (RESOLUTION: 800 × 1512)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP-LEFT DIALOGUE BUBBLE**:
///   `"臭丫头，可算是找到\n你了！"` (DialogueBubble).
///   - MUST NOT be fractured or column-split into two separate regions (`"可算是找到"` and `"臭丫头，\n你了！"`).
///   - MUST unify both horizontal lines into one single coherent dialogue bubble.
/// - **PANEL 1 BACKGROUND CROWD SHOUT**:
///   `"让开让开！"` (FreeText, shouted by pursuers in the street crowd).
///   - MUST NOT be pruned as artwork noise.
/// - **PANEL 1 QUESTION MARK BUBBLE**:
///   `"?"` (DialogueBubble, above protagonist's head).
/// - **PANEL 2 DIALOGUE BUBBLE**:
///   `"这些人那么凶\n找你干嘛？"` (DialogueBubble).
/// - **EXPLICIT NEGATIVE GUARDS**:
///   - MUST NOT SPLIT '臭丫头，可算是找到你了！' INTO TWO CONFLICTING REGIONS.
///   - MUST NOT DROP CROWD SHOUT '让开让开！'.
///   - MUST NOT DETECT '漫客栈' PUBLISHER WATERMARK.
/// - **EXACT COUNTS**: EXACTLY 4 REGIONS TOTAL (3 DIALOGUE BUBBLES, 0 SFX, 1 FREE TEXT).
#[test]
fn test_regression_page_town_chou_yatou_split_rangkai_freetext() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_town_chou_yatou_split_rangkai_freetext/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_town_chou_yatou_split_rangkai_freetext: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Town Chou Yatou Page detected {} regions:",
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 4 REGIONS (3 DIALOGUE BUBBLES, 0 SFX, 1 FREE TEXT)
    crate::assert_element_counts!(res, 4, 3, 0, 1);

    // 2. PANEL 1 TOP-LEFT UNIFIED DIALOGUE BUBBLE: '臭丫头，可算是找到你了！'
    let bubble_chou = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && (r.text.contains("臭丫头") || r.text.contains("可算是找到"))
    });
    assert!(
        bubble_chou.is_some(),
        "Must detect unified top-left dialogue bubble '臭丫头，可算是找到你了！'"
    );
    let bubble_chou = bubble_chou.unwrap();
    assert!(
        bubble_chou.text.contains("臭丫头") && bubble_chou.text.contains("可算是找到") && bubble_chou.text.contains("你了"),
        "Top-left bubble must contain full speech unified into one region, got '{}'",
        bubble_chou.text
    );
    crate::assert_region_bounds!(bubble_chou, RegionKind::DialogueBubble, 41, 122, 331, 88, 20);
    crate::assert_bubble_bounds!(bubble_chou, 24, 111, 368, 163, 20);

    // 3. PANEL 1 BACKGROUND CROWD SHOUT: '让开让开！' (FreeText)
    let shout_rangkai = res.regions.iter().find(|r| r.text.contains("让开"));
    assert!(
        shout_rangkai.is_some(),
        "Must detect background crowd shout '让开让开！'"
    );
    let shout_rangkai = shout_rangkai.unwrap();
    assert_eq!(shout_rangkai.kind, RegionKind::FreeText);
    assert!(
        shout_rangkai.text.contains("让开让开"),
        "Crowd shout must contain '让开让开', got '{}'",
        shout_rangkai.text
    );
    crate::assert_region_bounds!(shout_rangkai, RegionKind::FreeText, 302, 265, 129, 35, 20);

    // 4. PANEL 1 QUESTION MARK BUBBLE: '?'
    let bubble_q = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.trim() == "?"
    });
    assert!(bubble_q.is_some(), "Must detect question mark bubble '?'");
    let bubble_q = bubble_q.unwrap();
    crate::assert_region_bounds!(bubble_q, RegionKind::DialogueBubble, 741, 206, 32, 31, 15);
    crate::assert_bubble_bounds!(bubble_q, 720, 204, 72, 44, 15);

    // 5. PANEL 2 DIALOGUE BUBBLE: '这些人那么凶找你干嘛？'
    let bubble_凶 = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("那么凶")
    });
    assert!(bubble_凶.is_some(), "Must detect panel 2 dialogue bubble '这些人那么凶找你干嘛？'");
    let bubble_凶 = bubble_凶.unwrap();
    assert!(
        bubble_凶.text.contains("那么凶") && bubble_凶.text.contains("干嘛"),
        "Panel 2 bubble must contain full sentence, got '{}'",
        bubble_凶.text
    );
    crate::assert_region_bounds!(bubble_凶, RegionKind::DialogueBubble, 115, 935, 248, 110, 15);
    crate::assert_bubble_bounds!(bubble_凶, 69, 890, 341, 201, 15);

    // 6. EXPLICIT NEGATIVE GUARDS
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "可算是找到"),
        "Must NOT split '可算是找到' off as an independent fragment"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客栈")),
        "Must NOT detect publisher watermark '漫客栈'"
    );
}
