// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_tamura_pc_erase_data.webp` (RESOLUTION: 1093 × 2110 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **MULTI-COLUMN SPEECH BUBBLE UNIFICATION**:
///   GUARANTEES THAT MULTI-COLUMN JAPANESE VERTICAL DIALOGUE IN A SINGLE BUBBLE (E.G. '田村あーー！！' +
///   '万が一 万が一だが俺が死んだら…') ARE UNIFIED INTO A SINGLE COHESIVE REGION RATHER THAN TWO SPLIT REGIONS.
/// - **ROUNDED BATH BUBBLE UNIFICATION**:
///   '風呂に沈めて電気流して' + 'データを完全に消去してやってくれ…' ARE UNIFIED TOGETHER.
/// - **ASPECT RATIO EXPANSION**:
///   ENSURES DIALOGUE BUBBLE REGIONS EXPAND PROPORTIONALLY IN WIDTH TO ENABLE PROPER HORIZONTAL TYPESETTING.
#[test]
fn test_regression_page_tamura_pc_erase_data() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_tamura_pc_erase_data/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_tamura_pc_erase_data: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 1093x2110 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. STRICT 13-REGION ACCOUNTING (13 DIALOGUEBUBBLES, 0 SOUNDEFFECTS, 0 FREETEXT)
    crate::assert_element_counts!(res, 13, 13, 0, 0);

    // 1. TOP-LEFT SPIKY SYSTEM BUBBLE: '確認しました。血液が不要な身体を作成します。'
    let r0 = res.regions.iter().find(|r| r.text.contains("確認") || r.text.contains("身体") || r.text.contains("作成"));
    assert!(r0.is_some(), "Must detect top-left spiky system bubble");
    let r0 = r0.unwrap();
    crate::assert_region_bounds!(r0, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 79, 125, 154, 308, 8);
    crate::assert_bubble_bounds!(r0, 42, 69, 220, 394, 10);

    // 2. TOP-CENTER RECTANGULAR BOX: '血液が足りないと人は死ぬんだっけ…やばいな'
    let r1 = res.regions.iter().find(|r| r.text.contains("死ぬんだっけ") || r.text.contains("やばいな") || r.text.contains("足りない"));
    assert!(r1.is_some(), "Must detect top-center box");
    let r1 = r1.unwrap();
    crate::assert_region_bounds!(r1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 308, 54, 134, 249, 8);
    crate::assert_bubble_bounds!(r1, 284, 36, 182, 294, 10);

    // 3. TOP-RIGHT RECTANGULAR NARRATION BOX: 'あ なんか寒くなってきた'
    let r2 = res.regions.iter().find(|r| r.text.contains("寒く") || r.text.contains("なってきた"));
    assert!(r2.is_some(), "Must detect top-right narration box");
    let r2 = r2.unwrap();
    crate::assert_region_bounds!(r2, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 848, 66, 98, 221, 8);
    crate::assert_bubble_bounds!(r2, 819, 53, 146, 251, 10);

    // 4. MID-LEFT PC SCREEN TEXT: '…PC!' (FULL VERTICAL SPAN COVERING BOTH '…PC' AND '!!')
    let r3 = res.regions.iter().find(|r| r.text.contains("PC") || r.text.contains("…PC"));
    assert!(r3.is_some(), "Must detect PC screen text");
    let r3 = r3.unwrap();
    crate::assert_region_bounds!(r3, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 104, 754, 68, 190, 8);
    crate::assert_bubble_bounds!(r3, 87, 730, 104, 249, 10);

    // 5. MID-CENTER RECTANGULAR BUBBLE: 'にしてもずいぶん無機質な声だったな...'
    let r4 = res.regions.iter().find(|r| r.text.contains("無機質") || r.text.contains("パソコン") || r.text.contains("自動音声"));
    assert!(r4.is_some(), "Must detect middle-center rectangular bubble");
    let r4 = r4.unwrap();
    crate::assert_region_bounds!(r4, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 369, 574, 176, 276, 8);
    crate::assert_bubble_bounds!(r4, 353, 546, 210, 349, 10);

    // 6. MID-RIGHT QUESTION BUBBLE (COLUMN 1): '血液が不要…?？ 意味ワカラン'
    let r5 = res.regions.iter().find(|r| r.text.contains("ワカラン") || (r.text.contains("不要") && r.box_.y > 500));
    assert!(r5.is_some(), "Must detect middle-right question bubble column 1");
    let r5 = r5.unwrap();
    crate::assert_region_bounds!(r5, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 629, 647, 107, 236, 8);
    crate::assert_bubble_bounds!(r5, 606, 524, 245, 400, 10);

    // 7. MID-RIGHT QUESTION BUBBLE (COLUMN 2): 'んん？なんだ 今の声…田村か？'
    let r6 = res.regions.iter().find(|r| r.text.contains("今の声") || (r.text.contains("田村") && r.box_.y < 1000));
    assert!(r6.is_some(), "Must detect middle-right question bubble column 2");
    let r6 = r6.unwrap();
    crate::assert_region_bounds!(r6, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 745, 537, 80, 222, 8);
    crate::assert_bubble_bounds!(r6, 606, 524, 245, 400, 10);

    // 8. LOWER-LEFT BATH BUBBLE: 'データを完全に消去してやってくれ…'
    let r7 = res.regions.iter().find(|r| r.text.contains("完全に") || r.text.contains("消去"));
    assert!(r7.is_some(), "Must detect lower-left bath bubble data erasing text");
    let r7 = r7.unwrap();
    crate::assert_region_bounds!(r7, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 90, 1132, 97, 302, 8);
    crate::assert_bubble_bounds!(r7, 59, 1070, 238, 411, 10);

    // 9. LOWER-LEFT BATH BUBBLE: '風呂に沈めて電気流して'
    let r8 = res.regions.iter().find(|r| r.text.contains("風呂") || r.text.contains("沈めて") || r.text.contains("電気"));
    assert!(r8.is_some(), "Must detect lower-left bath bubble electricity text");
    let r8 = r8.unwrap();
    crate::assert_region_bounds!(r8, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 190, 1107, 94, 184, 8);
    crate::assert_bubble_bounds!(r8, 59, 1070, 238, 411, 10);

    // 10. LOWER-CENTER PC BUBBLE: '…俺のPCを頼む'
    let r9 = res.regions.iter().find(|r| r.text.contains("頼む") || (r.text.contains("俺の") && r.box_.x < 700));
    assert!(r9.is_some(), "Must detect center bubble '…俺のPCを頼む'");
    let r9 = r9.unwrap();
    crate::assert_region_bounds!(r9, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 553, 1109, 76, 248, 8);
    crate::assert_bubble_bounds!(r9, 509, 1077, 136, 323, 10);

    // 11. LOWER-RIGHT SPIKY SCREAM BUBBLE (COLUMN 1): '田村あーー！！'
    let r10 = res.regions.iter().find(|r| r.text.contains("田村") && r.box_.y > 1000 && r.box_.x > 900);
    assert!(r10.is_some(), "Must detect scream column '田村あーー！！'");
    let r10 = r10.unwrap();
    crate::assert_region_bounds!(r10, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 941, 1108, 92, 356, 8);
    crate::assert_bubble_bounds!(r10, 765, 1082, 302, 470, 10);

    // 12. LOWER-RIGHT SPIKY SCREAM BUBBLE (COLUMN 2): '万が一 万が一だが俺が死んだら…'
    let r11 = res.regions.iter().find(|r| r.text.contains("万が一") || (r.text.contains("俺が死んだら") && r.box_.x > 700));
    assert!(r11.is_some(), "Must detect scream column '万が一 万が一だが俺が死んだら…'");
    let r11 = r11.unwrap();
    crate::assert_region_bounds!(r11, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 798, 1162, 124, 334, 8);
    crate::assert_bubble_bounds!(r11, 765, 1082, 302, 470, 10);

    // 13. BOTTOM-LEFT BUBBLE: 'はは… 先輩らしいですね'
    let r12 = res.regions.iter().find(|r| r.text.contains("先輩") || r.text.contains("はは"));
    assert!(r12.is_some(), "Must detect bottom-left bubble 'はは… 先輩らしいですね'");
    let r12 = r12.unwrap();
    crate::assert_region_bounds!(r12, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 262, 1645, 84, 230, 8);
    crate::assert_bubble_bounds!(r12, 240, 1625, 118, 277, 10);

    // NEGATIVE GUARD: EXPLICITLY ENSURE ISOLATED GASP GLYPH 'っ' IN MARGIN IS FILTERED
    assert!(!res.regions.iter().any(|r| r.text.trim() == "っ" && r.box_.x > 1000));
}
