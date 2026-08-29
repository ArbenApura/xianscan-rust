// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_whose_god_will_i_be_slanted_free_text` (RESOLUTION: 900 × 1264)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 SLANTED FREE TEXT**: `"我还做谁的神！"` (FreeText with non-zero rotation angle).
/// - **PANEL 2 LEFT DIALOGUE BUBBLES**:
///   1. Upper small bubble: `"一万年了，"` (DialogueBubble)
///   2. Lower main bubble: `"从当初霍雨浩创\n建传灵塔组织到\n现在已经过去一\n万年了。"` (DialogueBubble)
/// - **PANEL 3 RIGHT DIALOGUE BUBBLES**:
///   1. Upper bubble: `"传灵塔组织还\n在，可我们魂\n兽……"` (DialogueBubble)
///   2. Lower bubble: `"就要从这个\n世界上灭绝\n了吗……"` (DialogueBubble)
/// - **NEGATIVE GUARD**: Must NOT hallucinate phantom duplicate FreeText `"雪\n传灵塔组织还"` on artwork.
/// - **EXACT COUNTS**: Exactly 5 regions (4 dialogue bubbles, 0 sound effects, 1 free text).
#[test]
fn test_regression_page_whose_god_will_i_be_slanted_free_text() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_whose_god_will_i_be_slanted_free_text/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_whose_god_will_i_be_slanted_free_text: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!("Whose God Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 5 REGIONS (4 DIALOGUE BUBBLES, 0 SFX, 1 FREE TEXT)
    crate::assert_element_counts!(res, 5, 4, 0, 1);

    // 2. PANEL 1 SLANTED FREE TEXT: '我还做谁的神！'
    let ft = res.regions.iter().find(|r| r.text.contains("我还做谁的神") || r.text.contains("谁的神"));
    assert!(ft.is_some(), "Must detect panel 1 slanted free text '我还做谁的神！'");
    let ft = ft.unwrap();
    assert_eq!(ft.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(ft, RegionKind::FreeText, 36, 107, 102, 326, 20);
    // ROTATION ANGLE: Text along the dark slash/aura is tilted (~-5° to -15° or non-zero)
    assert!(ft.angle.abs() >= 4.0, "Panel 1 free text must have non-zero rotation angle, got {:.2}°", ft.angle);

    // 3. PANEL 2 LEFT UPPER BUBBLE: '一万年了，'
    let b1 = res.regions.iter().find(|r| r.text.contains("一万年了") && !r.text.contains("霍雨浩"));
    assert!(b1.is_some(), "Must detect panel 2 upper bubble '一万年了，'");
    let b1 = b1.unwrap();
    assert_eq!(b1.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b1, RegionKind::DialogueBubble, 60, 1019, 109, 33, 20);

    // 4. PANEL 2 LEFT MAIN BUBBLE: '从当初霍雨浩创建传灵塔组织到现在已经过去一万年了。'
    let b2 = res.regions.iter().find(|r| r.text.contains("霍雨浩") || r.text.contains("从当初"));
    assert!(b2.is_some(), "Must detect panel 2 main bubble '从当初霍雨浩创建传灵塔组织...'");
    let b2 = b2.unwrap();
    assert_eq!(b2.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b2, RegionKind::DialogueBubble, 112, 1097, 167, 116, 20);

    // 5. PANEL 3 RIGHT UPPER BUBBLE: '传灵塔组织还在，可我们魂兽……'
    let b3 = res.regions.iter().find(|r| r.kind == RegionKind::DialogueBubble && r.text.contains("传灵塔组织还") && (r.text.contains("魂兽") || r.text.contains("我们")));
    assert!(b3.is_some(), "Must detect panel 3 upper bubble '传灵塔组织还在，可我们魂兽……'");
    let b3 = b3.unwrap();
    assert_eq!(b3.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b3, RegionKind::DialogueBubble, 635, 998, 147, 98, 20);

    // 6. PANEL 3 RIGHT LOWER BUBBLE: '就要从这个世界上灭绝了吗……'
    let b4 = res.regions.iter().find(|r| r.text.contains("灭绝") || r.text.contains("世界上"));
    assert!(b4.is_some(), "Must detect panel 3 lower bubble '就要从这个世界上灭绝了吗……'");
    let b4 = b4.unwrap();
    assert_eq!(b4.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b4, RegionKind::DialogueBubble, 714, 1130, 122, 88, 20);

    // 7. NEGATIVE GUARD: NO PHANTOM FREETEXT DUPLICATE '雪\n传灵塔组织还'
    assert!(
        !res.regions.iter().any(|r| r.kind == RegionKind::FreeText && (r.text.contains("传灵塔") || r.text.contains("雪"))),
        "Must NOT duplicate speech bubble into phantom FreeText region on artwork"
    );
}
