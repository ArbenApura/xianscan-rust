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
            "  Region r{}: kind={:?}, box={:?}, bubble={:?}, carrier={:?}, typeset={:?}, text='{}'",
            i,
            r.kind,
            r.box_,
            r.bubble_box,
            r.carrier_box,
            r.typeset_box,
            r.text.replace('\n', "\\n")
        );
    }

    // 1. EXACT ELEMENT COUNTS: 2 REGIONS (2 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 0 FREETEXT)
    crate::assert_element_counts!(res, 2, 2, 0, 0);

    // 2. TOP SPEECH BUBBLE [X: 168, Y: 355, W: 162, H: 106]
    let top_bubble = res.regions.iter().find(|r| r.text.contains("몸은") || r.text.contains("괜찮아요"));
    assert!(top_bubble.is_some(), "Must detect top speech bubble");
    let top_bubble = top_bubble.unwrap();
    assert_eq!(top_bubble.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(top_bubble, RegionKind::DialogueBubble, 168, 355, 162, 106, 15);

    let carrier0 = top_bubble.carrier_box.as_ref().expect("Region 0 must publish carrier box");
    assert!(carrier0.h >= 170 && carrier0.h <= 180, "Region 0 carrier height must preserve oval body, got {}", carrier0.h);
    let tb0 = top_bubble.typeset_box.as_ref().expect("Region 0 typeset box must exist");
    let c0_cx = carrier0.x + carrier0.w / 2;
    let c0_cy = carrier0.y + carrier0.h / 2;
    let tb0_cx = tb0.x + tb0.w / 2;
    let tb0_cy = tb0.y + tb0.h / 2;
    assert!((tb0_cx - c0_cx).abs() <= 2, "Region 0 typeset X must be centered in carrier, got tb_cx={}, c_cx={}", tb0_cx, c0_cx);
    assert!((tb0_cy - c0_cy).abs() <= 2, "Region 0 typeset Y must be centered in carrier, got tb_cy={}, c_cy={}", tb0_cy, c0_cy);

    // 3. BOTTOM SPEECH BUBBLE: '팀장님?!' [X: ~436, Y: ~1166, W: ~198, H: ~168]
    let team_leader_bubble = res.regions.iter().find(|r| r.text.contains("팀장님"));
    assert!(team_leader_bubble.is_some(), "Must detect bottom speech bubble '팀장님?!'");
    let team_leader_bubble = team_leader_bubble.unwrap();
    assert_eq!(team_leader_bubble.kind, RegionKind::DialogueBubble);
    assert!(!team_leader_bubble.text.to_uppercase().contains("HOSPITAL"), "Bubble text must not contain HOSPITAL pattern noise");
    assert!(!team_leader_bubble.text.to_uppercase().contains("OSPITAL"), "Bubble text must not contain OSPITAL pattern noise");

    let carrier1 = team_leader_bubble.carrier_box.as_ref().expect("Region 1 must publish carrier box");
    assert!(carrier1.y >= 1198 && carrier1.y <= 1206, "Region 1 carrier top must preserve oval apex, got {}", carrier1.y);
    assert!(carrier1.h >= 125 && carrier1.h <= 138, "Region 1 carrier height must match oval body, got {}", carrier1.h);
    let tb1 = team_leader_bubble.typeset_box.as_ref().expect("Region 1 typeset box must exist");
    let c1_cx = carrier1.x + carrier1.w / 2;
    let c1_cy = carrier1.y + carrier1.h / 2;
    let tb1_cx = tb1.x + tb1.w / 2;
    let tb1_cy = tb1.y + tb1.h / 2;
    assert!((tb1_cx - c1_cx).abs() <= 2, "Region 1 typeset X must be centered in carrier, got tb_cx={}, c_cx={}", tb1_cx, c1_cx);
    assert!((tb1_cy - c1_cy).abs() <= 2, "Region 1 typeset Y must be centered in carrier, got tb_cy={}, c_cy={}", tb1_cy, c1_cy);

    // 4. NEGATIVE GUARD: NO CLOTHING PATTERN NOISE REGIONS
    assert!(
        !res.regions.iter().any(|r| r.text.to_uppercase().contains("HOSPITAL") || r.text.to_uppercase().contains("OSPITAL")),
        "Must NOT produce any regions containing HOSPITAL/OSPITAL pattern text"
    );
}
