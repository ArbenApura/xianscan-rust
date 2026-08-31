// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_song_yunxiang_star_release_exhale_bubbles` (RESOLUTION: 900 × 1134)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **SYSTEM DIALOGUE BOXES & CHARACTER EXHALATION BUBBLES**: 4 rectangular system boxes + 2 oval dialogue exhalation bubbles `呼……`.
/// - **EXPECTED COUNT**: Exactly 6 regions (6 DialogueBubble, 0 SoundEffect, 0 FreeText).
/// - **EXHALATION BUBBLE PRESERVATION**: Dialogue sigh/breathing bubbles `呼……` must be preserved inside speech bubbles.
#[test]
fn test_regression_page_song_yunxiang_star_release_exhale_bubbles() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_song_yunxiang_star_release_exhale_bubbles/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_song_yunxiang_star_release_exhale_bubbles: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Chinese Song Yunxiang Star Release Page detected {} regions:",
        res.regions.len()
    );
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 6 REGIONS (6 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 0 FREETEXT)
    crate::assert_element_counts!(res, 6, 6, 0, 0);

    // 2. REGION ASSERTIONS
    // System Warning: 警告！\n魂力不足！！
    let r_warn = res.regions.iter().find(|r| r.text.contains("警告") && r.text.contains("魂力不足")).expect("Warning box");
    crate::assert_region_bounds!(r_warn, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 549, 39, 200, 69, 8);
    crate::assert_bubble_bounds!(r_warn, 505, 26, 301, 102, 8);
    crate::assert_region_angle!(r_warn, 0.0, 2.0);

    // Status: 魂力残量5.06%
    let r_status = res.regions.iter().find(|r| r.text.contains("魂力残量")).expect("Status box");
    crate::assert_region_bounds!(r_status, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 265, 526, 213, 42, 8);
    crate::assert_bubble_bounds!(r_status, 225, 497, 296, 101, 8);
    crate::assert_region_angle!(r_status, 0.0, 2.0);

    // Countdown: 距离强制星解剩余\n15……14…13
    let r_cd = res.regions.iter().find(|r| r.text.contains("距离强制星解")).expect("Countdown box");
    crate::assert_region_bounds!(r_cd, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 600, 788, 279, 64, 8);
    crate::assert_bubble_bounds!(r_cd, 592, 770, 299, 104, 8);
    crate::assert_region_angle!(r_cd, 0.0, 2.0);

    // Title Card: 圣阶星魂师\n宋云祥
    let r_title = res.regions.iter().find(|r| r.text.contains("圣阶星魂师") && r.text.contains("宋云祥")).expect("Title card");
    crate::assert_region_bounds!(r_title, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 185, 925, 235, 126, 8);
    crate::assert_bubble_bounds!(r_title, 129, 893, 372, 196, 8);
    crate::assert_region_angle!(r_title, 0.0, 2.0);

    // Left Exhale Bubble: 呼……
    let left_exhale = res.regions.iter().find(|r| r.text.contains("呼") && r.box_.x < 450 && r.box_.y < 800).expect("Left exhale");
    crate::assert_region_bounds!(left_exhale, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 278, 698, 121, 62, 8);
    crate::assert_bubble_bounds!(left_exhale, 251, 680, 161, 98, 8);
    crate::assert_region_angle!(left_exhale, 0.0, 2.0);

    // Right Exhale Bubble: 呼……
    let right_exhale = res.regions.iter().find(|r| r.text.contains("呼") && r.box_.x > 500 && r.box_.y > 800).expect("Right exhale");
    crate::assert_region_bounds!(right_exhale, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 631, 944, 142, 66, 8);
    crate::assert_bubble_bounds!(right_exhale, 577, 918, 235, 118, 8);
    crate::assert_region_angle!(right_exhale, 0.0, 2.0);
}
