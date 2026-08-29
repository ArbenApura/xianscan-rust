// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_saint_nether_grass_catch_present` (RESOLUTION: 800 × 1132)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 BUBBLE**: `"哼。"` / `"哼"`
/// - **PANEL 2 LEFT BUBBLE**: `"接着。"` (Vertical reading)
/// - **PANEL 2 RIGHT BUBBLE 1**: `"送你了！"`
/// - **PANEL 2 RIGHT BUBBLE 2 (CRITICAL FIX)**: `"诶？"` (DialogueBubble, must not be misrecognized as Latin `"L\n？"`)
/// - **PANEL 3 SHOUT BUBBLE**: `"一株五\n万？！\n六株就\n是三十\n万！"`
/// - **PANEL 3 DIALOGUE BUBBLE**: `"这是六株五年份的\n圣冥草，只有我们家\n才有，跟着我好好干，\n少不了你们的好处！"`
/// - **EXACT COUNTS**: Exactly 6 dialogue bubbles, 0 sound effects, 0 free text.
/// - **NEGATIVE GUARD**: Platform watermark `"漫客栈"` in bottom-right corner must be filtered out.
#[test]
fn test_regression_page_saint_nether_grass_catch_present() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_saint_nether_grass_catch_present") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_saint_nether_grass_catch_present: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Saint Nether Grass Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 0. EXACT ELEMENT COUNTS: EXACTLY 6 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 6, 6, 0);

    // 1. PANEL 1 BUBBLE: '哼。' / '哼'
    let b1 = res.regions.iter().find(|r| r.text.contains("哼") && r.box_.y < 300);
    assert!(b1.is_some(), "Must detect panel 1 dialogue bubble '哼'");
    let b1 = b1.unwrap();
    assert_eq!(b1.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 362, 68, 81, 94, 15);
    crate::assert_region_angle!(b1, 0.0, 2.0);

    // 2. PANEL 2 LEFT BUBBLE: '接着。'
    let b2 = res.regions.iter().find(|r| r.text.contains("接着"));
    assert!(b2.is_some(), "Must detect panel 2 left dialogue bubble '接着。'");
    let b2 = b2.unwrap();
    assert_eq!(b2.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b2, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 69, 407, 54, 92, 10);
    crate::assert_region_angle!(b2, 0.0, 2.0);

    // 3. PANEL 2 RIGHT BUBBLE 1: '送你了！'
    let b3 = res.regions.iter().find(|r| r.text.contains("送你了"));
    assert!(b3.is_some(), "Must detect panel 2 dialogue bubble '送你了！'");
    let b3 = b3.unwrap();
    assert_eq!(b3.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b3, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 577, 402, 70, 30, 10);
    crate::assert_region_angle!(b3, 0.0, 2.0);

    // 4. PANEL 2 RIGHT BUBBLE 2 (CRITICAL FIX): '？' / '诶？' (MUST NOT BE 'L\n？')
    let b4 = res.regions.iter().find(|r| (r.text.contains("诶") || r.text.contains("唉") || r.text.contains("？") || r.text.contains("?")) && r.box_.x > 650 && r.box_.y > 350 && r.box_.y < 550);
    assert!(b4.is_some(), "Must detect panel 2 right dialogue bubble '？'");
    let b4 = b4.unwrap();
    assert_eq!(b4.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!b4.text.contains('L') && !b4.text.contains('l'), "Bubble must NOT be misrecognized as Latin 'L': got '{}'", b4.text);
    crate::assert_region_bounds!(b4, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 674, 405, 43, 38, 12);
    crate::assert_region_angle!(b4, 0.0, 2.0);

    // 5. PANEL 3 SHOUT BUBBLE: '一株五\n万？！\n六株就\n是三十\n万！'
    let b5 = res.regions.iter().find(|r| r.text.contains("一株五") || r.text.contains("三十万") || r.text.contains("六株"));
    assert!(b5.is_some(), "Must detect panel 3 shout bubble '一株五万？！...'");
    let b5 = b5.unwrap();
    assert_eq!(b5.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b5, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 519, 743, 73, 160, 10);
    crate::assert_region_angle!(b5, 0.0, 2.0);

    // 6. PANEL 3 DIALOGUE BUBBLE: '这是六株五年份的\n圣冥草，只有我们家\n才有，跟着我好好干，\n少不了你们的好处！'
    let b6 = res.regions.iter().find(|r| r.text.contains("圣冥草") || r.text.contains("好处") || r.text.contains("只有我们家"));
    assert!(b6.is_some(), "Must detect panel 3 dialogue bubble '这是六株五年份的圣冥草...'");
    let b6 = b6.unwrap();
    assert_eq!(b6.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b6, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 173, 931, 181, 122, 10);
    crate::assert_region_angle!(b6, 0.0, 2.0);

    // 7. NEGATIVE GUARDS: PLATFORM WATERMARK FILTERED
    assert!(!res.regions.iter().any(|r| r.text.contains("漫客")), "Must filter platform corner watermark '漫客栈'");
}
