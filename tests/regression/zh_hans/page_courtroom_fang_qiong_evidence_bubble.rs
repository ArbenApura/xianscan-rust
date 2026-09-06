// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_courtroom_fang_qiong_evidence_bubble` (RESOLUTION: 827 × 1861)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - Verifies speech bubble and dialogue detection for courtroom evidence page.
#[test]
fn test_regression_page_courtroom_fang_qiong_evidence_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_courtroom_fang_qiong_evidence_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_courtroom_fang_qiong_evidence_bubble, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Courtroom Page detected {} regions:", res.regions.len());
    // Let's inspect fusion_res by running analyzer with probes or printing
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, box={:?}, bubble_box={:?}, text='{}', conf={:.2}", i, r.kind, r.box_, r.bubble_box, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. MUST UNIFY PANEL 1 TALL SPEECH BUBBLE INTO ONE SINGLE REGION
    let tall_bubble = res.regions.iter().find(|r| r.text.contains("方琼小姐") && r.text.contains("未婚夫"));
    assert!(tall_bubble.is_some(), "Must unify panel 1 tall speech bubble into a single region containing both paragraphs");
    let tall_bubble = tall_bubble.unwrap();
    assert_eq!(tall_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 2. MUST DETECT PANEL 2 SPEECH BUBBLE '你快看看！'
    assert!(res.regions.iter().any(|r| r.text.contains("你快看看")), "Must detect panel 2 '你快看看！'");

    // 3. EXACT COUNTS: 8 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 8, 8, 0);
}
