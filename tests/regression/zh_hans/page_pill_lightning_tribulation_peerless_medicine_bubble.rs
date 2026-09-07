use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_pill_lightning_tribulation_peerless_medicine_bubble` (RESOLUTION: 900 × 1276)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - Verifies speech bubble and dialogue detection for pill lightning tribulation spiky balloon.
#[test]
fn test_regression_page_pill_lightning_tribulation_peerless_medicine_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_pill_lightning_tribulation_peerless_medicine_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_pill_lightning_tribulation_peerless_medicine_bubble, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Pill Lightning Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, box={:?}, bubble_box={:?}, text='{}', conf={:.2}", i, r.kind, r.box_, r.bubble_box, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. MUST DETECT PANEL 1 SPEECH BUBBLE '不，这只是开始!'
    let p1_bubble = res.regions.iter().find(|r| r.text.contains("不") && r.text.contains("开始"));
    assert!(p1_bubble.is_some(), "Must detect panel 1 '不，这只是开始!'");
    let p1 = p1_bubble.unwrap();
    assert_eq!(p1.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(p1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 113, 106, 152, 102, 8);
    crate::assert_bubble_bounds!(p1, 78, 73, 245, 168, 8);

    // 2. MUST UNIFY ALL 4 LINES OF THE SPIKY MEDICINE BUBBLE INTO ONE SINGLE REGION
    let pill_bubble = res.regions.iter().find(|r| r.text.contains("宝丹为天妒") && r.text.contains("绝世大药"));
    assert!(pill_bubble.is_some(), "Must detect 4-line spiky bubble '宝丹为天妒，必...绝世大药！'");
    let pill_bubble = pill_bubble.unwrap();
    assert_eq!(pill_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(pill_bubble.text.contains("有雷劫降世"), "Must contain middle line '有雷劫降世'");
    assert!(pill_bubble.text.contains("经雷劫洗礼"), "Must contain middle line '经雷劫洗礼'");
    crate::assert_region_bounds!(pill_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 274, 656, 215, 173, 8);
    crate::assert_bubble_bounds!(pill_bubble, 230, 609, 286, 247, 8);

    // 3. EXACT COUNTS: 2 REGIONS TOTAL (2 DIALOGUE BUBBLES, 0 SOUND EFFECT, 0 FREE-TEXT)
    crate::assert_element_counts!(res, 2, 2, 0, 0);

    // 4. NEGATIVE GUARD: MUST NOT DETECT BACKGROUND SFX '轰隆' AS REGION
    assert!(!res.regions.iter().any(|r| r.text.contains("轰隆")), "Must NOT detect '轰隆' sound effect as region");
}
