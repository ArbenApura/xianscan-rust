// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_nie_li_scribbling_exclamation_bubble` (RESOLUTION: 800 × 1132)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 DIALOGUE BUBBLE 1**: `"聂离一直神神\n叨叨地在那写\n啥呢？"`
/// - **PANEL 1 DIALOGUE BUBBLE 2**: `"管他呢，先多\n研究一下铭\n纹和战技吧！"`
/// - **PANEL 2 DIALOGUE BUBBLE 1**: `"想要修炼到很高的\n境界，首先要做一个\n学识渊博的人！"`
/// - **PANEL 2 DIALOGUE BUBBLE 2**: `"哦？"`
/// - **PANEL 2 DIALOGUE BUBBLE 3**: `"哦。"` / `"哦"`
/// - **PANEL 3 DIALOGUE BUBBLE (CRITICAL)**: `"诶！？"` / `"诶!?"` (DialogueBubble, must not be missed or filtered out)
/// - **NEGATIVE GUARD**: Platform watermark `"漫客栈"` in bottom-right corner must be filtered out.
#[test]
fn test_regression_page_nie_li_scribbling_exclamation_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_nie_li_scribbling_exclamation_bubble") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_nie_li_scribbling_exclamation_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Nie Li Scribbling Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 0. EXACT ELEMENT COUNTS: EXACTLY 6 REGIONS (6 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT)
    crate::assert_element_counts!(res, 6, 6, 0);

    // 1. DIALOGUE BUBBLE 1: '聂离一直神神\n叨叨地在那写\n啥呢？'
    let b1 = res.regions.iter().find(|r| r.text.contains("聂离一直") || r.text.contains("神神叨叨") || r.text.contains("写啥呢"));
    assert!(b1.is_some(), "Must detect panel 1 dialogue bubble '聂离一直神神叨叨...'");
    let b1 = b1.unwrap();
    assert_eq!(b1.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 346, 39, 150, 80, 8);
    crate::assert_bubble_bounds!(b1, 338, 37, 173, 101, 8);
    crate::assert_region_angle!(b1, 0.0, 2.0);

    // 2. DIALOGUE BUBBLE 2: '管他呢，先多\n研究一下铭\n纹和战技吧！'
    let b2 = res.regions.iter().find(|r| r.text.contains("管他呢") || r.text.contains("铭纹") || r.text.contains("战技"));
    assert!(b2.is_some(), "Must detect panel 1 dialogue bubble '管他呢，先多研究一下...'");
    let b2 = b2.unwrap();
    assert_eq!(b2.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b2, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 464, 246, 128, 92, 8);
    crate::assert_bubble_bounds!(b2, 454, 231, 164, 125, 8);
    crate::assert_region_angle!(b2, 0.0, 2.0);

    // 3. DIALOGUE BUBBLE 3: '想要修炼到很高的\n境界，首先要做一个\n学识渊博的人！'
    let b3 = res.regions.iter().find(|r| r.text.contains("想要修炼") || r.text.contains("学识渊博"));
    assert!(b3.is_some(), "Must detect panel 2 dialogue bubble '想要修炼到很高的境界...'");
    let b3 = b3.unwrap();
    assert_eq!(b3.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b3, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 182, 388, 218, 93, 8);
    crate::assert_bubble_bounds!(b3, 155, 382, 255, 135, 8);
    crate::assert_region_angle!(b3, 0.0, 2.0);

    // 4. DIALOGUE BUBBLE 4: '哦？'
    let b4 = res.regions.iter().find(|r| (r.text.contains("哦") || r.text.contains("o")) && r.box_.x < 300 && r.box_.y > 500 && r.box_.y < 700);
    assert!(b4.is_some(), "Must detect panel 2 left dialogue bubble '哦？'");
    let b4 = b4.unwrap();
    assert_eq!(b4.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b4, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 159, 586, 65, 58, 8);
    crate::assert_bubble_bounds!(b4, 152, 576, 86, 78, 8);
    crate::assert_region_angle!(b4, 0.0, 2.0);

    // 5. DIALOGUE BUBBLE 5: '哦' / '哦。'
    let b5 = res.regions.iter().find(|r| (r.text.contains("哦") || r.text.contains("o")) && r.box_.x >= 300 && r.box_.y > 500 && r.box_.y < 700);
    assert!(b5.is_some(), "Must detect panel 2 right dialogue bubble '哦。'");
    let b5 = b5.unwrap();
    assert_eq!(b5.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b5, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 345, 596, 45, 40, 8);
    crate::assert_bubble_bounds!(b5, 345, 591, 45, 54, 8);
    crate::assert_region_angle!(b5, 0.0, 2.0);

    // 6. PANEL 3 DIALOGUE BUBBLE (PRIMARY DEFECT RESOLVED): '！？'
    let b6 = res.regions.iter().find(|r| (r.text.contains("！？") || r.text.contains("!?") || r.text.contains("诶")) && r.box_.y > 700);
    assert!(b6.is_some(), "Must detect panel 3 exclamation dialogue bubble '！？'");
    let b6 = b6.unwrap();
    assert_eq!(b6.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b6, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 78, 777, 99, 54, 8);
    crate::assert_bubble_bounds!(b6, 72, 724, 121, 169, 8);
    crate::assert_region_angle!(b6, 0.0, 2.0);

    // 7. NEGATIVE GUARDS: PLATFORM WATERMARK FILTERED
    assert!(!res.regions.iter().any(|r| r.text.contains("漫客")), "Must filter platform corner watermark '漫客栈'");
}
