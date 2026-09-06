// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_chen_beixuan_slay_black_witch_god_box` (RESOLUTION: 827 × 1521)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 3 RECTANGULAR NARRATION BOX**: MUST UNIFY BOTH LINES ACROSS COMMA:
///   `"陈北玄一人踏一国，于黑山之巅，\n斩杀黑巫教大巫神!"`
///   MUST NOT SPLIT AFTER LINE 1 INTO TWO DISJOINTED REGIONS SHARING THE SAME BOX.
/// - **EXACT COUNTS**: 4 REGIONS TOTAL.
#[test]
fn test_regression_page_chen_beixuan_slay_black_witch_god_box() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_chen_beixuan_slay_black_witch_god_box/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_chen_beixuan_slay_black_witch_god_box, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Slay Black Witch God Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 4 REGIONS (ALL DIALOGUE/NARRATION CONTAINERS)
    crate::assert_element_counts!(res, 4, 4, 0);

    // 2. PANEL 3 RECTANGULAR NARRATION BOX: UNIFIED 2-LINE SENTENCE
    let p3_box = res.regions.iter().find(|r| r.text.contains("陈北玄一人踏一国") || r.text.contains("斩杀黑巫教"));
    assert!(p3_box.is_some(), "Must detect panel 3 rectangular narration box");
    let p3_box = p3_box.unwrap();
    assert!(p3_box.text.contains("陈北玄一人踏一国") || p3_box.text.contains("黑山之巅"), "Must contain line 1");
    assert!(p3_box.text.contains("斩杀黑巫教") || p3_box.text.contains("大巫神"), "Must contain line 2 in the same unified box");

    // NEGATIVE CHECK: ZERO SPLIT REGIONS CONTAINING ONLY LINE 1 OR LINE 2
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "陈北玄一人踏一国，于黑山之巅，"),
        "Must NOT split across comma"
    );

    // 3. PANEL 1 TOP-LEFT SPEECH BUBBLE
    assert!(res.regions.iter().any(|r| r.text.contains("大英雄")), "Must detect panel 1 speech bubble");

    // 4. PANEL 2 CENTER SPEECH BUBBLE
    assert!(res.regions.iter().any(|r| r.text.contains("陈凡")), "Must detect panel 2 speech bubble");

    // 5. PANEL 4 BOTTOM-LEFT LABEL BOX
    assert!(res.regions.iter().any(|r| r.text.contains("洪门")), "Must detect panel 4 label box");
}
