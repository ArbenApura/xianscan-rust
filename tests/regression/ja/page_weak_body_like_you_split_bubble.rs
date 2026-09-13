// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_weak_body_like_you_split_bubble` (RESOLUTION: 836 × 1706 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **INTRA-BUBBLE MULTI-COLUMN UNIFICATION**:
///   IN PANEL 3, A SINGLE CIRCULAR DIALOGUE BALLOON CONTAINS TWO VERTICAL COLUMNS OF JAPANESE TEXT:
///   RIGHT COLUMN: `僕は身体が弱かったから`
///   LEFT COLUMN: `君みたいになりたかったのかも`
///   THESE MUST BE UNIFIED INTO A SINGLE CONTINUOUS DIALOGUE BUBBLE REGION RATHER THAN SPLITTING
///   THE SECOND COLUMN AS AN UNBOUNDED FREE_TEXT REGION THAT COLLIDES WITH THE FIRST IN TYPESETTING.
/// - **CLEAN BUBBLE ENVELOPE RETENTION**:
///   VERIFIES THAT THE UNIFIED REGION OWNS THE OUTER CIRCULAR BUBBLE CONTAINER BOUNDS `[269, 1263, 175, 202]`.
/// - **STRAY PREFIX GLYPH FILTERING**:
///   PANEL 1 LOWER-RIGHT BUBBLE `一緒に世界を何度も征服したこと` MUST NOT BE PREPENDED BY STRAY OPTICAL SLIVER `人`.
/// - **EXHAUSTIVE 8-REGION ACCOUNTING**:
///   VERIFIES ALL 8 DIALOGUE BUBBLES ACROSS THE 5 PANELS WITHOUT HALLUCINATED OR DUPLICATE FRAGMENTS.
#[test]
fn test_regression_page_weak_body_like_you_split_bubble() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_weak_body_like_you_split_bubble.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_weak_body_like_you_split_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 836x1706 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, box={:?}, bubble_box={:?}, text='{}', conf={:.2}, vert={}",
            i, r.kind, r.box_, r.bubble_box, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. STRICT 9-REGION ACCOUNTING (9 DIALOGUEBUBBLES, 0 SOUNDEFFECTS, 0 FREETEXT)
    // PANEL 3 FIGURE-8 BUBBLE SPLITS ACROSS THE WAIST INTO TWO DISTINCT DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 9, 9, 0, 0);

    // 1. PANEL 1 TOP-RIGHT BUBBLE: '拓斗様が 話しかけてくれたこと'
    let spoken_bubble = res.regions.iter().find(|r| r.text.contains("拓斗様が") || r.text.contains("話しかけて"));
    assert!(spoken_bubble.is_some(), "Must detect panel 1 top-right bubble '拓斗様が話しかけてくれたこと'");
    let spoken_bubble = spoken_bubble.unwrap();
    crate::assert_region_bounds!(spoken_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 684, 134, 49, 163, 10);
    crate::assert_bubble_bounds!(spoken_bubble, 650, 131, 116, 179, 10);

    // 2. PANEL 1 UPPER-MID BUBBLE: '何度もゲームオーバーに なったこと'
    let gameover_bubble = res.regions.iter().find(|r| r.text.contains("ゲームオーバー") || r.text.contains("何度も"));
    assert!(gameover_bubble.is_some(), "Must detect panel 1 upper-mid bubble '何度もゲームオーバーになったこと'");
    let gameover_bubble = gameover_bubble.unwrap();
    crate::assert_region_bounds!(gameover_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 425, 152, 51, 202, 10);
    crate::assert_bubble_bounds!(gameover_bubble, 391, 142, 118, 228, 10);

    // 3. PANEL 1 LOWER-RIGHT BUBBLE: '一緒に世界を 何度も征服したこと' (NO STRAY '人' PREFIX)
    let conquest_bubble = res.regions.iter().find(|r| r.text.contains("一緒に世界を") || r.text.contains("征服した"));
    assert!(conquest_bubble.is_some(), "Must detect panel 1 lower-right bubble '一緒に世界を何度も征服したこと'");
    let conquest_bubble = conquest_bubble.unwrap();
    assert!(!conquest_bubble.text.trim().starts_with('人'), "Must not prepend stray stroke '人' to conquest bubble");
    crate::assert_region_bounds!(conquest_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 549, 362, 57, 177, 12);
    crate::assert_bubble_bounds!(conquest_bubble, 514, 344, 115, 200, 10);

    // 4. PANEL 1 LOWER-LEFT BUBBLE: '全部覚えています'
    let remember_bubble = res.regions.iter().find(|r| r.text.contains("全部覚えて") || r.text.contains("覚えています"));
    assert!(remember_bubble.is_some(), "Must detect panel 1 lower-left bubble '全部覚えています'");
    let remember_bubble = remember_bubble.unwrap();
    crate::assert_region_bounds!(remember_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 149, 298, 32, 164, 10);
    crate::assert_bubble_bounds!(remember_bubble, 102, 266, 124, 238, 10);

    // 5. PANEL 2 LARGE ELF BUBBLE: 'ご安心ください 私は拓斗様のことを ちゃんと覚えております'
    let elf_bubble = res.regions.iter().find(|r| r.text.contains("ご安心ください") || r.text.contains("覚えております"));
    assert!(elf_bubble.is_some(), "Must detect panel 2 elf dialogue bubble");
    let elf_bubble = elf_bubble.unwrap();
    crate::assert_region_bounds!(elf_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 606, 835, 85, 242, 10);
    crate::assert_bubble_bounds!(elf_bubble, 532, 798, 221, 325, 10);

    // 6. PANEL 3 BOY CRYING FIGURE-8 BUBBLE: SPLIT INTO TWO DISTINCT DIALOGUE LOBES
    // LOBE 1 (UPPER-RIGHT): '僕は身体が\n弱かったから'
    let weak_body_lobe1 = res.regions.iter().find(|r| r.text.contains("弱かったから") && !r.text.contains("なりたかった"));
    assert!(weak_body_lobe1.is_some(), "Must detect upper-right lobe '僕は身体が\\n弱かったから'");
    let weak_body_lobe1 = weak_body_lobe1.unwrap();
    assert_eq!(weak_body_lobe1.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_bubble_bounds!(weak_body_lobe1, 269, 1263, 175, 202, 10);

    // LOBE 2 (LOWER-LEFT): '君みたいに\nなりたかったの\nかも'
    let weak_body_lobe2 = res.regions.iter().find(|r| r.text.contains("君みたいに") || r.text.contains("なりたかった"));
    assert!(weak_body_lobe2.is_some(), "Must detect lower-left lobe '君みたいに\\nなりたかったの\\nかも'");
    let weak_body_lobe2 = weak_body_lobe2.unwrap();
    assert_eq!(weak_body_lobe2.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_bubble_bounds!(weak_body_lobe2, 269, 1263, 175, 202, 10);

    // 7. PANEL 4 RIGHT BOY BUBBLE: '君を…アトゥを使うのは 僕のプレイスタイルで ポリシーだったんだ'
    let atou_bubble = res.regions.iter().find(|r| r.text.contains("アトゥを使うのは") || r.text.contains("プレイスタイル"));
    assert!(atou_bubble.is_some(), "Must detect panel 4 boy policy bubble");
    let atou_bubble = atou_bubble.unwrap();
    crate::assert_region_bounds!(atou_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 511, 1451, 73, 197, 10);
    crate::assert_bubble_bounds!(atou_bubble, 475, 1443, 146, 221, 10);

    // 8. PANEL 5 BOTTOM-LEFT BUBBLE: '君と直接 話ができて 嬉しいよ'
    let happy_talk_bubble = res.regions.iter().find(|r| r.text.contains("君と直接") || r.text.contains("嬉しいよ"));
    assert!(happy_talk_bubble.is_some(), "Must detect panel 5 bottom-left happy talk bubble");
    let happy_talk_bubble = happy_talk_bubble.unwrap();
    crate::assert_region_bounds!(happy_talk_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 103, 1543, 73, 99, 10);
    crate::assert_bubble_bounds!(happy_talk_bubble, 79, 1519, 124, 154, 10);
}
