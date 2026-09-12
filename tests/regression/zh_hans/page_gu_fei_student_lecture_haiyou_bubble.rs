// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_gu_fei_student_lecture_haiyou_bubble` (RESOLUTION: 800 × 1257)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP SPEECH BUBBLE**:
///   `"作为学生，应该好\n好学习，不要整天\n想着游戏！"` (DialogueBubble).
/// - **PANEL 1 MIDDLE SMALL CIRCULAR BUBBLE**:
///   `"还有!"` (or `"还有！"`, DialogueBubble).
///   - MUST NOT hallucinate parentheses `"(还有!)"` from circular speech balloon border.
/// - **PANEL 1 LOWER RIGHT BUBBLE**:
///   `"知道了，只许\n州官放火，不\n许百姓点灯。"` (DialogueBubble).
/// - **PANEL 2 BOTTOM JAGGED BANNER BUBBLE**:
///   `"真的没有人要跟我学功夫吗？！"` (DialogueBubble).
/// - **EXACT COUNTS**: EXACTLY 4 REGIONS TOTAL (4 DIALOGUE BUBBLES).
#[test]
fn test_regression_page_gu_fei_student_lecture_haiyou_bubble() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_gu_fei_student_lecture_haiyou_bubble/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_gu_fei_student_lecture_haiyou_bubble: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Gu Fei Student Lecture Page detected {} regions:",
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 4 REGIONS TOTAL (4 DIALOGUE BUBBLES)
    assert_eq!(
        res.regions.len(),
        4,
        "Expected exactly 4 regions total, got {}",
        res.regions.len()
    );
    let bubble_count = res
        .regions
        .iter()
        .filter(|r| r.kind == RegionKind::DialogueBubble)
        .count();
    assert_eq!(
        bubble_count, 4,
        "Expected exactly 4 dialogue bubbles, got {}",
        bubble_count
    );

    // 2. TOP BUBBLE: '作为学生，应该好好学习，不要整天想着游戏！'
    let r_study = res.regions.iter().find(|r| r.text.contains("作为学生"));
    assert!(r_study.is_some(), "Must detect top bubble '作为学生...'");
    let r_study = r_study.unwrap();
    crate::assert_region_bounds!(r_study, RegionKind::DialogueBubble, 278, 156, 294, 124, 25);

    // 3. MIDDLE CIRCULAR BUBBLE: '还有!' (MUST NOT CONTAIN HALLUCINATED PARENTHESES)
    let r_haiyou = res.regions.iter().find(|r| r.text.contains("还有"));
    assert!(r_haiyou.is_some(), "Must detect middle bubble '还有!'");
    let r_haiyou = r_haiyou.unwrap();
    assert!(
        !r_haiyou.text.contains('(') && !r_haiyou.text.contains(')'),
        "Must not hallucinate half-width parentheses in '{}'",
        r_haiyou.text
    );
    assert!(
        !r_haiyou.text.contains('（') && !r_haiyou.text.contains('）'),
        "Must not hallucinate full-width parentheses in '{}'",
        r_haiyou.text
    );
    crate::assert_region_bounds!(r_haiyou, RegionKind::DialogueBubble, 268, 630, 160, 64, 25);

    // 4. LOWER RIGHT BUBBLE: '知道了，只许州官放火，不许百姓点灯。'
    let r_fanghuo = res.regions.iter().find(|r| r.text.contains("州官放火"));
    assert!(r_fanghuo.is_some(), "Must detect lower right bubble '州官放火...'");
    let r_fanghuo = r_fanghuo.unwrap();
    crate::assert_region_bounds!(r_fanghuo, RegionKind::DialogueBubble, 559, 597, 223, 124, 25);

    // 5. BOTTOM JAGGED BANNER BUBBLE: '真的没有人要跟我学功夫吗？！'
    let r_kungfu = res.regions.iter().find(|r| r.text.contains("学功夫"));
    assert!(r_kungfu.is_some(), "Must detect bottom jagged bubble '学功夫...'");
    let r_kungfu = r_kungfu.unwrap();
    crate::assert_region_bounds!(r_kungfu, RegionKind::DialogueBubble, 115, 917, 488, 43, 25);
}
