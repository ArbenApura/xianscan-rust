// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_winner_life_tokyo_univ` (RESOLUTION: 1129 × 1600 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **ZERO DUPLICATE OVERLAPPING SUB-BOXES (`馬鹿で`)**:
///   PREVENTS DUPLICATE SUB-BOX EMISSION ON LARGE STYLIZED VERTICAL JAPANESE TEXT WITH FURIGANA.
///   ENSURES ONLY ONE CLEAN `馬鹿で` REGION IS PRODUCED, NOT DUPLICATED INTO `馬で` AND `馬鹿で`.
/// - **CLEAN MULTI-COLUMN JAPANESE NARRATION UNIFICATION (`僕は東大に行けるし...`)**:
///   GUARANTEES THAT 3-COLUMN VERTICAL FREE TEXT IN THE BOTTOM-LEFT PANEL IS PROPERLY UNIFIED WITHOUT
///   SPAWNING A DUPLICATE 1-COLUMN BOX (`勝ち組の人生を送るだろう`) AND WITHOUT WINDOW GRID NOISE.
/// - **READING ORDER AND STRUCTURAL COUNT ENFORCEMENT**:
///   EXACTLY 4 FREE-TEXT REGIONS TOTAL ACROSS TOP AND BOTTOM PANELS.
#[test]
fn test_regression_page_winner_life_tokyo_univ() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_winner_life_tokyo_univ/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_winner_life_tokyo_univ: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 1129x1600 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. STRICT 4-REGION ACCOUNTING (0 DIALOGUEBUBBLES, 0 SOUNDEFFECTS, 4 FREETEXT)
    crate::assert_element_counts!(res, 4, 0, 0, 4);

    // 1. TOP-RIGHT FREE TEXT: '馬鹿で'
    // TEXT BOUNDS APPROX: [X: 725..735, Y: 40..55, W: 190..230, H: 350..390]
    let baka_text = res.regions.iter().find(|r| r.text.contains("馬鹿") || r.text.contains("馬で"));
    assert!(baka_text.is_some(), "Must detect top-right free text '馬鹿で'");
    let baka_text = baka_text.unwrap();
    assert!(baka_text.text.contains("馬鹿で") || baka_text.text.contains("馬鹿"), "Text must contain 馬鹿: got '{}'", baka_text.text);
    crate::assert_region_bounds!(baka_text, xianscan_rust::ml::schemas::RegionKind::FreeText, 737, 55, 173, 358, 15);

    // 2. TOP-LEFT FREE TEXT: 'いてくれて'
    // TEXT BOUNDS APPROX: [X: 166, Y: 45, W: 165, H: 590]
    let itekurete_text = res.regions.iter().find(|r| r.text.contains("いてくれて") || r.text.contains("いて"));
    assert!(itekurete_text.is_some(), "Must detect top-left free text 'いてくれて'");
    let itekurete_text = itekurete_text.unwrap();
    assert!(itekurete_text.text.contains("いてくれて"), "Text must contain いてくれて: got '{}'", itekurete_text.text);
    crate::assert_region_bounds!(itekurete_text, xianscan_rust::ml::schemas::RegionKind::FreeText, 166, 45, 165, 590, 15);

    // 3. BOTTOM-RIGHT FREE TEXT: '皆がこの程度の\nペーパーテストも\nできないおかげで'
    // TEXT BOUNDS APPROX: [X: 808, Y: 1130, W: 201, H: 390]
    let exam_text = res.regions.iter().find(|r| r.text.contains("ペーパーテスト") || r.text.contains("できないおかげで"));
    assert!(exam_text.is_some(), "Must detect bottom-right free text 'ペーパーテストも...'");
    let exam_text = exam_text.unwrap();
    assert!(exam_text.text.contains("ペーパーテスト"), "Text must contain ペーパーテスト: got '{}'", exam_text.text);
    crate::assert_region_bounds!(exam_text, xianscan_rust::ml::schemas::RegionKind::FreeText, 808, 1130, 201, 390, 15);

    // 4. BOTTOM-LEFT FREE TEXT: '僕は東大に行けるし\nいい企業に勤め\n勝ち組の人生を送るだろう'
    // TEXT BOUNDS APPROX: [X: 98, Y: 921, W: 185, H: 579]
    let tokyo_univ_text = res.regions.iter().find(|r| r.text.contains("東大") || r.text.contains("勝ち組"));
    assert!(tokyo_univ_text.is_some(), "Must detect bottom-left free text '僕は東大に行けるし...'");
    let tokyo_univ_text = tokyo_univ_text.unwrap();
    assert!(tokyo_univ_text.text.contains("東大") && tokyo_univ_text.text.contains("勝ち組"), "Text must contain 東大 and 勝ち組: got '{}'", tokyo_univ_text.text);
    crate::assert_region_bounds!(tokyo_univ_text, xianscan_rust::ml::schemas::RegionKind::FreeText, 98, 921, 185, 579, 15);

    // 5. EXPLICIT NEGATIVE CHECKS: NO DUPLICATE SPLITS OR WINDOW GRID NOISE
    assert!(!res.regions.iter().any(|r| r.text.contains("年年出") || r.text.contains("电用用")), "Must not detect window grid noise");
    // Ensure no duplicate '勝ち組の人生を送るだろう' region exists separately
    let kachigumi_regions: Vec<_> = res.regions.iter().filter(|r| r.text.contains("勝ち組")).collect();
    assert_eq!(kachigumi_regions.len(), 1, "Must have exactly 1 region containing '勝ち組', but got {}", kachigumi_regions.len());
}
