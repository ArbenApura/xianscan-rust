// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_song_gu_god_nan_ke_city_watermark` (RESOLUTION: 900 × 1738)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **THREE DIALOGUE SPEECH BUBBLES**:
///   1. Top bubble: `"我也不大清楚，如果老宋真的献祭几万大军..."`
///   2. Middle bubble: `"他的灵魂内心被蛊神却以这种古怪的木偶戏形式呈现出来。"`
///   3. Bottom bubble: `"那这座南柯城……"`
///      Collides with semi-transparent aggregator watermark (`COLAMANGA / AcloudMerge.com`).
///      Must be preserved as a valid `DialogueBubble` without being dropped by watermark rejection heuristics.
#[test]
fn test_regression_page_song_gu_god_nan_ke_city_watermark() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_song_gu_god_nan_ke_city_watermark/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_song_gu_god_nan_ke_city_watermark, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));

    println!("Detected {} regions on page_song_gu_god_nan_ke_city_watermark:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, box={:?}, text='{}'",
            i, r.kind, r.box_, r.text.replace('\n', " ")
        );
    }

    assert_eq!(res.regions.len(), 3, "Expected exactly 3 dialogue bubbles on page_song_gu_god_nan_ke_city_watermark");

    for r in &res.regions {
        assert_eq!(r.kind, RegionKind::DialogueBubble, "All 3 regions must be DialogueBubble");
    }

    assert!(res.regions.iter().any(|r| r.text.contains("献祭几万大军") || r.text.contains("老宋")), "Missing top bubble");
    assert!(res.regions.iter().any(|r| r.text.contains("木偶戏") || r.text.contains("灵魂内心")), "Missing middle bubble");
    assert!(res.regions.iter().any(|r| r.text.contains("南柯城")), "Missing bottom bubble '那这座南柯城……'");
}
