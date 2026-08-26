// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_red_dragon_destia_floor_48` (RESOLUTION: 690 × 1062)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL TOP RPG SYSTEM POPUP CARD**:
///   `"48층\n<레드 드래곤 데스티아>의 영역에\n도전자가 등장했습니다."` (Full 3-line notification block)
/// - **PANEL BOTTOM RPG CHAT / NARRATION CARD**:
///   `"[클라이머123] :\n아직 도전하는 사람이 있어!"` (Full 2-line chat utterance)
/// - **EXACT COUNTS**: Exactly 2 regions (0 bubbles, 0 SFX, 2 free text).
#[test]
fn test_regression_page_red_dragon_destia_floor_48() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_red_dragon_destia_floor_48/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_red_dragon_destia_floor_48: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Red Dragon Destia Floor 48 Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 2 REGIONS (0 DIALOGUEBUBBLE, 0 SOUNDEFFECT, 2 FREETEXT)
    crate::assert_element_counts!(res, 2, 0, 0, 2);

    // 2. TOP SYSTEM POPUP CARD: [X: ~120..310, Y: ~210..220, W: ~450..470, H: ~110..120]
    // Must contain all 3 lines: "48층", "<레드 드래곤 데스티아>의 영역에", "도전자가 등장했습니다."
    let top_card = res
        .regions
        .iter()
        .find(|r| r.text.contains("48층") || r.text.contains("데스티아") || r.text.contains("도전자"));
    assert!(top_card.is_some(), "Must detect top system notification card");
    let top_card = top_card.unwrap();
    assert!(
        top_card.text.contains("48층"),
        "Top system card must include header '48층', got: {:?}",
        top_card.text
    );
    assert!(
        top_card.text.contains("드래곤") || top_card.text.contains("데스티아"),
        "Top system card must include main text line '<레드 드래곤 데스티아>의 영역에', got: {:?}",
        top_card.text
    );
    assert!(
        top_card.text.contains("도전자") || top_card.text.contains("등장"),
        "Top system card must include trailing line '도전자가 등장했습니다.', got: {:?}",
        top_card.text
    );
    crate::assert_region_bounds!(
        top_card,
        xianscan_rust::ml::schemas::RegionKind::FreeText,
        119,
        217,
        457,
        127,
        15
    );
    crate::assert_region_angle!(top_card, 0.0, 1.5);

    // 3. BOTTOM CHAT CARD: [X: 152, Y: 781, W: 332, H: 75]
    // Must contain "[클라이머123]" and "아직 도전하는 사람이 있어!"
    let bot_card = res
        .regions
        .iter()
        .find(|r| r.text.contains("클라이머") || r.text.contains("도전하는 사람"));
    assert!(bot_card.is_some(), "Must detect bottom chat notification card");
    let bot_card = bot_card.unwrap();
    assert!(
        bot_card.text.contains("클라이머"),
        "Bottom card must include '[클라이머123]', got: {:?}",
        bot_card.text
    );
    assert!(
        bot_card.text.contains("사람이 있어"),
        "Bottom card must include '아직 도전하는 사람이 있어!', got: {:?}",
        bot_card.text
    );
    crate::assert_region_bounds!(
        bot_card,
        xianscan_rust::ml::schemas::RegionKind::FreeText,
        152,
        781,
        332,
        75,
        15
    );
}
