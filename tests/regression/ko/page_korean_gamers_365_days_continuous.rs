// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_korean_gamers_365_days_continuous` (RESOLUTION: 690 × 2199)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL TOP STEP-NARRATION CARDS**:
///   1. Upper step card: `"게임이 출시된 후,\n제작자를 농락하는 게 취미인\n한국의 고인물들이"`
///   2. Lower step card: `"이 게임을\n정복하기 위해\n달라붙었다."`
/// - **PANEL BOTTOM NARRATION CARD**:
///   3. Single unified 3-line card: `"먹는 것도 자는 것도\n포기한 채\n1년 365일 계속."` (No duplicate line)
/// - **EXACT COUNTS**: Exactly 3 regions (or 2 if top step cards are unified).
#[test]
fn test_regression_page_korean_gamers_365_days_continuous() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_korean_gamers_365_days_continuous/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_korean_gamers_365_days_continuous: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Gamers 365 Days Continuous Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 3 REGIONS (3 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 0 FREETEXT)
    crate::assert_element_counts!(res, 3, 3, 0, 0);

    // 2. UPPER TOP STEP CARD: [X: ~107, Y: ~377, W: ~345, H: ~113]
    let top_card_1 = res.regions.iter().find(|r| r.text.contains("게임이") && r.text.contains("고인물"));
    assert!(top_card_1.is_some(), "Must detect upper top step card");
    let top_card_1 = top_card_1.unwrap();
    crate::assert_region_bounds!(
        top_card_1,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        107,
        377,
        345,
        113,
        15
    );
    crate::assert_region_angle!(top_card_1, 0.0, 1.5);

    // 3. LOWER TOP STEP CARD: [X: ~329, Y: ~550, W: ~204, H: ~117]
    let top_card_2 = res.regions.iter().find(|r| r.text.contains("정복하기") || r.text.contains("달라붙"));
    assert!(top_card_2.is_some(), "Must detect lower top step card");
    let top_card_2 = top_card_2.unwrap();
    crate::assert_region_bounds!(
        top_card_2,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        329,
        550,
        204,
        117,
        15
    );
    crate::assert_region_angle!(top_card_2, 0.0, 1.5);

    // 4. BOTTOM CARD VERIFICATION: MUST NOT CONTAIN DUPLICATE "1년 365일" LINES
    let bot_card = res.regions.iter().find(|r| r.text.contains("먹는") || r.text.contains("365일"));
    assert!(bot_card.is_some(), "Must detect bottom narration card");
    let bot_card = bot_card.unwrap();

    let occurrences = bot_card.text.matches("365일").count();
    assert_eq!(
        occurrences, 1,
        "Bottom card must contain exactly 1 occurrence of '365일' without duplicates, got: {:?}",
        bot_card.text
    );

    let lines: Vec<&str> = bot_card.text.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    assert_eq!(
        lines.len(), 3,
        "Bottom card must contain exactly 3 lines, got {}: {:?}",
        lines.len(),
        lines
    );
    crate::assert_region_bounds!(
        bot_card,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        216,
        1822,
        256,
        136,
        15
    );
    crate::assert_region_angle!(bot_card, 0.0, 1.5);
}
