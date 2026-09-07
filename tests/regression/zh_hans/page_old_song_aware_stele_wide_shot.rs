// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_old_song_aware_stele_wide_shot` (RESOLUTION: 900 × 2110)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **BACKGROUND STELE PLAQUE SUPPRESSION**:
///   Carved plaque header `"林问天"` on the background monument must NOT be detected as free text.
/// - **CLEAN DIALOGUE BUBBLE RECOGNITION**:
///   Only the foreground dialogue bubble (`"老宋他自己也清楚。"`) should be detected.
#[test]
fn test_regression_page_old_song_aware_stele_wide_shot() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_old_song_aware_stele_wide_shot/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_old_song_aware_stele_wide_shot, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));

    println!("Detected {} regions on page_old_song_aware_stele_wide_shot:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, box={:?}, text='{}'",
            i, r.kind, r.box_, r.text.replace('\n', " ")
        );
    }

    assert_eq!(res.regions.len(), 1, "Expected exactly 1 region (dialogue bubble only) on page_old_song_aware_stele_wide_shot");

    let r0 = &res.regions[0];
    assert_eq!(r0.kind, RegionKind::DialogueBubble, "The single region must be DialogueBubble");
    assert!(r0.text.contains("老宋") || r0.text.contains("也清楚"), "Text must match '老宋他自己也清楚。'");

    // NEGATIVE ASSERTION: STELE PLAQUE MUST NOT BE DETECTED AS FREE TEXT
    assert!(!res.regions.iter().any(|r| r.text.contains("林问天")), "Background plaque '林问天' must not be detected");
}
