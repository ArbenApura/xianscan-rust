// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: page_novice_mage_status_card (RESOLUTION: 900 × 1704)
#[test]
fn test_regression_page_novice_mage_status_card() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_novice_mage_status_card/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_novice_mage_status_card: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Novice Mage Status Card Page detected {} regions:",
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 5 REGIONS (4 DIALOGUE BUBBLES, 0 SFX, 1 STATUS CARD FREE TEXT)
    crate::assert_element_counts!(res, 5, 4, 0, 1);

    // 2. PANEL 1 LEFT DIALOGUE BUBBLE: '真嚣张，你不知道我们会长是顶尖玩家吗？'
    let b1 = res
        .regions
        .iter()
        .find(|r| r.text.contains("真嚣张") || r.text.contains("会长是顶尖"));
    assert!(
        b1.is_some(),
        "Must detect panel 1 left bubble '真嚣张，你不知道我们会长是顶尖玩家吗？'"
    );
    let b1 = b1.unwrap();
    assert_eq!(b1.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b1, RegionKind::DialogueBubble, 111, 159, 198, 168, 20);

    // 3. PANEL 1 CENTER DIALOGUE BUBBLE: '我们会长可是一天就升到25级的人，你是脑子坏掉了吧！'
    let b2 = res
        .regions
        .iter()
        .find(|r| r.text.contains("25级") || r.text.contains("脑子坏"));
    assert!(
        b2.is_some(),
        "Must detect panel 1 center bubble '我们会长可是一天就升到25级的人，你是脑子坏掉了吧！'"
    );
    let b2 = b2.unwrap();
    assert_eq!(b2.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b2, RegionKind::DialogueBubble, 359, 175, 258, 164, 20);

    // 4. PANEL 1 RIGHT DIALOGUE BUBBLE: '你这是在作大死！'
    let b3 = res
        .regions
        .iter()
        .find(|r| r.text.contains("在作大") || r.text.contains("作大死"));
    assert!(
        b3.is_some(),
        "Must detect panel 1 right bubble '你这是在作大死！'"
    );
    let b3 = b3.unwrap();
    assert_eq!(b3.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b3, RegionKind::DialogueBubble, 639, 196, 123, 140, 20);

    // 5. PANEL 1 PROTAGONIST LOWER BUBBLE: '不是他自己说要PK嘛……'
    let b4 = res
        .regions
        .iter()
        .find(|r| r.text.contains("自己说要PK") || r.text.contains("要PK嘛"));
    assert!(
        b4.is_some(),
        "Must detect panel 1 protagonist bubble '不是他自己说要PK嘛……'"
    );
    let b4 = b4.unwrap();
    assert_eq!(b4.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b4, RegionKind::DialogueBubble, 154, 696, 228, 88, 20);

    // 6. PANEL 2 SLANTED RPG STATUS CARD:
    let card = res
        .regions
        .iter()
        .find(|r| r.text.contains("新手腰带") || r.text.contains("新手法师"));
    assert!(card.is_some(), "Must detect panel 2 slanted RPG status card");
    let card = card.unwrap();
    assert_eq!(card.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(card, RegionKind::FreeText, 118, 1079, 397, 465, 25);
    assert!(
        card.angle.abs() >= 8.0,
        "Status card must have slanted angle >= 8.0°, got {:.2}°",
        card.angle
    );

    // VERIFY CARD CONTENT CONTAINS FULL STATS AND EQUIPMENT
    assert!(
        card.text.contains("新手腰带")
            && card.text.contains("新手法师护手")
            && card.text.contains("新手法师靴"),
        "Status card must contain mid equipment items, got: {}",
        card.text
    );
    assert!(
        card.text.contains("新手法师袍"),
        "Status card must NOT drop top equipment item '新手法师袍', got: {}",
        card.text
    );
    assert!(
        card.text.contains("割肉小刀") || card.text.contains("残破"),
        "Status card must NOT drop trailing weapon '残破的割肉小刀', got: {}",
        card.text
    );
    assert!(
        card.text.contains("职业") || card.text.contains("法师"),
        "Status card must NOT drop header '职业: 法师', got: {}",
        card.text
    );

    // 7. NEGATIVE GUARDS: NO WATERMARK OR GHOST SLICES
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客栈")),
        "Must NOT detect gutter watermark '漫客栈'"
    );
}
