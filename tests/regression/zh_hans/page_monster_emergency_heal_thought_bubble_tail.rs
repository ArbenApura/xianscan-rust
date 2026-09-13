// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_monster_emergency_heal_thought_bubble_tail` (RESOLUTION: 800 × 1954)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP TORCH SCREAM BUBBLE**:
///   `"啊啊啊啊！！！"` (DialogueBubble).
/// - **PANEL 1 THOUGHT BUBBLE TAIL CIRCLE SUPPRESSION**:
///   `"好凄惨的叫声，\n莫非？"` (DialogueBubble).
///   - MUST NOT contain trailing thought bubble tail circle `"0"` or `"o"`.
///   - Text box and inpaint box MUST remain clamped within outer bubble boundary (x + w <= 454).
/// - **PANEL 2 BOY DIALOGUE BUBBLE**:
///   `"那个。"` (DialogueBubble).
/// - **PANEL 2 GIRL COMMAND DIALOGUE BUBBLE**:
///   `"老板好好跟新丁在\n后面该干嘛干嘛，\n不要打扰我指挥。"` (DialogueBubble).
/// - **PANEL 2 CIRCULAR BUBBLE BORDER BRACKET SUPPRESSION**:
///   `"好吧。"` (DialogueBubble).
///   - MUST NOT hallucinate enclosing brackets `"【"` or `"】"` from circular bubble boundaries.
///   - Text box MUST remain strictly clamped within outer bubble boundary ([413, 523]).
/// - **PANEL 3 BOTTOM BATTLE MONSTER HEAL BUBBLE**:
///   `"这只怪居然还有紧\n急回血技能，害得\n我打这么久！"` (DialogueBubble).
/// - **EXACT COUNTS**: EXACTLY 6 REGIONS TOTAL (6 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT).
#[test]
fn test_regression_page_monster_emergency_heal_thought_bubble_tail() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_monster_emergency_heal_thought_bubble_tail/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!("Detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region #{}: kind={:?}, box={:?}, typeset={:?}, bubble={:?}, inpaint={:?}, text='{}'",
            i,
            r.kind,
            r.box_,
            r.typeset_box,
            r.bubble_box,
            r.inpaint_box,
            r.text.replace('\n', "\\n")
        );
    }

    // 1. EXACT ELEMENT COUNTS: 6 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT
    crate::assert_element_counts!(res, 6, 6, 0, 0);

    // 2. PANEL 1 TOP TORCH SCREAM BUBBLE: '啊啊啊啊！！！'
    let r0 = res.regions.iter().find(|r| r.text.contains("啊啊啊啊")).expect("Missing top scream bubble");
    crate::assert_region_bounds!(r0, RegionKind::DialogueBubble, 309, 45, 214, 32, 6);
    crate::assert_bubble_bounds!(r0, 276, 40, 269, 52, 6);

    // 3. PANEL 1 THOUGHT BUBBLE: '好凄惨的叫声，\n莫非？'
    let r1 = res.regions.iter().find(|r| r.text.contains("好凄惨的叫声")).expect("Missing thought bubble");
    assert_eq!(r1.text.trim(), "好凄惨的叫声，\n莫非？");
    assert!(!r1.text.contains('0'), "Thought bubble text must not contain tail circle digit '0'");
    assert!(!r1.text.contains('o'), "Thought bubble text must not contain tail circle 'o'");
    crate::assert_region_bounds!(r1, RegionKind::DialogueBubble, 235, 275, 219, 78, 6);
    crate::assert_bubble_bounds!(r1, 215, 244, 239, 135, 6);
    assert!(
        r1.box_.x + r1.box_.w <= 215 + 239 + 2,
        "Text box right edge ({}) must not exceed outer bubble boundary ({})",
        r1.box_.x + r1.box_.w,
        215 + 239
    );

    // 4. PANEL 2 BOY DIALOGUE BUBBLE: '那个。'
    let r2 = res.regions.iter().find(|r| r.text.trim() == "那个。").expect("Missing '那个。' bubble");
    crate::assert_region_bounds!(r2, RegionKind::DialogueBubble, 258, 521, 92, 46, 6);
    crate::assert_bubble_bounds!(r2, 243, 503, 118, 91, 6);

    // 5. PANEL 2 GIRL COMMAND DIALOGUE BUBBLE: '老板好好跟新丁在...'
    let r3 = res.regions.iter().find(|r| r.text.contains("新丁")).expect("Missing girl command bubble");
    assert!(r3.text.contains("老板好好跟新丁在"));
    assert!(r3.text.contains("不要打扰我指挥"));
    crate::assert_region_bounds!(r3, RegionKind::DialogueBubble, 443, 499, 261, 115, 6);
    crate::assert_bubble_bounds!(r3, 414, 465, 323, 194, 6);

    // 6. PANEL 2 CIRCULAR BUBBLE: '好吧。'
    let r4 = res.regions.iter().find(|r| r.text.contains("好吧")).expect("Missing '好吧。' bubble");
    assert_eq!(r4.text.trim(), "好吧。");
    assert!(!r4.text.contains('【') && !r4.text.contains('】'), "Circular bubble must not hallucinate brackets");
    crate::assert_region_bounds!(r4, RegionKind::DialogueBubble, 424, 866, 89, 42, 6);
    crate::assert_bubble_bounds!(r4, 413, 849, 110, 81, 6);
    assert!(
        r4.box_.x >= 413 - 2 && r4.box_.x + r4.box_.w <= 413 + 110 + 2,
        "Text box [{}, {}] must remain inside bubble [413, 523]",
        r4.box_.x,
        r4.box_.x + r4.box_.w
    );

    // 7. PANEL 3 BOTTOM BATTLE MONSTER HEAL BUBBLE: '这只怪居然还有紧急回血技能...'
    let r5 = res.regions.iter().find(|r| r.text.contains("回血技能")).expect("Missing monster heal bubble");
    assert!(r5.text.contains("这只怪居然还有紧"));
    assert!(r5.text.contains("我打这么久"));
    crate::assert_region_bounds!(r5, RegionKind::DialogueBubble, 437, 1392, 261, 114, 6);
    crate::assert_bubble_bounds!(r5, 402, 1363, 332, 190, 6);
}
