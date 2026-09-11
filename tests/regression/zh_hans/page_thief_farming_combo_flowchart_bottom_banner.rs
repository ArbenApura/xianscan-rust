// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_thief_farming_combo_flowchart_bottom_banner` (RESOLUTION: 800 × 1244)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 OBSERVATION BUBBLE / TEXT**:
///   `"他也在这里刷怪\n而且用的方法跟我\n的还挺像。"` (FreeText / DialogueBubble).
/// - **PANEL 2 BOTTOM COMBO FLOWCHART EXPLANATION BANNER**:
///   `"隐身，靠近，背刺，强行攻击，撤离，休息。循环使用！"` (FreeText, full-width explanatory caption along the bottom boundary).
///   - MUST NOT be dropped by wide box or margin border cut filters.
///   - MUST capture all sequence steps (`隐身`, `背刺`, `强行攻击`, `循环使用`).
/// - **EXPLICIT NEGATIVE GUARDS**:
///   - MUST NOT DROP THE BOTTOM EXPLANATION BANNER.
///   - MUST NOT DETECT '漫客栈' PUBLISHER WATERMARK.
/// - **EXACT COUNTS**: EXACTLY 2 REGIONS TOTAL.
#[test]
fn test_regression_page_thief_farming_combo_flowchart_bottom_banner() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_thief_farming_combo_flowchart_bottom_banner/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_thief_farming_combo_flowchart_bottom_banner: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Thief Farming Combo Flowchart Page detected {} regions:",
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 2 REGIONS TOTAL
    assert_eq!(
        res.regions.len(),
        2,
        "Expected exactly 2 regions total (top bubble + bottom caption), got {}",
        res.regions.len()
    );

    // 2. PANEL 1 OBSERVATION TEXT: '他也在这里刷怪，而且用的方法跟我的还挺像。'
    let top_text = res.regions.iter().find(|r| r.text.contains("刷怪"));
    assert!(
        top_text.is_some(),
        "Must detect panel 1 observation text '他也在这里刷怪...'"
    );
    let top_text = top_text.unwrap();
    assert!(
        top_text.text.contains("刷怪") && top_text.text.contains("还挺像"),
        "Top observation text must contain full sentence, got '{}'",
        top_text.text
    );
    crate::assert_region_bounds!(top_text, top_text.kind, 178, 82, 278, 112, 20);

    // 3. PANEL 2 BOTTOM FLOWCHART EXPLANATION BANNER: '隐身，靠近，背刺，强行攻击，撤离，休息。循环使用！'
    let bottom_banner = res.regions.iter().find(|r| {
        r.text.contains("隐身") || r.text.contains("背刺") || r.text.contains("循环使用")
    });
    assert!(
        bottom_banner.is_some(),
        "Must detect panel 2 bottom explanation banner '隐身，靠近，背刺，强行攻击，撤离，休息。循环使用！'"
    );
    let bottom_banner = bottom_banner.unwrap();
    assert_eq!(bottom_banner.kind, RegionKind::FreeText);
    assert!(
        bottom_banner.text.contains("隐身") && bottom_banner.text.contains("背刺") && bottom_banner.text.contains("循环使用"),
        "Bottom banner must contain the full combo steps, got '{}'",
        bottom_banner.text
    );
    crate::assert_region_bounds!(bottom_banner, RegionKind::FreeText, 5, 1170, 785, 45, 25);

    // 4. EXPLICIT NEGATIVE GUARDS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客栈")),
        "Must NOT detect publisher watermark '漫客栈'"
    );
}
