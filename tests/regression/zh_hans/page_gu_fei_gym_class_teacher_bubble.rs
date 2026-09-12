// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_gu_fei_gym_class_teacher_bubble` (RESOLUTION: 800 × 1568)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP OVAL BUBBLE**:
///   `"刚才那些人虽然性\n格各异，但都是网\n游界的风云人物。"` (DialogueBubble).
///   - MUST NOT hallucinate leading parenthesis on line 2 before '格' (e.g. `'（格各异'`).
/// - **PANEL 1 MIDDLE BUBBLE**:
///   `"跟他们在一\n起应该能学\n到些东西！"` (DialogueBubble).
/// - **PANEL 2 BOTTOM LEFT CIRCULAR BUBBLE**:
///   `"顾飞老师。"` (DialogueBubble).
///   - MUST NOT hallucinate enclosing parentheses `"(顾飞老师。)"`.
/// - **EXACT COUNTS**: EXACTLY 3 REGIONS TOTAL (3 DIALOGUE BUBBLES).
#[test]
fn test_regression_page_gu_fei_gym_class_teacher_bubble() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_gu_fei_gym_class_teacher_bubble/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_gu_fei_gym_class_teacher_bubble: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Gu Fei Gym Class Teacher Page detected {} regions:",
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 3 REGIONS TOTAL (3 DIALOGUE BUBBLES)
    assert_eq!(
        res.regions.len(),
        3,
        "Expected exactly 3 regions total, got {}",
        res.regions.len()
    );
    let bubble_count = res
        .regions
        .iter()
        .filter(|r| r.kind == RegionKind::DialogueBubble)
        .count();
    assert_eq!(
        bubble_count, 3,
        "Expected exactly 3 dialogue bubbles, got {}",
        bubble_count
    );

    // 2. TOP OVAL BUBBLE: '刚才那些人虽然性格各异，但都是网游界的风云人物。'
    let r_top = res.regions.iter().find(|r| r.text.contains("刚才那些人"));
    assert!(r_top.is_some(), "Must detect top bubble '刚才那些人...'");
    let r_top = r_top.unwrap();
    assert!(
        !r_top.text.contains('（') && !r_top.text.contains('('),
        "Must not hallucinate leading parenthesis before '格' in '{}'",
        r_top.text
    );
    assert!(
        r_top.text.contains("性格各异") || (r_top.text.contains("格各异") && !r_top.text.contains("（格")),
        "Line 2 must read '格各异' without leading parenthesis, got '{}'",
        r_top.text
    );
    crate::assert_region_bounds!(r_top, RegionKind::DialogueBubble, 298, 154, 326, 125, 25);

    // 3. MIDDLE BUBBLE: '跟他们在一起应该能学到些东西！'
    let r_mid = res.regions.iter().find(|r| r.text.contains("跟他们"));
    assert!(r_mid.is_some(), "Must detect middle bubble '跟他们...'");
    let r_mid = r_mid.unwrap();
    crate::assert_region_bounds!(r_mid, RegionKind::DialogueBubble, 300, 708, 187, 124, 25);

    // 4. BOTTOM LEFT CIRCULAR BUBBLE: '顾飞老师。' (MUST NOT CONTAIN HALLUCINATED PARENTHESES)
    let r_teacher = res.regions.iter().find(|r| r.text.contains("顾飞老师"));
    assert!(r_teacher.is_some(), "Must detect bottom left bubble '顾飞老师。'");
    let r_teacher = r_teacher.unwrap();
    assert!(
        !r_teacher.text.contains('(') && !r_teacher.text.contains(')'),
        "Must not hallucinate half-width parentheses in '{}'",
        r_teacher.text
    );
    assert!(
        !r_teacher.text.contains('（') && !r_teacher.text.contains('）'),
        "Must not hallucinate full-width parentheses in '{}'",
        r_teacher.text
    );
    crate::assert_region_bounds!(r_teacher, RegionKind::DialogueBubble, 21, 1431, 224, 64, 25);
}
