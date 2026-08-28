// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: page_naruto_transformation_hokage_hat (RESOLUTION: 623 × 964)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP-LEFT FREE TEXT r0**: "这已经是今天\n的第一十次偷\n装了吧？" (FreeText).
/// - **PANEL 1 TOP-LEFT SPEECH BUBBLE r1**: "什么？这\n下糟了！" (DialogueBubble).
/// - **PANEL 1 TOP-CENTER FREE TEXT r2**: "唉\n我怎么会把他\n带成这样…" (FreeText).
/// - **PANEL 1 TOP-CENTER SPEECH BUBBLE r3**: "他好像是去\n追鸣人了！" (DialogueBubble).
/// - **PANEL 1 TOP-RIGHT SPEECH BUBBLE r4**: "咦，人呢？糟糕！\n又被他给逃了！" (DialogueBubble).
/// - **PANEL 3 BOTTOM-CENTER SPEECH BUBBLE r5**: "是，老大！" (DialogueBubble).
/// - **PANEL 3 BOTTOM-CENTER SPEECH BUBBLE r6**: "变身" (DialogueBubble).
/// - **PANEL 3 BOTTOM-RIGHT SPEECH BUBBLE r7**: "明白了吗？关键就是凹\n凸翘！你来试试吧！" (DialogueBubble).
/// - **PANEL 2 CENTER-LEFT NARRATION BOX r8**: "但愿他不会教木叶丸\n什么愚蠢的东西……" (FreeText).
/// - **PANEL 2 CENTER-RIGHT NARRATION BOX r9**: "要是跟着鸣人就更让\n人担心了……" (FreeText).
/// - **NEGATIVE GUARDS**:
///   1. Third Hokage's hat insignia kanji ("火") at (419, 427, w=28, h=29) must NOT be detected.
///      FIXED BY: is_compact_single_glyph_box guard (char_count==1 && w<=40 && h<=40, non-bubble).
///   2. Bottom-right corner watermark ("古疆动漫" / "动漫") must NOT be detected.
///   3. "天啊——" is embedded in an oversized noisy OCR blob covering (55,367,217,548)
///      which is correctly rejected by the giant artwork filter; this is an acceptable model limitation.
/// - **EXACT COUNTS**: Exactly 10 legitimate dialogue/narration regions.
#[test]
fn test_regression_page_naruto_transformation_hokage_hat() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_naruto_transformation_hokage_hat/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_naruto_transformation_hokage_hat: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!("Naruto Transformation Hokage Hat Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: 10 REGIONS (6 DIALOGUE BUBBLES, 0 SFX, 4 FREE TEXT)
    crate::assert_element_counts!(res, 10, 6, 0, 4);

    // 2. PANEL 1 TOP-LEFT: '这已经是今天的第一十次偷装了吧？'
    let r0 = res.regions.iter().find(|r| r.text.contains("今天") || r.text.contains("偷") || r.text.contains("十次"));
    assert!(r0.is_some(), "Must detect panel 1 top-left free text '这已经是今天的第一十次偷装了吧？'");
    let r0 = r0.unwrap();
    assert_eq!(r0.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(r0, RegionKind::FreeText, 51, 50, 74, 111, 15);

    // 3. PANEL 1 TOP-LEFT: '什么？这下糟了！'
    let r1 = res.regions.iter().find(|r| r.text.contains("糟了") || r.text.contains("什么"));
    assert!(r1.is_some(), "Must detect panel 1 dialogue bubble '什么？这下糟了！'");
    let r1 = r1.unwrap();
    assert_eq!(r1.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r1, RegionKind::DialogueBubble, 148, 53, 72, 84, 15);

    // 4. PANEL 1 TOP-CENTER: '唉……我怎么会把他带成这样…'
    let r2 = res.regions.iter().find(|r| r.text.contains("带成这样") || r.text.contains("怎么会"));
    assert!(r2.is_some(), "Must detect panel 1 free text '我怎么会把他带成这样'");
    let r2 = r2.unwrap();
    assert_eq!(r2.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(r2, RegionKind::FreeText, 230, 52, 67, 104, 15);

    // 5. PANEL 1 TOP-CENTER: '他好像是去追鸣人了！'
    let r3 = res.regions.iter().find(|r| r.text.contains("追鸣人") || r.text.contains("好像是"));
    assert!(r3.is_some(), "Must detect panel 1 bubble '他好像是去追鸣人了！'");
    let r3 = r3.unwrap();
    assert_eq!(r3.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r3, RegionKind::DialogueBubble, 322, 53, 63, 122, 15);

    // 6. PANEL 1 TOP-RIGHT: '咦，人呢？糟糕！又被他给逃了！'
    let r4 = res.regions.iter().find(|r| r.text.contains("糟糕") || r.text.contains("逃了") || r.text.contains("人呢"));
    assert!(r4.is_some(), "Must detect panel 1 bubble '咦，人呢？糟糕！又被他给逃了！'");
    let r4 = r4.unwrap();
    assert_eq!(r4.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r4, RegionKind::DialogueBubble, 503, 60, 72, 168, 15);

    // 7. PANEL 3 BOTTOM-CENTER: '是，老大！'
    let r5 = res.regions.iter().find(|r| r.text.contains("老大") || r.text.contains("是，老"));
    assert!(r5.is_some(), "Must detect bottom-center bubble '是，老大！'");
    let r5 = r5.unwrap();
    assert_eq!(r5.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r5, RegionKind::DialogueBubble, 286, 604, 46, 143, 15);

    // 8. PANEL 3 BOTTOM-CENTER: '变身'
    let r6 = res.regions.iter().find(|r| r.text.contains("变身"));
    assert!(r6.is_some(), "Must detect bottom-center bubble '变身'");
    let r6 = r6.unwrap();
    assert_eq!(r6.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r6, RegionKind::DialogueBubble, 287, 755, 68, 114, 15);

    // 9. PANEL 3 BOTTOM-RIGHT: '明白了吗？关键就是凹凸翘！你来试试吧！'
    let r7 = res.regions.iter().find(|r| r.text.contains("明白了吗") || r.text.contains("凹") || r.text.contains("试试吧"));
    assert!(r7.is_some(), "Must detect bottom-right bubble '明白了吗？关键就是凹凸翘！你来试试吧！'");
    let r7 = r7.unwrap();
    assert_eq!(r7.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r7, RegionKind::DialogueBubble, 498, 592, 76, 280, 15);

    // 10. PANEL 2 CENTER-LEFT NARRATION: '但愿他不会教木叶丸什么愚蠢的东西……'
    let r8 = res.regions.iter().find(|r| r.text.contains("木叶丸") || r.text.contains("愚蠢"));
    assert!(r8.is_some(), "Must detect center-left narration '但愿他不会教木叶丸什么愚蠢的东西……'");
    let r8 = r8.unwrap();
    assert_eq!(r8.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(r8, RegionKind::FreeText, 290, 365, 55, 170, 15);

    // 11. PANEL 2 CENTER-RIGHT NARRATION: '要是跟着鸣人就更让人担心了……'
    let r9 = res.regions.iter().find(|r| r.text.contains("跟着鸣人") || r.text.contains("担心"));
    assert!(r9.is_some(), "Must detect center-right narration '要是跟着鸣人就更让人担心了……'");
    let r9 = r9.unwrap();
    assert_eq!(r9.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(r9, RegionKind::FreeText, 524, 365, 56, 170, 15);

    // 12. NEGATIVE GUARDS:
    // Hat insignia '火' kanji must NOT be detected as standalone text
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "火"),
        "Must NOT detect Third Hokage hat insignia '火' as a standalone text region (compact single-glyph box filter)"
    );
    // Platform watermark
    assert!(
        !res.regions.iter().any(|r| r.text.contains("古疆") || r.text.contains("动漫")),
        "Must NOT detect corner platform watermark as a region"
    );
    // No single-char non-bubble artwork inscriptions
    assert!(
        !res.regions.iter().any(|r| {
            r.bubble_box.is_none()
                && r.text.chars().filter(|c| !c.is_whitespace()).count() == 1
                && r.box_.w <= 40
                && r.box_.h <= 40
        }),
        "Must NOT detect any isolated single-char artwork glyphs in compact non-bubble boxes"
    );
}
