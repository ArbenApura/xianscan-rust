// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_longevity_list_slanted_cards` (RESOLUTION: 900 × 849)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP-LEFT SLANTED CARD**:
///   `"萧宏\n长生榜第七，"` (FreeText, tilted clockwise ~26°).
/// - **TOP-RIGHT SLANTED CARD**:
///   `"君傲城\n长生榜第二，"` (FreeText, tilted ~-30° to 30°, must not garble into "司\n-一1大").
/// - **MID-RIGHT SLANTED CARD**:
///   `"顾笑衣\n长生榜第五，"` (FreeText, tilted ~-30° to 30°, must not be dropped/missed).
/// - **BOTTOM RIGHT DIALOGUE BUBBLE**:
///   `"长生榜的天骄们\n也去迎接了！"` (DialogueBubble).
/// - **EXPLICIT NEGATIVE GUARDS**:
///   - MUST NOT HALLUCINATE "司\n-一1大" OR NUMERIC NOISE FROM ROTATED CHARACTERS.
///   - MUST NOT DETECT THE BOTTOM GUTTER WATERMARK "COLAMANGA" / "ACLOUDMERGE".
/// - **EXACT COUNTS**: EXACTLY 4 REGIONS TOTAL (1 DIALOGUE BUBBLE, 0 SFX, 3 FREE TEXT).
#[test]
fn test_regression_page_longevity_list_slanted_cards() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_longevity_list_slanted_cards/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_longevity_list_slanted_cards: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!("Longevity List Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 4 REGIONS (1 DIALOGUE BUBBLE, 0 SFX, 3 FREE TEXT)
    crate::assert_element_counts!(res, 4, 1, 0, 3);

    // 2. BOTTOM RIGHT DIALOGUE BUBBLE: '长生榜的天骄们\n也去迎接了！'
    let bubble = res.regions.iter().find(|r| r.kind == RegionKind::DialogueBubble && r.text.contains("长生榜的天骄"));
    assert!(bubble.is_some(), "Must detect bottom right dialogue bubble '长生榜的天骄们也去迎接了！'");
    let bubble = bubble.unwrap();
    assert!(
        bubble.text.contains("长生榜的天骄") && (bubble.text.contains("迎接") || bubble.text.contains("也去")),
        "Dialogue bubble must contain full speech '长生榜的天骄们也去迎接了！', got '{}'",
        bubble.text
    );
    crate::assert_region_bounds!(bubble, RegionKind::DialogueBubble, 588, 697, 170, 70, 8);

    // 3. TOP-LEFT SLANTED CARD: '萧宏 / 长生榜第七，'
    let card_xiao = res.regions.iter().find(|r| r.text.contains("萧宏") || (r.text.contains("长生榜") && r.text.contains("七")));
    assert!(card_xiao.is_some(), "Must detect top-left character card '萧宏 / 长生榜第七，'");
    let card_xiao = card_xiao.unwrap();
    assert_eq!(card_xiao.kind, RegionKind::FreeText);
    assert!(card_xiao.text.contains("萧宏") && card_xiao.text.contains("长生榜第七"), "Top-left card must contain full intro, got '{}'", card_xiao.text);
    crate::assert_region_bounds!(card_xiao, RegionKind::FreeText, 145, 24, 92, 146, 8);
    crate::assert_region_angle!(card_xiao, 26.08, 2.0);

    // 4. TOP-RIGHT SLANTED CARD: '君傲城 / 长生榜第二，'
    let card_jun = res.regions.iter().find(|r| r.text.contains("君傲城") || (r.text.contains("长生榜") && r.text.contains("二")));
    assert!(card_jun.is_some(), "Must detect top-right character card '君傲城 / 长生榜第二，'");
    let card_jun = card_jun.unwrap();
    assert_eq!(card_jun.kind, RegionKind::FreeText);
    assert!(card_jun.text.contains("君傲城") && card_jun.text.contains("长生榜第二"), "Top-right card must contain full intro, got '{}'", card_jun.text);
    crate::assert_region_bounds!(card_jun, RegionKind::FreeText, 688, 49, 100, 142, 8);
    crate::assert_region_angle!(card_jun, 34.88, 2.0);

    // 5. MID-RIGHT SLANTED CARD: '顾笑衣 / 长生榜第五，'
    let card_gu = res.regions.iter().find(|r| r.text.contains("顾笑衣") || (r.text.contains("长生榜") && r.text.contains("五")));
    assert!(card_gu.is_some(), "Must detect mid-right character card '顾笑衣 / 长生榜第五，'");
    let card_gu = card_gu.unwrap();
    assert_eq!(card_gu.kind, RegionKind::FreeText);
    assert!(card_gu.text.contains("顾笑衣") && card_gu.text.contains("长生榜第五"), "Mid-right card must contain full intro, got '{}'", card_gu.text);
    crate::assert_region_bounds!(card_gu, RegionKind::FreeText, 783, 403, 97, 139, 8);
    crate::assert_region_angle!(card_gu, 34.72, 2.0);

    // 6. EXPLICIT NEGATIVE GUARDS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("一1大") || r.text.contains("-一1")),
        "Must NOT hallucinate garbled OCR text '司 -一1大'"
    );
    assert!(
        !res.regions.iter().any(|r| {
            let lower = r.text.to_lowercase();
            lower.contains("colamanga") || lower.contains("acloudmerge")
        }),
        "Must NOT detect bottom gutter watermark"
    );
}
