// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_lin_family_army_memorial_tablets` (RESOLUTION: 900 × 1201)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **BACKGROUND MEMORIAL TABLETS SUPPRESSION**:
///   Names inscribed on memorial tablets (`傅凌天`, `白黎轩`, `温予然`, `楚殇`, `古逸`) and the background wall
///   represent scene illustration and must NOT be detected as dialogue or free text.
/// - **CLEAN DIALOGUE BUBBLE RECOGNITION**:
///   Only the foreground speech bubble (`"那是林家军的名字……"`) should be detected, with no stuttered duplication.
#[test]
fn test_regression_page_lin_family_army_memorial_tablets() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_lin_family_army_memorial_tablets/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_lin_family_army_memorial_tablets, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));

    println!("Detected {} regions on page_lin_family_army_memorial_tablets:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, box={:?}, text='{}'",
            i, r.kind, r.box_, r.text.replace('\n', " ")
        );
    }

    assert_eq!(res.regions.len(), 1, "Expected exactly 1 region (dialogue bubble only, 0 background tablets) on page_lin_family_army_memorial_tablets");
    let b0 = &res.regions[0];
    assert_eq!(b0.kind, RegionKind::DialogueBubble, "The single region must be DialogueBubble");
    assert!(b0.text.contains("林家军"), "Bubble text must contain '林家军'");
    assert!(b0.text.contains("名字"), "Bubble text must contain '名字'");
    assert!(!b0.text.contains("3是"), "Dialogue bubble must not contain stutter duplication '3是'");
}
