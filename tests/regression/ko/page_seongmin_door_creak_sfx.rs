// -- INTERNAL IMPORTS -- //
use crate::common::{get_or_analyze_fixture_with_lang, get_or_analyze_fixture_with_opts};
use xianscan_rust::ml::schemas::AnalyzeOptions;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_seongmin_door_creak_sfx_enabled` (RESOLUTION: 690 × 1848)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 DIALOGUE BUBBLE**: `"아! 성민 씨 들어오세요."` (DialogueBubble)
/// - **PANEL 1 SOUND EFFECT (SFX ON)**: `"끼익"` (SoundEffect, slanted angle ≈ -18.70°)
/// - **PANEL 2 BACKGROUND ARTWORK SUPPRESSION**: Background wall text `"초진사를 Blaer Pet"` must be filtered out as unreadable artwork noise.
/// - **PANEL 3 DIALOGUE BUBBLE**: `"엉덩이 아프다..."` (DialogueBubble)
/// - **EXACT COUNTS**: Exactly 3 regions (2 dialogue bubbles, 1 sound effect, 0 free text).
#[test]
fn test_regression_page_seongmin_door_creak_sfx_enabled() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_seongmin_door_creak_sfx_enabled.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_seongmin_door_creak_sfx_enabled: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("KO Seongmin Door Creak (SFX ON) detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  [SFX ON] Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}'", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"));
    }

    // 1. EXACT ELEMENT COUNTS: 3 REGIONS (2 DIALOGUE BUBBLES, 1 SOUND EFFECT, 0 FREE TEXT)
    crate::assert_element_counts!(res, 3, 2, 1, 0);

    // 2. DIALOGUE BUBBLE 1: '아! 성민 씨 들어오세요.'
    let b1 = res.regions.iter().find(|r| r.text.contains("성민") || r.text.contains("들어오세요"));
    assert!(b1.is_some(), "Must detect bubble 1 '아! 성민 씨 들어오세요.'");
    let b1 = b1.unwrap();
    crate::assert_region_bounds!(b1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 162, 510, 174, 88, 8);
    crate::assert_bubble_bounds!(b1, 117, 461, 265, 227, 8);

    // 3. SFX 1: '끼익' (Door creak sound)
    let sfx1 = res.regions.iter().find(|r| r.text.contains("끼익") || (r.kind == xianscan_rust::ml::schemas::RegionKind::SoundEffect && r.box_.y < 650));
    assert!(sfx1.is_some(), "Must detect SFX 1 '끼익'");
    let sfx1 = sfx1.unwrap();
    crate::assert_region_bounds!(sfx1, xianscan_rust::ml::schemas::RegionKind::SoundEffect, 510, 479, 114, 84, 8);
    crate::assert_region_angle!(sfx1, -18.7, 3.0);

    // 4. DIALOGUE BUBBLE 2: '엉덩이 아프다...'
    let b2 = res.regions.iter().find(|r| r.text.contains("엉덩이") || r.text.contains("아프다"));
    assert!(b2.is_some(), "Must detect bubble 2 '엉덩이 아프다...'");
    let b2 = b2.unwrap();
    crate::assert_region_bounds!(b2, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 344, 1260, 134, 90, 8);
    crate::assert_bubble_bounds!(b2, 310, 1225, 204, 161, 8);

    // 5. EXPLICIT NEGATIVE GUARDS: BACKGROUND ARTWORK SIGN MUST BE FILTERED
    assert!(!res.regions.iter().any(|r| r.text.contains("초진") || r.text.to_lowercase().contains("blaer")), "Background wall signboard must be filtered");
}

/// # KOREAN REAL-PAGE REGRESSION: `page_seongmin_door_creak_sfx_disabled` (RESOLUTION: 690 × 1848)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **SFX SUPPRESSION (SFX DISABLED)**:
///   - When `enable_sfx = false`, the sound effect `"끼익"` must be suppressed.
///   - Slanted SFX calligraphy must NOT fall back into `free_text`.
/// - **PANEL 2 BACKGROUND ARTWORK SUPPRESSION**: Background wall text `"초진사를 Blaer Pet"` must be filtered out.
/// - **EXACT COUNTS**: Exactly 2 regions (2 dialogue bubbles, 0 sound effects, 0 free text).
#[test]
fn test_regression_page_seongmin_door_creak_sfx_disabled() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_seongmin_door_creak_sfx_disabled.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_seongmin_door_creak_sfx_disabled: fixture not found");
            return;
        }
    };

    let opts_sfx_off = AnalyzeOptions {
        source_lang: Some("ko".to_string()),
        target_lang: Some("en".to_string()),
        enable_sfx: Some(false),
        enable_watermark_inpaint: Some(false),
        inpaint_padding_pct: Some(0.06),
        typeset_padding_pct: Some(0.12),
        ..Default::default()
    };
    let res = get_or_analyze_fixture_with_opts(&img, &opts_sfx_off);
    println!("KO Seongmin Door Creak (SFX OFF) detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  [SFX OFF] Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}'", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"));
    }

    // 1. EXACT ELEMENT COUNTS: 2 REGIONS (2 DIALOGUE BUBBLES, 0 SOUND EFFECTS, 0 FREE TEXT)
    crate::assert_element_counts!(res, 2, 2, 0, 0);

    // 2. DIALOGUE BUBBLE 1: '아! 성민 씨 들어오세요.'
    let b1 = res.regions.iter().find(|r| r.text.contains("성민") || r.text.contains("들어오세요"));
    assert!(b1.is_some(), "Must detect bubble 1 '아! 성민 씨 들어오세요.'");
    let b1 = b1.unwrap();
    crate::assert_region_bounds!(b1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 162, 510, 174, 88, 8);
    crate::assert_bubble_bounds!(b1, 117, 461, 265, 227, 8);

    // 3. DIALOGUE BUBBLE 2: '엉덩이 아프다...'
    let b2 = res.regions.iter().find(|r| r.text.contains("엉덩이") || r.text.contains("아프다"));
    assert!(b2.is_some(), "Must detect bubble 2 '엉덩이 아프다...'");
    let b2 = b2.unwrap();
    crate::assert_region_bounds!(b2, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 344, 1260, 134, 90, 8);
    crate::assert_bubble_bounds!(b2, 310, 1225, 204, 161, 8);

    // 4. EXPLICIT NEGATIVE GUARDS: SFX AND BACKGROUND WALL TEXT MUST NOT BE PRESENT NOR CONVERTED TO FREE TEXT
    assert!(!res.regions.iter().any(|r| r.text.contains("끼익")), "'끼익' SFX must be suppressed when enable_sfx=false");
    assert!(!res.regions.iter().any(|r| r.text.contains("초진") || r.text.to_lowercase().contains("blaer")), "Background wall signboard must be filtered");
}
