// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: page_sensei_remove_tumor_understood_boss (RESOLUTION: 623 × 954)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP-LEFT FREE TEXT**: "我一定要清除掉在我\n学生身边的毒瘤！" (FreeText).
/// - **PANEL 1 TOP-CENTER FREE TEXT**: "我这个超一流的老\n师可是培养出了好\n几代火影候补生！" (FreeText).
/// - **PANEL 1 TOP-MIDDLE FREE TEXT**: "老大！\n明白！" (FreeText / Onomatopoeia dialogue).
/// - **PANEL 1 TOP-RIGHT SLANTED FREE TEXT**: "不行！\n要更人漂壳更\n苗条一些！" (FreeText with non-zero angle).
/// - **PANEL 2 MIDDLE-LEFT FREE TEXT**: "孙少爷，这才是\n捷径啊！" (FreeText).
/// - **PANEL 2 MIDDLE-RIGHT FREE TEXT**: "只要按我\n教的来，要成\n为火影容易得限" (FreeText).
/// - **PANEL 2 MIDDLE DIALOGUE BUBBLE 1**: "刷！" (DialogueBubble).
/// - **PANEL 2 MIDDLE DIALOGUE BUBBLE 2**: "在那儿！" (DialogueBubble).
/// - **PANEL 3 BOTTOM-RIGHT DIALOGUE BUBBLE**: "说起来……" (DialogueBubble).
/// - **PANEL 3 BOTTOM-CENTER SPLIT DIALOGUE BUBBLE**:
///   1. Upper utterance: "为什么你\n那么想打\n倒……" (DialogueBubble).
///   2. Lower utterance: "火影爷\n爷啊？" (DialogueBubble).
/// - **NEGATIVE GUARDS**:
///   1. Isolated stray "!" / noise around (342, 205) must NOT be detected as standalone region.
///   2. Bottom-left noise bubble (84, 682) (一\n0) must NOT be detected.
///   3. Bottom-right corner watermark (古疆\n动漫) must NOT be detected.
/// - **EXACT COUNTS**: Exactly 11 regions (5 dialogue bubble texts across 4 bubbles, 0 sound effects, 6 free texts).
#[test]
fn test_regression_page_sensei_remove_tumor_understood_boss() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_sensei_remove_tumor_understood_boss/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_sensei_remove_tumor_understood_boss: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!("Sensei Remove Tumor Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 11 REGIONS (5 DIALOGUE BUBBLES, 0 SFX, 6 FREE TEXT)
    crate::assert_element_counts!(res, 11, 5, 0, 6);

    // 2. PANEL 1 TOP-LEFT FREE TEXT: '我一定要清除掉在我学生身边的毒瘤！'
    let ft1 = res.regions.iter().find(|r| r.text.contains("身边") || r.text.contains("毒瘤") || r.text.contains("清除掉"));
    assert!(ft1.is_some(), "Must detect top-left free text '学生身边的毒瘤'");
    let ft1 = ft1.unwrap();
    assert_eq!(ft1.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(ft1, RegionKind::FreeText, 40, 49, 58, 171, 15);

    // 3. PANEL 1 TOP-CENTER FREE TEXT: '我这个超一流的老师可是培养出了好几代火影候补生！'
    let ft2 = res.regions.iter().find(|r| r.text.contains("超一流") || r.text.contains("候补生") || r.text.contains("培养出"));
    assert!(ft2.is_some(), "Must detect top-center free text '超一流的老师'");
    let ft2 = ft2.unwrap();
    assert_eq!(ft2.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(ft2, RegionKind::FreeText, 213, 52, 83, 155, 15);

    // 4. PANEL 1 TOP-MIDDLE FREE TEXT / DIALOGUE: '老大！明白！'
    let ft3 = res.regions.iter().find(|r| r.text.contains("老大") || r.text.contains("明白"));
    assert!(ft3.is_some(), "Must detect top-middle free text '老大！明白！'");
    let ft3 = ft3.unwrap();
    assert_eq!(ft3.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(ft3, RegionKind::FreeText, 319, 153, 66, 72, 20);

    // 5. PANEL 1 TOP-RIGHT SLANTED FREE TEXT: '不行！要更人漂壳更苗条一些！'
    let ft4 = res.regions.iter().find(|r| r.text.contains("苗条") || r.text.contains("漂") || r.text.contains("不行"));
    assert!(ft4.is_some(), "Must detect top-right slanted free text '苗条一些'");
    let ft4 = ft4.unwrap();
    assert_eq!(ft4.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(ft4, RegionKind::FreeText, 461, 106, 109, 110, 20);

    // 6. PANEL 2 MIDDLE-LEFT FREE TEXT: '孙少爷，这才是捷径啊！'
    let ft5 = res.regions.iter().find(|r| r.text.contains("孙少爷") || r.text.contains("捷径"));
    assert!(ft5.is_some(), "Must detect middle-left free text '孙少爷这才是捷径'");
    let ft5 = ft5.unwrap();
    assert_eq!(ft5.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(ft5, RegionKind::FreeText, 37, 335, 60, 135, 15);

    // 7. PANEL 2 MIDDLE-RIGHT FREE TEXT: '只要按我教的来，要成为火影容易得限'
    let ft6 = res.regions.iter().find(|r| r.text.contains("按我") || r.text.contains("火影容易") || r.text.contains("教的来"));
    assert!(ft6.is_some(), "Must detect middle-right free text '只要按我教的来'");
    let ft6 = ft6.unwrap();
    assert_eq!(ft6.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(ft6, RegionKind::FreeText, 456, 335, 85, 143, 15);

    // 8. PANEL 2 DIALOGUE BUBBLE 1: '刷！'
    let b1 = res.regions.iter().find(|r| r.text.contains("刷"));
    assert!(b1.is_some(), "Must detect dialogue bubble '刷！'");
    let b1 = b1.unwrap();
    assert_eq!(b1.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b1, RegionKind::DialogueBubble, 227, 427, 29, 64, 15);

    // 9. PANEL 2 DIALOGUE BUBBLE 2: '在那儿！'
    let b2 = res.regions.iter().find(|r| r.text.contains("在那儿") || r.text.contains("在那"));
    assert!(b2.is_some(), "Must detect dialogue bubble '在那儿！'");
    let b2 = b2.unwrap();
    assert_eq!(b2.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b2, RegionKind::DialogueBubble, 340, 372, 44, 122, 15);

    // 10. PANEL 3 BOTTOM-RIGHT DIALOGUE BUBBLE: '说起来……'
    let b3 = res.regions.iter().find(|r| r.text.contains("说起来"));
    assert!(b3.is_some(), "Must detect dialogue bubble '说起来……'");
    let b3 = b3.unwrap();
    assert_eq!(b3.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b3, RegionKind::DialogueBubble, 391, 575, 42, 123, 15);

    // 11. PANEL 3 BOTTOM-CENTER SPLIT DIALOGUE BUBBLE - UPPER: '为什么你那么想打倒……'
    let b4_upper = res.regions.iter().find(|r| r.text.contains("想打") || r.text.contains("为什么你"));
    assert!(b4_upper.is_some(), "Must detect bottom-center bubble upper utterance '为什么你那么想打倒……'");
    let b4_upper = b4_upper.unwrap();
    assert_eq!(b4_upper.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b4_upper, RegionKind::DialogueBubble, 276, 586, 91, 108, 15);

    // 12. PANEL 3 BOTTOM-CENTER SPLIT DIALOGUE BUBBLE - LOWER: '火影爷爷啊？'
    let b4_lower = res.regions.iter().find(|r| r.text.contains("火影爷") || r.text.contains("爷啊"));
    assert!(b4_lower.is_some(), "Must detect bottom-center bubble lower utterance '火影爷爷啊？'");
    let b4_lower = b4_lower.unwrap();
    assert_eq!(b4_lower.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b4_lower, RegionKind::DialogueBubble, 278, 728, 84, 80, 15);

    // 13. NEGATIVE GUARDS
    // Stray exclamation / single character around (342, 205)
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "!" || r.text.trim() == "1" || r.text.trim() == "11" || r.text.trim() == "rw"),
        "Must NOT detect stray punctuation or single-glyph OCR artifacts as separate regions"
    );
    // Bottom-left noise box at (84, 682)
    assert!(
        !res.regions.iter().any(|r| r.box_.y > 670 && r.box_.x < 120),
        "Must NOT detect bottom-left artwork noise bubble as a region"
    );
    // Bottom-right watermark '古疆动漫'
    assert!(
        !res.regions.iter().any(|r| r.text.contains("古疆") || r.text.contains("动漫")),
        "Must NOT detect corner platform watermark as a region"
    );
}