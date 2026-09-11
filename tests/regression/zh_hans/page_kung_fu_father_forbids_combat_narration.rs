// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_kung_fu_father_forbids_combat_narration` (RESOLUTION: 800 × 1637)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP NARRATION (PANEL 1)**:
///   `"事实很无奈，\n功夫很难当饭\n吃。"` (FreeText, sits on dark speedline background, must NOT hallucinate bubble container or OCR as '争头心儿示').
/// - **MID-RIGHT NARRATION (PANEL 2)**:
///   `"顾飞练的功夫注\n重格斗技巧……"` (FreeText).
/// - **LOWER-LEFT MARGIN NARRATION (PANEL 3)**:
///   `"但是老爹\n却严禁他\n参加格斗\n类比赛。"` (FreeText, sits near left edge x ≈ 0-6px, must NOT drop top line '但是老爹').
/// - **CENTER DIALOGUE BUBBLE (PANEL 3)**:
///   `"我们习\n武，"` (DialogueBubble).
/// - **RIGHT DIALOGUE BUBBLE (PANEL 3)**:
///   `"是为了锻炼\n自身，突破\n人体极限，\n不是为了好\n勇斗狠。"` (DialogueBubble).
/// - **BOTTOM BANNER (FOOTER)**:
///   `"如果你觉得这老头眼熟，没错——他就是校门\n口痛扁顾飞的那位！"` (FreeText).
/// - **EXPLICIT NEGATIVE GUARDS**:
///   - MUST NOT MISREAD '事实很无奈' AS '争头心儿示'.
///   - MUST NOT DROP '但是老爹' FROM MARGIN NARRATION.
///   - MUST NOT DETECT '漫客栈' WATERMARK.
/// - **EXACT COUNTS**: EXACTLY 6 REGIONS TOTAL (2 DIALOGUE BUBBLE, 0 SFX, 4 FREE TEXT).
#[test]
fn test_regression_page_kung_fu_father_forbids_combat_narration() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_kung_fu_father_forbids_combat_narration/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_kung_fu_father_forbids_combat_narration: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Kung Fu Father Forbids Combat Page detected {} regions:",
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 6 REGIONS (2 DIALOGUE BUBBLES, 0 SFX, 4 FREE TEXT)
    crate::assert_element_counts!(res, 6, 2, 0, 4);

    // 2. TOP NARRATION: '事实很无奈，\n功夫很难当饭\n吃。' (FreeText)
    let top_narration = res.regions.iter().find(|r| {
        r.text.contains("功夫很难当饭") || r.text.contains("事实很无奈")
    });
    assert!(
        top_narration.is_some(),
        "Must detect top panel narration '事实很无奈，功夫很难当饭吃。'"
    );
    let top_narration = top_narration.unwrap();
    assert_eq!(
        top_narration.kind,
        RegionKind::FreeText,
        "Top narration must be FreeText on background, not DialogueBubble"
    );
    assert!(
        top_narration.text.contains("事实很无奈") && top_narration.text.contains("功夫很难当饭"),
        "Top narration must contain '事实很无奈' and '功夫很难当饭', got '{}'",
        top_narration.text
    );
    crate::assert_region_bounds!(top_narration, RegionKind::FreeText, 186, 65, 214, 210, 20);

    // 3. MID-RIGHT NARRATION: '顾飞练的功夫注\n重格斗技巧……'
    let mid_narration = res.regions.iter().find(|r| r.text.contains("顾飞练的功夫"));
    assert!(
        mid_narration.is_some(),
        "Must detect mid-right panel narration '顾飞练的功夫注重格斗技巧……'"
    );
    let mid_narration = mid_narration.unwrap();
    assert_eq!(mid_narration.kind, RegionKind::FreeText);
    assert!(
        mid_narration.text.contains("格斗技巧"),
        "Mid-right narration must contain '格斗技巧', got '{}'",
        mid_narration.text
    );
    crate::assert_region_bounds!(mid_narration, RegionKind::FreeText, 449, 346, 261, 86, 12);

    // 4. LOWER-LEFT MARGIN NARRATION: '但是老爹\n却严禁他\n参加格斗\n类比赛。'
    let left_narration = res.regions.iter().find(|r| {
        r.text.contains("严禁他") || r.text.contains("参加格斗") || r.text.contains("但是老爹")
    });
    assert!(
        left_narration.is_some(),
        "Must detect lower-left margin narration '但是老爹却严禁他参加格斗类比赛。'"
    );
    let left_narration = left_narration.unwrap();
    assert_eq!(left_narration.kind, RegionKind::FreeText);
    assert!(
        left_narration.text.contains("但是老爹"),
        "Lower-left narration must NOT drop top line '但是老爹', got '{}'",
        left_narration.text
    );
    assert!(
        left_narration.text.contains("严禁他") && left_narration.text.contains("比赛"),
        "Lower-left narration must contain full sentences, got '{}'",
        left_narration.text
    );
    crate::assert_region_bounds!(left_narration, RegionKind::FreeText, 6, 1100, 155, 215, 25);

    // 5. CENTER DIALOGUE BUBBLE: '我们习\n武，'
    let bubble_xiwu = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("我们习")
    });
    assert!(
        bubble_xiwu.is_some(),
        "Must detect center dialogue bubble '我们习武，'"
    );
    let bubble_xiwu = bubble_xiwu.unwrap();
    crate::assert_region_bounds!(bubble_xiwu, RegionKind::DialogueBubble, 179, 1052, 120, 104, 10);
    crate::assert_bubble_bounds!(bubble_xiwu, 160, 1032, 159, 145, 12);

    // 6. RIGHT DIALOGUE BUBBLE: '是为了锻炼\n自身，突破\n人体极限，\n不是为了好\n勇斗狠。'
    let bubble_duanlian = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("锻炼自身")
    });
    assert!(
        bubble_duanlian.is_some(),
        "Must detect right dialogue bubble '是为了锻炼自身...'"
    );
    let bubble_duanlian = bubble_duanlian.unwrap();
    assert!(
        bubble_duanlian.text.contains("人体极限") && bubble_duanlian.text.contains("好勇斗狠"),
        "Right dialogue bubble must contain full speech, got '{}'",
        bubble_duanlian.text
    );
    crate::assert_region_bounds!(bubble_duanlian, RegionKind::DialogueBubble, 584, 1088, 203, 226, 12);
    crate::assert_bubble_bounds!(bubble_duanlian, 571, 1037, 228, 329, 15);

    // 7. BOTTOM BANNER: '如果你觉得这老头眼熟，没错——他就是校门\n口痛扁顾飞的那位！'
    let banner = res.regions.iter().find(|r| r.text.contains("这老头眼熟"));
    assert!(
        banner.is_some(),
        "Must detect bottom banner '如果你觉得这老头眼熟，没错——他就是校门口痛扁顾飞的那位！'"
    );
    let banner = banner.unwrap();
    assert_eq!(banner.kind, RegionKind::FreeText);
    assert!(
        banner.text.contains("痛扁顾飞"),
        "Banner must contain '痛扁顾飞', got '{}'",
        banner.text
    );
    crate::assert_region_bounds!(banner, RegionKind::FreeText, 59, 1479, 681, 79, 12);

    // 8. EXPLICIT NEGATIVE GUARDS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("争头心儿示")),
        "Must NOT hallucinate garbled OCR text '争头心儿示'"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客栈")),
        "Must NOT detect publisher watermark '漫客栈'"
    );
}
