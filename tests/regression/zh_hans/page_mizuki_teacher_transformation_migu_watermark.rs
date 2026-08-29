// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: page_mizuki_teacher_transformation_migu_watermark (RESOLUTION: 623 × 675)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP-LEFT DIALOGUE BUBBLE**: "我可不是\n水木……" (DialogueBubble).
/// - **PANEL 1 TOP-CENTER UPPER DIALOGUE BUBBLE**: "哼！" (DialogueBubble).
/// - **PANEL 1 TOP-CENTER LOWER DIALOGUE BUBBLE**: "愚蠢！不要太小\n看了我这个超一\n流的老师！" (DialogueBubble).
/// - **PANEL 1 TOP-RIGHT-CENTER DIALOGUE BUBBLE**: "太棒了！" (DialogueBubble).
/// - **PANEL 1 TOP-RIGHT DIALOGUE BUBBLE**: "哇啊啊啊！" (DialogueBubble).
/// - **PANEL 2 MIDDLE-LEFT DIALOGUE BUBBLE 1**: "哎？" (DialogueBubble).
/// - **PANEL 2 MIDDLE-LEFT DIALOGUE BUBBLE 2**: "！" / "1." (DialogueBubble).
/// - **PANEL 2 MIDDLE-CENTER DIALOGUE BUBBLE**: "变身！" (DialogueBubble).
/// - **NEGATIVE GUARDS (ZERO WATERMARK LEAKAGE)**:
///   1. Margin aggregator watermark "COLAMANHUA.com" must NOT be detected.
///   2. Margin aggregator watermark "ACloudMerge.com" must NOT be detected.
///   3. Bottom-right logo/stamp "米古" / "MIGU" / "古漫" must NOT be detected as FreeText or any region.
/// - **EXACT COUNTS**: Exactly 8 dialogue bubble regions (8 dialogue bubbles, 0 sound effects, 0 free text).
#[test]
fn test_regression_page_mizuki_teacher_transformation_migu_watermark() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_mizuki_teacher_transformation_migu_watermark/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_mizuki_teacher_transformation_migu_watermark: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!("Mizuki Teacher Transformation Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 8 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT
    crate::assert_element_counts!(res, 8, 8, 0, 0);

    // 2. NEGATIVE WATERMARK & LOGO GUARDS
    assert!(
        !res.regions.iter().any(|r| {
            let t = r.text.to_lowercase();
            t.contains("米古") || t.contains("migu") || t.contains("colamanhua") || t.contains("acloudmerge") || t.contains("古漫")
        }),
        "Watermark '米古' / 'ACloudMerge' / 'COLAMANHUA' must be suppressed completely"
    );

    // 3. VERIFY STORY DIALOGUES
    let r_mizuki = res.regions.iter().find(|r| r.text.contains("水木"));
    assert!(r_mizuki.is_some(), "Must detect '我可不是水木'");
    assert_eq!(r_mizuki.unwrap().kind, RegionKind::DialogueBubble);

    let r_hmph = res.regions.iter().find(|r| r.text.contains("哼"));
    assert!(r_hmph.is_some(), "Must detect '哼！'");
    assert_eq!(r_hmph.unwrap().kind, RegionKind::DialogueBubble);

    let r_awesome = res.regions.iter().find(|r| r.text.contains("太棒"));
    assert!(r_awesome.is_some(), "Must detect '太棒了！'");
    assert_eq!(r_awesome.unwrap().kind, RegionKind::DialogueBubble);

    let r_wah = res.regions.iter().find(|r| r.text.contains("哇啊"));
    assert!(r_wah.is_some(), "Must detect '哇啊啊啊！'");
    assert_eq!(r_wah.unwrap().kind, RegionKind::DialogueBubble);

    let r_teacher = res.regions.iter().find(|r| r.text.contains("超一流") || r.text.contains("愚蠢"));
    assert!(r_teacher.is_some(), "Must detect teacher speech '愚蠢！不要太小看了我这个超一流的老师！'");
    assert_eq!(r_teacher.unwrap().kind, RegionKind::DialogueBubble);

    let r_transform = res.regions.iter().find(|r| r.text.contains("变身"));
    assert!(r_transform.is_some(), "Must detect '变身！'");
    assert_eq!(r_transform.unwrap().kind, RegionKind::DialogueBubble);
}
