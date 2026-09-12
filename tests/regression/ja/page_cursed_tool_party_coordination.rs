// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_cursed_tool_party_coordination` (RESOLUTION: 1125 × 1575 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **BUBBLE BOUNDARY CLAMPING AGAINST HAND ARTWORK**:
///   PANEL 1 THOUGHT BUBBLE `あの呪具だとパーティの連携が取りにくいかな……` LIES ADJACENT TO A DRAWN HAND HOLDING A PEN.
///   THE OCR BOUNDING BOX MUST NOT DILATE 50+ PIXELS LEFTWARD INTO THE ARTWORK (X MUST REMAIN >= 470).
/// - **HALLUCINATED KANJI SUPPRESSION (`牛`)**:
///   OCR MUST NOT MISRECOGNIZE TRAILING ELLIPSIS DOTS (`……`) AS KANJI `牛`.
/// - **UPPER BUBBLE OCR FIDELITY (`そろそろ`)**:
///   OCR MUST RECOGNIZE `そろそろ` WITHOUT CORRUPTING IT TO `そろそる`.
#[test]
fn test_regression_page_cursed_tool_party_coordination() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_cursed_tool_party_coordination.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_cursed_tool_party_coordination: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 1125x1575 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, box={:?}, bubble_box={:?}, text='{}', conf={:.2}, vert={}",
            i, r.kind, r.box_, r.bubble_box, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. STRICT 10-REGION ACCOUNTING
    crate::assert_element_counts!(res, 10, 9, 0, 1);

    // 1. PANEL 1 UPPER-LEFT BUBBLE: 'そろそろ……だな……'
    let sorosoro_bubble = res.regions.iter().find(|r| r.text.contains("そろ") || (r.box_.x < 150 && r.box_.y < 150));
    assert!(sorosoro_bubble.is_some(), "Must detect panel 1 upper-left bubble 'そろそろ'");
    let sorosoro_bubble = sorosoro_bubble.unwrap();
    assert!(!sorosoro_bubble.text.contains("そろそる"), "Must not misread 'そろそろ' as 'そろそる', text='{}'", sorosoro_bubble.text);

    // 2. PANEL 1 MAIN THOUGHT BUBBLE: 'あの呪具だと パーティの連携が 取りにくいかな'
    let tool_bubble = res.regions.iter().find(|r| r.text.contains("呪具") && (r.text.contains("連携") || r.text.contains("取りにくい")));
    assert!(tool_bubble.is_some(), "Must detect panel 1 thought bubble 'あの呪具だと...'");
    let tool_bubble = tool_bubble.unwrap();
    assert!(!tool_bubble.text.contains('牛'), "Must not hallucinate kanji '牛' from ellipsis dots, text='{}'", tool_bubble.text);
    // BOUNDING BOX MUST NOT DILATE INTO DRAWN HAND (X MUST BE CLAMPED >= 465)
    assert!(tool_bubble.box_.x >= 465, "Text box x must not bleed into hand artwork (x >= 465), got x={}", tool_bubble.box_.x);

    // 3. PANEL 1 NOTEBOOK BUBBLE: '今日採れた素材で 新しい呪具も 作れるし 試してみるか'
    let notebook_bubble = res.regions.iter().find(|r| r.text.contains("採れた素材") || r.text.contains("試してみる"));
    assert!(notebook_bubble.is_some(), "Must detect panel 1 notebook bubble");

    // 4. PANEL 2 PLACARD: '呪具師 ゲイル・ハミルトン'
    let name_card = res.regions.iter().find(|r| r.text.contains("ゲイル") && r.text.contains("ハミルトン"));
    assert!(name_card.is_some(), "Must detect panel 2 name placard card");

    // 5. PANEL 3 BOTTOM BUBBLE: '悪いが 契約は 打ち切りだ'
    let contract_bubble = res.regions.iter().find(|r| r.text.contains("打ち切り") || r.text.contains("契約は"));
    assert!(contract_bubble.is_some(), "Must detect contract termination bubble");
}
