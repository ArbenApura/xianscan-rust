// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

#[test]
fn test_regression_page_marry_me_favorability_hologram_leading_bracket() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_marry_me_favorability_hologram_leading_bracket") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("Detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 3 REGIONS (2 DIALOGUE BUBBLES, 0 SFX, 1 FREE TEXT STATUS CARD)
    crate::assert_element_counts!(res, 3, 2, 0, 1);

    // 2. TOP BUBBLE: "那要不你以身相许吧?"
    let r0 = res.regions.iter().find(|r| r.text.contains("以身") || r.text.contains("相许"));
    assert!(r0.is_some(), "Must detect top bubble '那要不你以身相许吧?'");
    assert_eq!(r0.unwrap().kind, RegionKind::DialogueBubble);

    // 3. MIDDLE HOLOGRAPHIC STATUS CARD: "好感度+10%" x2
    let r1 = res.regions.iter().find(|r| r.text.contains("好感度+10%"));
    assert!(r1.is_some(), "Must detect holographic status card '好感度+10%'");
    let r1 = r1.unwrap();
    assert_eq!(r1.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(r1, RegionKind::FreeText, 141, 672, 272, 127, 20);

    // 4. BOTTOM BUBBLE: "讨厌，你说什么胡话呢！坏蛋！" (MUST NOT HAVE LEADING '>' OR '<' BRACKETS)
    let r2 = res.regions.iter().find(|r| r.text.contains("讨厌") || r.text.contains("坏蛋"));
    assert!(r2.is_some(), "Must detect bottom dialogue bubble '讨厌，你说什么胡话呢！坏蛋！'");
    let r2 = r2.unwrap();
    assert_eq!(r2.kind, RegionKind::DialogueBubble);
    assert!(!r2.text.starts_with('>') && !r2.text.starts_with('<'), "Dialogue must not start with hallucinated tail bracket '>'");
    crate::assert_region_bounds!(r2, RegionKind::DialogueBubble, 508, 1323, 251, 86, 20);
}
