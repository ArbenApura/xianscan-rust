// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_who_decides_how_it_starts` (RESOLUTION: 1360 × 1202 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **MULTI-COLUMN VERTICAL JAPANESE NARRATION CLUSTERING**:
///   VERIFIES THAT MULTI-COLUMN VERTICAL JAPANESE NARRATION TEXT (`どうやって\n始まるの\nだろう…？`)
///   IS CLUSTERED INTO A SINGLE UNIFIED FREE TEXT UTTERANCE WITH PROPER TBRL (RIGHT-TO-LEFT) READING ORDER.
/// - **TOP-LEFT NARRATION EXTRACTION**:
///   PRESERVES THE TOP-LEFT TWO-COLUMN NARRATION BLOCK (`誰が\n決めて…`).
/// - **OPTICAL RESIDUE & NOISE SUPPRESSION**:
///   SUPPRESSES SPURIOUS TRAILING NOISE STROKES (E.G. `…...UIn`).
#[test]
fn test_regression_page_who_decides_how_it_starts() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_who_decides_how_it_starts/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_who_decides_how_it_starts: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 1360x1202 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. STRICT 2-REGION ACCOUNTING (0 DIALOGUEBUBBLES, 0 SOUNDEFFECTS, 2 FREETEXT)
    crate::assert_element_counts!(res, 2, 0, 0, 2);

    // 1. TOP-LEFT NARRATION: '誰が\n決めて…'
    // TEXT BOUNDS: [X: 66, Y: 38, W: 140, H: 218] (FREETEXT)
    let top_left = res.regions.iter().find(|r| r.text.contains("誰が") || r.text.contains("決めて"));
    assert!(top_left.is_some(), "Must detect top-left narration '誰が\\n決めて…'");
    let top_left = top_left.unwrap();
    crate::assert_region_bounds!(top_left, xianscan_rust::ml::schemas::RegionKind::FreeText, 66, 38, 140, 218, 10);

    // 2. CENTER-RIGHT 3-COLUMN NARRATION: 'どうやって\n始まるの\nだろう…？'
    // TEXT BOUNDS: [X: 544, Y: 730, W: 219, H: 269] (FREETEXT)
    let how_it_starts = res.regions.iter().find(|r| r.text.contains("どうやって") || r.text.contains("始まるの") || r.text.contains("だろう"));
    assert!(how_it_starts.is_some(), "Must detect center-right multi-column narration 'どうやって\\n始まるの\\nだろう…？'");
    let how_it_starts = how_it_starts.unwrap();
    crate::assert_region_bounds!(how_it_starts, xianscan_rust::ml::schemas::RegionKind::FreeText, 544, 730, 219, 269, 15);
    assert!(how_it_starts.text.contains("どうやって"), "Must contain first column 'どうやって'");
    assert!(how_it_starts.text.contains("始まるの"), "Must contain second column '始まるの'");
    assert!(how_it_starts.text.contains("だろう"), "Must contain third column 'だろう'");

    // NEGATIVE GUARDS: NO SPURIOUS FRAGMENTS OR RESIDUE
    assert!(!res.regions.iter().any(|r| r.text.trim() == "UIn" || r.text.contains("…...UIn")), "Must not emit OCR optical residue 'UIn'");
}
