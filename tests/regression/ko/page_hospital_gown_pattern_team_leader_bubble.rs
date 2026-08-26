// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_hospital_gown_pattern_team_leader_bubble` (RESOLUTION: 690 × 1754)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP SPEECH BUBBLE**: `"몸은 좀\n괜찮아요?"` (Clean dialogue bubble)
/// - **BOTTOM SPEECH BUBBLE**: `"팀장님?!"` (Clean dialogue bubble inside speech balloon)
/// - **NEGATIVE GUARD**: Must NOT extract repeating `"HOSPITAL"` / `"OSPITAL"` clothing pattern noise or merge it with `"팀장님?!"`.
#[test]
fn test_regression_page_hospital_gown_pattern_team_leader_bubble() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_hospital_gown_pattern_team_leader_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_hospital_gown_pattern_team_leader_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Hospital Gown Pattern Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: 2 REGIONS (2 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 0 FREETEXT)
    crate::assert_element_counts!(res, 2, 2, 0, 0);

    // 2. TOP SPEECH BUBBLE [X: ~173, Y: ~362, W: ~153, H: ~92]
    let top_bubble = res.regions.iter().find(|r| r.text.contains("몸은") || r.text.contains("괜찮아요"));
    assert!(top_bubble.is_some(), "Must detect top speech bubble");
    let top_bubble = top_bubble.unwrap();
    assert_eq!(top_bubble.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(top_bubble, RegionKind::DialogueBubble, 173, 362, 153, 92, 15);

    // 3. BOTTOM SPEECH BUBBLE: '팀장님?!' [X: ~436, Y: ~1166, W: ~198, H: ~168]
    let team_leader_bubble = res.regions.iter().find(|r| r.text.contains("팀장님"));
    assert!(team_leader_bubble.is_some(), "Must detect bottom speech bubble '팀장님?!'");
    let team_leader_bubble = team_leader_bubble.unwrap();
    assert_eq!(team_leader_bubble.kind, RegionKind::DialogueBubble);
    assert!(!team_leader_bubble.text.to_uppercase().contains("HOSPITAL"), "Bubble text must not contain HOSPITAL pattern noise");
    assert!(!team_leader_bubble.text.to_uppercase().contains("OSPITAL"), "Bubble text must not contain OSPITAL pattern noise");

    // 4. NEGATIVE GUARD: NO CLOTHING PATTERN NOISE REGIONS
    assert!(
        !res.regions.iter().any(|r| r.text.to_uppercase().contains("HOSPITAL") || r.text.to_uppercase().contains("OSPITAL")),
        "Must NOT produce any regions containing HOSPITAL/OSPITAL pattern text"
    );
}
