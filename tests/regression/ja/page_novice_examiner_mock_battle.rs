// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_novice_examiner_mock_battle/page.webp` (RESOLUTION: 960 × 1905 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **FURIGANA SLIVER PRUNING (`かのうせい`)**:
///   GUARANTEES THAT ISOLATED VERTICAL RUBY READINGS (E.G., `かのうせい` ALONGSIDE `可能性`)
///   ARE NOT SPURIOUSLY DETECTED OR RESCUED AS SEPARATE OVERLAPPING GHOST BOXES.
/// - **SLANTED STAT CARD ROTATION SNAP (`-19.16°`)**:
///   ENSURES THE SLANTED EXAM CRITERIA CARD (`「試験官」(剣士)との1対1での模擬戦に勝利する`)
///   IS EXTRACTED AS FREE TEXT WITH PROPER ORIENTATION ANGLE.
/// - **STRICT 8-REGION ACCOUNTING**:
///   EXACTLY 8 VALID DIALOGUE & NARRATION REGIONS TOTAL ACROSS ALL PANELS.
#[test]
fn test_regression_page_novice_examiner_mock_battle() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_novice_examiner_mock_battle/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_novice_examiner_mock_battle: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 960x1905 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}, angle={:.1}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical, r.angle);
    }

    // 0. NEGATIVE GUARDS AGAINST ISOLATED GHOST FURIGANA SLIVER
    assert!(
        !res.regions.iter().any(|r| {
            let t = r.text.trim();
            t == "かのうせい" || t == "かのう" || t == "せい"
        }),
        "Must eliminate isolated furigana slivers ('かのうせい')"
    );

    // 1. TOP-RIGHT NARRATION BOX: '俺に唯一可能性があるとすれば'
    let top_right = res.regions.iter().find(|r| r.text.contains("唯一") || r.text.contains("可能性") || r.text.contains("あるとすれば"));
    assert!(top_right.is_some(), "Must detect top-right narration '俺に唯一可能性があるとすれば'");
    let top_right = top_right.unwrap();
    crate::assert_region_bounds!(top_right, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 608, 35, 79, 234, 15);

    // 2. TOP-LEFT SLANTED STAT CARD: '「試験官」(剣士)\nとの1対1での\n模擬戦に勝利する'
    let stat_card = res.regions.iter().find(|r| r.text.contains("試験官") || r.text.contains("模擬戦") || r.text.contains("1対1"));
    assert!(stat_card.is_some(), "Must detect top-left slanted stat card '「試験官」(剣士)との1対1での模擬戦に勝利する'");
    let stat_card = stat_card.unwrap();
    crate::assert_region_bounds!(stat_card, xianscan_rust::ml::schemas::RegionKind::FreeText, 203, 104, 281, 203, 15);
    crate::assert_region_angle!(stat_card, -19.16, 3.0);

    // 3. TOP-LEFT LOWER STEP NARRATION: 'このひとつ\nのみだな'
    let step_narration = res.regions.iter().find(|r| r.text.contains("このひとつ") || r.text.contains("のみだな"));
    assert!(step_narration.is_some(), "Must detect top-left lower step narration 'このひとつ のみだな'");
    let step_narration = step_narration.unwrap();
    crate::assert_region_bounds!(step_narration, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 108, 340, 80, 141, 15);

    // 4. PANEL 2 UPPER RIGHT BUBBLE: 'それでは'
    let soredeha = res.regions.iter().find(|r| r.text.contains("それでは") || r.text.contains("それ"));
    assert!(soredeha.is_some(), "Must detect bubble 'それでは'");
    let soredeha = soredeha.unwrap();
    crate::assert_region_bounds!(soredeha, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 814, 607, 100, 172, 15);

    // 5. PANEL 2 LOWER LEFT BUBBLE: 'ノービスだ'
    let novice = res.regions.iter().find(|r| r.text.contains("ノービス") || r.text.contains("ノービスだ"));
    assert!(novice.is_some(), "Must detect bubble 'ノービスだ'");
    let novice = novice.unwrap();
    crate::assert_region_bounds!(novice, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 140, 873, 86, 165, 15);

    // 6. BOTTOM RIGHT BUBBLE: '職業は\nなんですか？'
    let job_bubble = res.regions.iter().find(|r| r.text.contains("職業は") || r.text.contains("なんですか"));
    assert!(job_bubble.is_some(), "Must detect bottom right bubble '職業は なんですか？'");
    let job_bubble = job_bubble.unwrap();
    crate::assert_region_bounds!(job_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 633, 1429, 194, 265, 15);

    // 7. BOTTOM CENTER-RIGHT BUBBLE: '…わかりました'
    let understood = res.regions.iter().find(|r| r.text.contains("わかりました"));
    assert!(understood.is_some(), "Must detect bubble '…わかりました'");
    let understood = understood.unwrap();
    crate::assert_region_bounds!(understood, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 373, 1448, 48, 195, 15);

    // 8. BOTTOM LEFT BUBBLE: '試験に落ちても\n受験料は戻りませんが\nそれでもいいですね？'
    let exam_fee = res.regions.iter().find(|r| r.text.contains("受験料") || r.text.contains("試験に落ちても") || r.text.contains("戻りません"));
    assert!(exam_fee.is_some(), "Must detect bottom left bubble '試験に落ちても 受験料は戻りませんが それでもいいですね？'");
    let exam_fee = exam_fee.unwrap();
    crate::assert_region_bounds!(exam_fee, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 184, 1535, 142, 271, 15);

    // 9. STRICT STRUCTURAL ELEMENT COUNTS (7 DIALOGUE BUBBLES, 0 SFX, 1 FREE TEXT)
    crate::assert_element_counts!(res, 8, 7, 0, 1);
}