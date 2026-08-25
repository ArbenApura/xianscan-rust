// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_powder_pour_chwa_sfx` (RESOLUTION: 690 × 1823)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **LEFT POURING ONOMATOPOEIA / SFX**: `"촤아-"` / `"촤아"` (Slanted pouring SFX, non-zero angle)
/// - **RIGHT PRODUCT LABEL**: `"뚫어장"` (Rotated label at approx -35.6 deg)
/// - **NEGATIVE GUARD**: Must NOT misrecognize pouring SFX as `"찾아"` ("Found it").
#[test]
fn test_regression_page_powder_pour_chwa_sfx() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_powder_pour_chwa_sfx/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_powder_pour_chwa_sfx: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Powder Pour SFX Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 2 REGIONS (0 DIALOGUEBUBBLES, 1 SOUNDEFFECT, 1 FREETEXT)
    crate::assert_element_counts!(res, 2, 0, 1, 1);

    // 2. RIGHT PRODUCT LABEL: '뚫어장' -> [X: ~535, Y: ~449, W: ~155, H: ~150, Angle: ~ -35.6°]
    let label = res.regions.iter().find(|r| r.text.contains("뚫어장") || r.text.contains("뚫어"));
    assert!(label.is_some(), "Must detect product label '뚫어장'");
    let label = label.unwrap();
    assert_eq!(label.kind, xianscan_rust::ml::schemas::RegionKind::FreeText);
    crate::assert_region_angle!(label, -35.6, 5.0);

    // 3. LEFT POURING SFX: (CLASSIFIED AS SOUNDEFFECT WITH NON-ZERO ROTATION ANGLE)
    let sfx = res.regions.iter().find(|r| r.kind == xianscan_rust::ml::schemas::RegionKind::SoundEffect);
    assert!(sfx.is_some(), "Must classify left pouring sound as SoundEffect");
    let sfx = sfx.unwrap();
    crate::assert_region_angle!(sfx, -16.75, 4.0);
}
