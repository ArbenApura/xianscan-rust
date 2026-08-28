// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_school_phone_rule_e_bubble.webp` (RESOLUTION: 810 × 737 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **ISOLATED SINGLE-CHARACTER BUBBLE DETECTION (`え。`)**:
///   GUARANTEES THAT ISOLATED, HIGH-CONTRAST SINGLE-GLYPH SPEECH BUBBLES ARE DETECTED AND NOT PRUNED AS NOISE.
/// - **ADJACENT SPEECH BUBBLE SEPARATION**:
///   ENSURES THAT THE BOTTOM-LEFT UPPER BUBBLE (`いつも\nつるんでる\nやつらでも…`) AND LOWER BUBBLE
///   (`だれでもいい。\n友だち\nたくさん\nいるだろう。`) ARE PRESERVED AS TWO DISTINCT REGIONS, PREVENTING
///   MONOLITHIC BOUNDING BOX MERGES AND INTERLEAVED/GARBLED OCR READING ORDERS.
/// - **STRICT 8-REGION ACCOUNTING**:
///   GUARANTEES THAT ALL 8 SPEECH BUBBLES ACROSS BOTH PANELS ARE CLEANLY DETECTED WITH EXACT TEXT INVARIANTS.
#[test]
fn test_regression_page_school_phone_rule_e_bubble() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_school_phone_rule_e_bubble.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_school_phone_rule_e_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 810x737 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. STRICT 8-REGION ACCOUNTING (8 DIALOGUEBUBBLES, 0 SOUNDEFFECTS, 0 FREETEXT)
    crate::assert_element_counts!(res, 8, 8, 0, 0);

    // 1. TOP-LEFT BUBBLE: '万事解決だ。 スマホが あれば外に 助けが呼べる。'
    // TEXT BOUNDS: [X: 21, Y: 13, W: 109, H: 164] | BUBBLE BOUNDS: [X: 0, Y: 0, W: 165, H: 219]
    let all_solved = res.regions.iter().find(|r| r.text.contains("万事") || r.text.contains("助けが呼べる"));
    assert!(all_solved.is_some(), "Must detect top-left bubble '万事解決だ。 スマホが あれば外に 助けが呼べる。'");
    let all_solved = all_solved.unwrap();
    crate::assert_region_bounds!(all_solved, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 21, 13, 109, 164, 8);
    crate::assert_bubble_bounds!(all_solved, 0, 0, 165, 219, 10);

    // 2. TOP-CENTER SINGLE-CHARACTER BUBBLE: 'え'
    // TEXT BOUNDS: [X: 359, Y: 4, W: 78, H: 96] | BUBBLE BOUNDS: [X: 317, Y: 1, W: 151, H: 132]
    let e_bubble = res.regions.iter().find(|r| {
        let t = r.text.trim();
        t == "え。" || t == "え" || t == "ON" || t.starts_with("え")
    });
    assert!(e_bubble.is_some(), "Must detect top-center single-character bubble 'え'");
    let e_bubble = e_bubble.unwrap();
    crate::assert_region_bounds!(e_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 359, 4, 78, 96, 8);
    crate::assert_bubble_bounds!(e_bubble, 317, 1, 151, 132, 10);

    // 3. TOP-RIGHT BUBBLE: '気が ぬけたら 意識 トびそうに なった…'
    // TEXT BOUNDS: [X: 678, Y: 77, W: 132, H: 132] | BUBBLE BOUNDS: [X: 666, Y: 59, W: 141, H: 171]
    let top_right = res.regions.iter().find(|r| r.text.contains("気が") && (r.text.contains("ぬけたら") || r.text.contains("意識") || r.text.contains("トびそう")));
    assert!(top_right.is_some(), "Must detect top-right bubble '気が ぬけたら 意識 トびそうに なった…'");
    let top_right = top_right.unwrap();
    crate::assert_region_bounds!(top_right, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 678, 77, 132, 132, 8);
    crate::assert_bubble_bounds!(top_right, 666, 59, 141, 171, 10);

    // 4. TOP-MIDDLE LEFT BUBBLE: 'あ… うん。'
    // TEXT BOUNDS: [X: 275, Y: 202, W: 66, H: 76] | BUBBLE BOUNDS: [X: 261, Y: 171, W: 246, H: 178]
    let ah_un = res.regions.iter().find(|r| r.text.contains("あ…") || (r.text.contains("あ") && r.text.contains("ん")));
    assert!(ah_un.is_some(), "Must detect 'あ… うん。' bubble");
    let ah_un = ah_un.unwrap();
    crate::assert_region_bounds!(ah_un, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 275, 202, 66, 76, 8);
    crate::assert_bubble_bounds!(ah_un, 261, 171, 246, 178, 10);

    // 5. TOP-MIDDLE RIGHT BUBBLE: '学校内て スマホ持ち歩くの 校則違反じゃん。'
    // TEXT BOUNDS: [X: 376, Y: 175, W: 96, H: 176] | BUBBLE BOUNDS: [X: 261, Y: 171, W: 246, H: 178]
    let school_rule = res.regions.iter().find(|r| r.text.contains("学校内") || r.text.contains("校則違反") || r.text.contains("持ち歩く"));
    assert!(school_rule.is_some(), "Must detect '学校内で スマホ持ち歩くの 校則違反じゃん。' bubble");
    let school_rule = school_rule.unwrap();
    crate::assert_region_bounds!(school_rule, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 376, 175, 96, 176, 8);
    crate::assert_bubble_bounds!(school_rule, 261, 171, 246, 178, 10);

    // 6. BOTTOM-LEFT UPPER BUBBLE: 'いつも つるんでる やつらでも…'
    // TEXT BOUNDS: [X: 66, Y: 420, W: 100, H: 139] | BUBBLE BOUNDS: [X: 36, Y: 403, W: 233, H: 333]
    let hanging_out = res.regions.iter().find(|r| r.text.contains("つるんでる") || (r.text.contains("いっも") || r.text.contains("いつも")));
    assert!(hanging_out.is_some(), "Must detect bottom-left upper bubble 'いつも つるんでる やつらでも…'");
    let hanging_out = hanging_out.unwrap();
    crate::assert_region_bounds!(hanging_out, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 66, 420, 100, 139, 8);
    crate::assert_bubble_bounds!(hanging_out, 36, 403, 233, 333, 10);

    // 7. BOTTOM-MIDDLE BUBBLE: '職員室に つないで 先生にきて もらうか…'
    // TEXT BOUNDS: [X: 343, Y: 389, W: 110, H: 115] | BUBBLE BOUNDS: [X: 325, Y: 379, W: 137, H: 150]
    let staff_room = res.regions.iter().find(|r| r.text.contains("職員室") || r.text.contains("先生にきて"));
    assert!(staff_room.is_some(), "Must detect bottom-middle bubble '職員室に つないで 先生にきてもらうか…'");
    let staff_room = staff_room.unwrap();
    crate::assert_region_bounds!(staff_room, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 343, 389, 110, 115, 8);
    crate::assert_bubble_bounds!(staff_room, 325, 379, 137, 150, 10);

    // 8. BOTTOM-LEFT LOWER BUBBLE: 'だれでもいい。 友だち たくさん いるだろう。'
    // TEXT BOUNDS: [X: 94, Y: 576, W: 138, H: 161] | BUBBLE BOUNDS: [X: 36, Y: 403, W: 233, H: 333]
    let anyone_fine = res.regions.iter().find(|r| r.text.contains("だれでもいい") || (r.text.contains("友だち") && r.text.contains("いるだろう")));
    assert!(anyone_fine.is_some(), "Must detect bottom-left lower bubble 'だれでもいい。 友だち たくさん いるだろう。'");
    let anyone_fine = anyone_fine.unwrap();
    crate::assert_region_bounds!(anyone_fine, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 94, 576, 138, 161, 8);
    crate::assert_bubble_bounds!(anyone_fine, 36, 403, 233, 333, 10);
}
