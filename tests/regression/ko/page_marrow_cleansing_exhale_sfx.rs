// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_marrow_cleansing_exhale_sfx` (RESOLUTION: 690 × 1913)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP NARRATION BOX**: `"허나,"` (Narration transition)
/// - **BOTTOM NARRATION BOX**: `"환골탈태를 위해\n임독양맥을 뚫으려면\n삼 갑자의 내공이 필요하다."` (Martial arts requirements)
/// - **EXHALE SFX SUPPRESSION**: Floating Korean sound effects (`"후우"` / `"후i"`) on character hair/artwork must be filtered out.
#[test]
fn test_regression_page_marrow_cleansing_exhale_sfx() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_marrow_cleansing_exhale_sfx/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_marrow_cleansing_exhale_sfx: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Marrow Cleansing Exhale SFX Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 2 REGIONS (2 FREETEXT / NARRATION REGIONS, 0 SFX)
    crate::assert_element_counts!(res, 2, 0, 2);

    // 2. NEGATIVE GUARD: NO BACKGROUND EXHALE SFX '후우' OR '후i' EXTRACTED AS REGIONS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("후우") || r.text.contains("후i") || r.text.trim() == "후"),
        "Must NOT extract floating exhale SFX '후우' / '후i'"
    );

    // 3. TOP NARRATION BOX: [X: 67, Y: 480, W: 108, H: 66]
    let top_box = res.regions.iter().find(|r| r.text.contains("허나"));
    assert!(top_box.is_some(), "Must detect top narration box '허나,'");
    let top_box = top_box.unwrap();
    assert_eq!(top_box.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(top_box, RegionKind::FreeText, 67, 480, 108, 66, 25);

    // 4. BOTTOM NARRATION BOX: [X: 122, Y: 1552, W: 459, H: 153]
    let bot_box = res.regions.iter().find(|r| r.text.contains("환골탈태") || r.text.contains("임독양맥") || r.text.contains("삼 갑자"));
    assert!(bot_box.is_some(), "Must detect bottom narration box about marrow cleansing and meridians");
    let bot_box = bot_box.unwrap();
    assert_eq!(bot_box.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(bot_box, RegionKind::FreeText, 122, 1552, 459, 153, 25);
}
