// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_mage_academy_fireball_shoot_dash_split` (RESOLUTION: 800 × 1851)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP SHOUT BUBBLE**:
///   `"火球——"` (DialogueBubble).
/// - **PANEL 1 BUILDING PLAQUE**:
///   `"法师学院"` (or `"法帅学院"`, FreeText on building entrance).
/// - **PANEL 2 LEFT DIALOGUE BUBBLE**:
///   `"哇，你的火球\n比我的大！"` (DialogueBubble).
/// - **PANEL 2 RIGHT DIALOGUE BUBBLE**:
///   `"技能视觉效果做\n得也很逼真呢！"` (DialogueBubble).
/// - **PANEL 3 MAIN SHOUT BUBBLE**:
///   `"火球——射！"` (DialogueBubble, spiky shout bubble with prolonged dash).
///   - MUST NOT drop `"射！"` across the wide dash gap.
///   - MUST contain both `"火球"` and `"射"`.
/// - **PANEL 3 BOTTOM DIALOGUE BUBBLE**:
///   `"耍宝的人也多。"` (DialogueBubble).
/// - **EXPLICIT NEGATIVE GUARDS**:
///   - PANEL 3 SHOUT BUBBLE MUST NOT TRUNCATE TO ONLY `"火球一"`.
///   - MUST NOT DETECT '漫客栈' PUBLISHER WATERMARK.
/// - **EXACT COUNTS**: EXACTLY 6 REGIONS TOTAL (5 DIALOGUE BUBBLE, 0 SFX, 1 FREE TEXT).
#[test]
fn test_regression_page_mage_academy_fireball_shoot_dash_split() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_mage_academy_fireball_shoot_dash_split/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_mage_academy_fireball_shoot_dash_split: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Mage Academy Fireball Shoot Page detected {} regions:",
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 6 REGIONS (5 DIALOGUE BUBBLES, 0 SFX, 1 FREE TEXT)
    crate::assert_element_counts!(res, 6, 5, 0, 1);

    // 2. PANEL 1 TOP SHOUT BUBBLE: '火球——'
    let bubble_top = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.box_.y < 300 && r.text.contains("火球")
    });
    assert!(bubble_top.is_some(), "Must detect panel 1 shout bubble '火球——'");
    let bubble_top = bubble_top.unwrap();
    crate::assert_region_bounds!(bubble_top, RegionKind::DialogueBubble, 416, 125, 222, 96, 15);
    crate::assert_bubble_bounds!(bubble_top, 404, 90, 292, 190, 20);

    // 3. PANEL 1 BUILDING PLAQUE: '法师学院' (FreeText)
    let plaque = res.regions.iter().find(|r| r.text.contains("学院"));
    assert!(plaque.is_some(), "Must detect building plaque '法师学院'");
    let plaque = plaque.unwrap();
    assert_eq!(plaque.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(plaque, RegionKind::FreeText, 524, 459, 167, 28, 15);

    // 4. PANEL 2 LEFT BUBBLE: '哇，你的火球比我的大！'
    let bubble_left = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("比我的大")
    });
    assert!(bubble_left.is_some(), "Must detect panel 2 left bubble '哇，你的火球比我的大！'");
    let bubble_left = bubble_left.unwrap();
    crate::assert_region_bounds!(bubble_left, RegionKind::DialogueBubble, 66, 676, 202, 86, 15);

    // 5. PANEL 2 RIGHT BUBBLE: '技能视觉效果做得也很逼真呢！'
    let bubble_right = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("视觉效果")
    });
    assert!(bubble_right.is_some(), "Must detect panel 2 right bubble '技能视觉效果做得也很逼真呢！'");
    let bubble_right = bubble_right.unwrap();
    crate::assert_region_bounds!(bubble_right, RegionKind::DialogueBubble, 486, 684, 230, 73, 15);

    // 6. PANEL 3 MAIN SHOUT BUBBLE: '火球——射！' (Must NOT drop '射！')
    let bubble_shoot = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.box_.y > 1100 && r.box_.y < 1400 && r.text.contains("火球")
    });
    assert!(bubble_shoot.is_some(), "Must detect panel 3 shout bubble '火球——射！'");
    let bubble_shoot = bubble_shoot.unwrap();
    assert!(
        bubble_shoot.text.contains("射"),
        "Panel 3 shout bubble must contain verb '射', got '{}'",
        bubble_shoot.text
    );
    crate::assert_region_bounds!(bubble_shoot, RegionKind::DialogueBubble, 326, 1264, 250, 65, 25);
    crate::assert_bubble_bounds!(bubble_shoot, 271, 1238, 387, 156, 20);

    // 7. PANEL 3 BOTTOM BUBBLE: '耍宝的人也多。'
    let bubble_bottom = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("耍宝")
    });
    assert!(bubble_bottom.is_some(), "Must detect panel 3 bottom bubble '耍宝的人也多。'");
    let bubble_bottom = bubble_bottom.unwrap();
    crate::assert_region_bounds!(bubble_bottom, RegionKind::DialogueBubble, 195, 1703, 214, 50, 15);

    // 8. EXPLICIT NEGATIVE GUARDS
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "火球一" || r.text.trim() == "火球-"),
        "Panel 3 shout bubble must NOT truncate to only '火球一' without '射'"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客栈")),
        "Must NOT detect publisher watermark '漫客栈'"
    );
}
