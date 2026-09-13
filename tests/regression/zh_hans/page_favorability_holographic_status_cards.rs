// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

#[test]
fn test_regression_page_favorability_holographic_status_cards() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_favorability_holographic_status_cards") {
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

    // 1. EXACT ELEMENT COUNTS: 6 REGIONS (2 DIALOGUE BUBBLES, 0 SFX, 4 FREE TEXT STATUS CARDS/LABELS)
    crate::assert_element_counts!(res, 6, 2, 0, 4);

    // 2. TOP NAME TAG: "罗雅曦"
    let r0 = res.regions.iter().find(|r| r.text.contains("罗雅曦"));
    assert!(r0.is_some(), "Must detect name tag '罗雅曦'");
    assert_eq!(r0.unwrap().kind, RegionKind::FreeText);

    // 3. TOP HOLOGRAPHIC STATUS CARD: "好感度+20%" x3
    let r1 = res.regions.iter().find(|r| r.text.contains("好感度+20%"));
    assert!(r1.is_some(), "Must detect holographic status card '好感度+20%'");
    let r1 = r1.unwrap();
    assert_eq!(r1.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(r1, RegionKind::FreeText, 554, 428, 274, 195, 20);

    // 4. SPEECH BUBBLE: "亲爱的你真好~"
    let r2 = res.regions.iter().find(|r| r.text.contains("亲爱的你真好"));
    assert!(r2.is_some(), "Must detect dialogue bubble '亲爱的你真好~'");
    assert_eq!(r2.unwrap().kind, RegionKind::DialogueBubble);

    // 5. SECOND NAME TAG: "刘一橙"
    let r3 = res.regions.iter().find(|r| r.text.contains("刘一橙"));
    assert!(r3.is_some(), "Must detect name tag '刘一橙'");
    assert_eq!(r3.unwrap().kind, RegionKind::FreeText);

    // 6. SECOND HOLOGRAPHIC STATUS CARD: "好感度+10%" x3
    let r4 = res.regions.iter().find(|r| r.text.contains("好感度+10%"));
    assert!(r4.is_some(), "Must detect holographic status card '好感度+10%'");
    let r4 = r4.unwrap();
    assert_eq!(r4.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(r4, RegionKind::FreeText, 57, 947, 270, 194, 20);

    // 7. BOTTOM DIALOGUE BUBBLE: "不像某些人..."
    let r5 = res.regions.iter().find(|r| r.text.contains("不像某些人"));
    assert!(r5.is_some(), "Must detect bottom dialogue bubble '不像某些人...'");
    assert_eq!(r5.unwrap().kind, RegionKind::DialogueBubble);
}
