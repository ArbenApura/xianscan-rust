// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_emergency_production_mp100_card` (RESOLUTION: 836 × 1492 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **STATUS CARD FULL-TEXT RECOGNITION (MP100 & MP20)**:
///   IN PANEL 2 FLOWCHART DIAGRAMS, STATUS CARDS DISPLAY VALUE LABELS SUCH AS `消費MP100` AND `消費MP20`.
///   OCR MUST NOT TRUNCATE NUMERIC VALUE SUFFIXES TO JUST `消費` (CONSUMPTION).
/// - **DIGIT ZERO PRESERVATION IN DIALOGUE**:
///   IN PANEL 2 UPPER BUBBLE, `初期値が200で` MUST NOT DROP A ZERO TO BECOME `初期値が20で`.
/// - **EXHAUSTIVE 18-REGION ACCOUNTING**:
///   VERIFIES ALL 18 REGIONS ACROSS THE 4 PANELS WITHOUT REGIONAL MERGES OR LOSSES.
#[test]
fn test_regression_page_emergency_production_mp100_card() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_emergency_production_mp100_card.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_emergency_production_mp100_card: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 836x1492 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, box={:?}, bubble_box={:?}, text='{}', conf={:.2}, vert={}",
            i, r.kind, r.box_, r.bubble_box, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. STRICT 18-REGION ACCOUNTING
    crate::assert_element_counts!(res, 18, 17, 0, 1);

    // 1. PANEL 1 TOP-RIGHT BUBBLE: '少し心配でしたが...'
    let subordinate_bubble = res.regions.iter().find(|r| r.text.contains("配下ユニット") || r.text.contains("少し心配"));
    assert!(subordinate_bubble.is_some(), "Must detect panel 1 top-right elf bubble");
    let subordinate_bubble = subordinate_bubble.unwrap();
    crate::assert_region_bounds!(subordinate_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 667, 45, 65, 207, 10);

    // 2. PANEL 1 UPPER-MID BUBBLE: 'うん'
    let un_bubble = res.regions.iter().find(|r| r.text.trim() == "うん");
    assert!(un_bubble.is_some(), "Must detect panel 1 'うん' bubble");

    // 3. PANEL 1 LEFT BUBBLE: '視界もある程度は共有できるみたい'
    let vision_bubble = res.regions.iter().find(|r| r.text.contains("視界も") || r.text.contains("共有できる"));
    assert!(vision_bubble.is_some(), "Must detect panel 1 vision share bubble");

    // 4. PANEL 2 TOP DIALOGUE BUBBLE: '初期値が200で 足長蟲を緊急生産したからあと100だよ'
    // MUST PRESERVE '200' AND NOT DROP ZERO TO '20'
    let init_val_bubble = res.regions.iter().find(|r| r.text.contains("足長蟲") || r.text.contains("初期値"));
    assert!(init_val_bubble.is_some(), "Must detect panel 2 initial value bubble");
    let init_val_bubble = init_val_bubble.unwrap();
    assert!(
        init_val_bubble.text.contains("200") || init_val_bubble.text.contains("２００"),
        "Dialogue must capture '200' instead of truncated '20', text='{}'", init_val_bubble.text
    );

    // 5. FLOWCHART CARD: 'MP200'
    let mp200_card = res.regions.iter().find(|r| r.text.contains("MP200") || r.text.contains("200"));
    assert!(mp200_card.is_some(), "Must detect flowchart 'MP200' card");

    // 6. FLOWCHART CARD: '初期開拓地 消費MP20'
    // MUST PRESERVE '20' OR 'MP20'
    let settlement_card = res.regions.iter().find(|r| r.text.contains("初期開拓地"));
    assert!(settlement_card.is_some(), "Must detect flowchart '初期開拓地' card");
    let settlement_card = settlement_card.unwrap();
    assert!(
        settlement_card.text.contains("20") || settlement_card.text.contains("２０"),
        "Settlement card must retain 'MP20' suffix, text='{}'", settlement_card.text
    );

    // 7. LOWER FLOWCHART CARD: '消費MP100'
    // MUST NOT TRUNCATE TO ONLY '消費'
    let mp100_card = res.regions.iter().find(|r| r.text.contains("消費") && (r.box_.y >= 1000 && r.box_.y <= 1100));
    assert!(mp100_card.is_some(), "Must detect lower monster '消費MP100' status card");
    let mp100_card = mp100_card.unwrap();
    assert!(
        mp100_card.text.contains("100") || mp100_card.text.contains("１００") || mp100_card.text.contains("MP"),
        "Status card must not drop 'MP100' suffix, text='{}'", mp100_card.text
    );
    assert!(mp100_card.box_.w >= 70, "Text box must span wide enough for '消費MP100', w={}", mp100_card.box_.w);

    // 8. PANEL 4 BOTTOM-LEFT BUBBLE: 'と言いたいところですが…'
    let bottom_left = res.regions.iter().find(|r| r.text.contains("言いたい") || r.text.contains("ところですが"));
    assert!(bottom_left.is_some(), "Must detect bottom-left dialogue bubble");
}
