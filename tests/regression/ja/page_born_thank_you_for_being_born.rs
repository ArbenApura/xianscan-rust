// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_born_thank_you_for_being_born` (RESOLUTION: 1360 × 1929 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **MULTI-COLUMN VERTICAL JAPANESE NARRATION RECOVERY**:
///   VERIFIES THAT BOTH VERTICAL COLUMNS OF THE RIGHT NARRATION (`生まれてきて\nくれて…`)
///   ARE DETECTED AND UNIFIED INTO A SINGLE REGION IN PROPER TBRL (RIGHT-TO-LEFT) ORDER.
/// - **LEFT NARRATION EXTRACTION**:
///   PRESERVES THE LEFT NARRATION COLUMN (`ありがとう…`).
#[test]
fn test_regression_page_born_thank_you_for_being_born() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_born_thank_you_for_being_born/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_born_thank_you_for_being_born: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 1360x1929 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. STRICT 2-REGION ACCOUNTING (0 DIALOGUEBUBBLES, 0 SOUNDEFFECTS, 2 FREETEXT)
    crate::assert_element_counts!(res, 2, 0, 0, 2);

    // 1. RIGHT 2-COLUMN NARRATION: '生まれてきて\nくれて…'
    let right_narration = res.regions.iter().find(|r| r.text.contains("生まれてきて") || r.text.contains("くれて"));
    assert!(right_narration.is_some(), "Must detect right narration '生まれてきて\\nくれて…'");
    let right_narration = right_narration.unwrap();
    crate::assert_region_bounds!(right_narration, xianscan_rust::ml::schemas::RegionKind::FreeText, 1070, 990, 248, 550, 20);
    assert!(right_narration.text.contains("生まれてきて"), "Must contain first column '生まれてきて'");
    assert!(right_narration.text.contains("くれて"), "Must contain second column 'くれて…'");

    // 2. LEFT 1-COLUMN NARRATION: 'ありがとう…'
    let left_narration = res.regions.iter().find(|r| r.text.contains("ありがとう"));
    assert!(left_narration.is_some(), "Must detect left narration 'ありがとう…'");
    let left_narration = left_narration.unwrap();
    crate::assert_region_bounds!(left_narration, xianscan_rust::ml::schemas::RegionKind::FreeText, 191, 1161, 142, 545, 10);
}
