// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_hospital_reception_wall_sign` (RESOLUTION: 690 × 1735)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL TOP DIALOGUE BUBBLE**: `"주의사항 꼭 지키시고,\n설명서대로 약 드시고\n오시면 됩니다~"` (Receptionist)
/// - **PANEL BOTTOM DIALOGUE BUBBLE**: `"아, 네..!"` / `"아,네!"` (Standing patient in suit)
/// - **BACKGROUND SIGNAGE & MONITOR NOISE SUPPRESSION**:
///   - Wall text behind characters (`"국병원료센터 / MINNCAL CEN"`) occluded across characters must NOT be merged into a giant spanning box.
///   - Top-right sliced screen text (`"영상"` / `"VIDEO"`) must be suppressed.
/// - **EXACT COUNTS**: Exactly 2 dialogue bubbles (2 bubbles, 0 SFX, 0 free text).
#[test]
fn test_regression_page_hospital_reception_wall_sign() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_hospital_reception_wall_sign/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_hospital_reception_wall_sign: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Hospital Reception Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 2 REGIONS (2 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 0 FREETEXT)
    crate::assert_element_counts!(res, 2, 2, 0, 0);

    // 2. TOP SPEECH BUBBLE (RECEPTIONIST): [X: 63, Y: 498, W: 368, H: 142]
    let top_bubble = res
        .regions
        .iter()
        .find(|r| r.text.contains("주의사항") && r.text.contains("약 드시고"));
    assert!(top_bubble.is_some(), "Must detect top dialogue bubble '주의사항 꼭 지키시고...'");
    let top_bubble = top_bubble.unwrap();
    crate::assert_region_bounds!(
        top_bubble,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        63,
        498,
        368,
        142,
        15
    );
    crate::assert_bubble_bounds!(top_bubble, 45, 455, 407, 258, 15);
    crate::assert_region_angle!(top_bubble, 0.0, 1.5);

    // 3. BOTTOM SPEECH BUBBLE (PATIENT): [X: 446, Y: 950, W: 146, H: 50]
    let bot_bubble = res.regions.iter().find(|r| r.text.contains("아") && (r.text.contains("네") || r.text.contains("!")));
    assert!(bot_bubble.is_some(), "Must detect bottom dialogue bubble '아, 네..!'");
    let bot_bubble = bot_bubble.unwrap();
    crate::assert_region_bounds!(
        bot_bubble,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        446,
        950,
        146,
        50,
        15
    );
    crate::assert_bubble_bounds!(bot_bubble, 436, 901, 171, 133, 15);
    crate::assert_region_angle!(bot_bubble, 0.0, 1.5);

    // 4. EXPLICIT NEGATIVE CHECKS AGAINST BACKGROUND WALL SIGNAGE AND MONITOR FRAGMENTS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("국병원") || r.text.contains("MINNCAL") || r.text.contains("CEN")),
        "Background wall signage must not be extracted as spanning text"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "영상" || r.text.trim() == "VIDEO"),
        "Top-right sliced monitor text must not be extracted"
    );
}
