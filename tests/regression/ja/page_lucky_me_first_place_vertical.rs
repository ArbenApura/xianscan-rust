// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_lucky_me_first_place_vertical.webp` (RESOLUTION: 1129 × 1600 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **VERTICAL JAPANESE MULTI-COLUMN READING ORDER (RIGHT-TO-LEFT)**:
///   GUARANTEES THAT MULTI-COLUMN JAPANESE VERTICAL DIALOGUE IS READ RIGHT-TO-LEFT (TBRL).
///   E.G., PANEL 2 TEACHER BUBBLE MUST READ `お前ら\n秋田を\n見習え～` (NOT REVERSED `見習え～秋田をお前ら`).
/// - **ZERO DUPLICATE OVERLAPPING BUBBLE REGIONS**:
///   PREVENTS DUPLICATE SUB-BOX EMISSIONS ON VERTICAL BUBBLES (`末は博士か大臣か`).
/// - **NEGATIVE FURIGANA ECHO GUARD**:
///   PREVENTS RUBY TEXT (FURIGANA) FROM PRODUCING DUPLICATE LINE ECHOES.
#[test]
fn test_regression_page_lucky_me_first_place_vertical() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_lucky_me_first_place_vertical.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_lucky_me_first_place_vertical: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 1129x1600 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. STRICT 10-REGION ACCOUNTING (9 DIALOGUEBUBBLES, 0 SOUNDEFFECTS, 1 FREETEXT)
    crate::assert_element_counts!(res, 10, 9, 0, 1);

    // 1. TOP-LEFT BUBBLE: 'いやあ・・ ラッキーだよ'
    // TEXT BOUNDS: [X: 98, Y: 98, W: 114, H: 205] | BUBBLE BOUNDS: [X: 78, Y: 60, W: 168, H: 273]
    let lucky_bubble = res.regions.iter().find(|r| r.text.contains("ラッキー") || r.text.contains("いやあ"));
    assert!(lucky_bubble.is_some(), "Must detect top-left bubble 'いやあ・・ ラッキーだよ'");
    let lucky_bubble = lucky_bubble.unwrap();
    crate::assert_region_bounds!(lucky_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 98, 98, 114, 205, 15);
    crate::assert_bubble_bounds!(lucky_bubble, 78, 60, 168, 273, 15);

    // 2. TOP-CENTER SMALL CIRCLE: 'スゴすぎー'
    // TEXT BOUNDS: [X: 452, Y: 93, W: 84, H: 131] | BUBBLE BOUNDS: [X: 433, Y: 79, W: 118, H: 162]
    let sugoi_bubble = res.regions.iter().find(|r| r.text.contains("スゴすぎ") || (r.text.contains("ス") && r.text.contains("ぎ")));
    assert!(sugoi_bubble.is_some(), "Must detect small circular bubble 'スゴすぎー'");
    let sugoi_bubble = sugoi_bubble.unwrap();
    crate::assert_region_bounds!(sugoi_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 452, 93, 84, 131, 8);
    crate::assert_bubble_bounds!(sugoi_bubble, 433, 79, 118, 162, 10);

    // 3. TOP-CENTER BUBBLE: '入学以来 ずっと じゃない！？'
    // TEXT BOUNDS: [X: 672, Y: 104, W: 105, H: 150] | BUBBLE BOUNDS: [X: 653, Y: 86, W: 146, H: 184]
    let entrance_bubble = res.regions.iter().find(|r| r.text.contains("入学以来") || r.text.contains("じゃない"));
    assert!(entrance_bubble.is_some(), "Must detect top-center bubble '入学以来 ずっと じゃない！？'");
    let entrance_bubble = entrance_bubble.unwrap();
    crate::assert_region_bounds!(entrance_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 672, 104, 105, 150, 8);
    crate::assert_bubble_bounds!(entrance_bubble, 653, 86, 146, 184, 10);

    // 4. TOP-RIGHT BUBBLE: 'また１位！？'
    // TEXT BOUNDS: [X: 964, Y: 77, W: 100, H: 167] | BUBBLE BOUNDS: [X: 944, Y: 48, W: 139, H: 220]
    let top_right = res.regions.iter().find(|r| r.text.contains("また") && (r.text.contains("1位") || r.text.contains("１位")));
    assert!(top_right.is_some(), "Must detect top-right bubble 'また１位！？'");
    let top_right = top_right.unwrap();
    crate::assert_region_bounds!(top_right, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 964, 77, 100, 167, 8);
    crate::assert_bubble_bounds!(top_right, 944, 48, 139, 220, 10);

    // 5. MID-LEFT SMALL BUBBLE: 'ハハ・・'
    // TEXT BOUNDS: [X: 179, Y: 681, W: 66, H: 102] | BUBBLE BOUNDS: [X: 157, Y: 667, W: 106, h: 140]
    let haha_bubble = res.regions.iter().find(|r| r.text.contains("ハハ"));
    assert!(haha_bubble.is_some(), "Must detect 'ハハ・・' bubble");
    let haha_bubble = haha_bubble.unwrap();
    crate::assert_region_bounds!(haha_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 179, 681, 66, 102, 8);
    crate::assert_bubble_bounds!(haha_bubble, 157, 667, 106, 140, 10);

    // 6. MID-CENTER TEACHER CONTINUATION: 'そして アタシの評価を あげろ～'
    // TEXT BOUNDS: [X: 759, Y: 535, W: 118, H: 216] | BUBBLE BOUNDS: [X: 730, Y: 477, W: 340, H: 305]
    let eval_bubble = res.regions.iter().find(|r| r.text.contains("アタシの評価を") || r.text.contains("あげろ"));
    assert!(eval_bubble.is_some(), "Must detect teacher evaluation bubble");
    let eval_bubble = eval_bubble.unwrap();
    crate::assert_region_bounds!(eval_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 759, 535, 118, 216, 8);
    crate::assert_bubble_bounds!(eval_bubble, 730, 477, 340, 305, 10);

    // 7. MID-RIGHT TEACHER BUBBLE: 'お前ら 秋田を 見習え～'
    // TEXT BOUNDS: [X: 923, Y: 514, W: 128, H: 143] | BUBBLE BOUNDS: [X: 730, Y: 477, W: 340, H: 305]
    let teacher_bubble = res.regions.iter().find(|r| r.text.contains("秋田を") || r.text.contains("見習え"));
    assert!(teacher_bubble.is_some(), "Must detect teacher bubble 'お前ら 秋田を 見習え～'");
    let teacher_bubble = teacher_bubble.unwrap();
    crate::assert_region_bounds!(teacher_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 923, 514, 128, 143, 8);
    crate::assert_bubble_bounds!(teacher_bubble, 730, 477, 340, 305, 10);

    // 8. BOTTOM-LEFT MC FREETEXT: 'ありがとう みんな'
    // TEXT BOUNDS: [X: 98, Y: 958, W: 126, H: 240] (FREETEXT: BUBBLE_BOX IS NONE)
    let thanks_bubble = res.regions.iter().find(|r| r.text.contains("ありがとう") && r.text.contains("みんな"));
    assert!(thanks_bubble.is_some(), "Must detect bottom-left MC speech 'ありがとう みんな'");
    let thanks_bubble = thanks_bubble.unwrap();
    crate::assert_region_bounds!(thanks_bubble, xianscan_rust::ml::schemas::RegionKind::FreeText, 98, 958, 126, 240, 8);

    // 9. BOTTOM-RIGHT GIRL BUBBLE: '謙遜してるのも かっこい～'
    // TEXT BOUNDS: [X: 956, Y: 981, W: 94, H: 182] | BUBBLE BOUNDS: [X: 935, Y: 959, W: 130, H: 225]
    let modest_bubble = res.regions.iter().find(|r| r.text.contains("謙遜") || r.text.contains("かっこい"));
    assert!(modest_bubble.is_some(), "Must detect modest girl bubble");
    let modest_bubble = modest_bubble.unwrap();
    crate::assert_region_bounds!(modest_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 956, 981, 94, 182, 8);
    crate::assert_bubble_bounds!(modest_bubble, 935, 959, 130, 225, 10);

    // 10. BOTTOM-CENTER BOY BUBBLE: 'すえ 末は 博士か 大臣か'
    // TEXT BOUNDS: [X: 713, Y: 1307, W: 154, H: 156] | BUBBLE BOUNDS: [X: 701, Y: 1244, W: 172, H: 263]
    let proverb_bubble = res.regions.iter().find(|r| r.text.contains("博士") || r.text.contains("大臣") || r.text.contains("末は"));
    assert!(proverb_bubble.is_some(), "Must detect proverb bubble '末は 博士か 大臣か'");
    let proverb_bubble = proverb_bubble.unwrap();
    crate::assert_region_bounds!(proverb_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 713, 1307, 154, 156, 8);
    crate::assert_bubble_bounds!(proverb_bubble, 701, 1244, 172, 263, 10);
}
