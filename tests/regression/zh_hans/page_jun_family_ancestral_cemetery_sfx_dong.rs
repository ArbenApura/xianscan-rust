// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # CHINESE REAL-PAGE REGRESSION: `page_jun_family_ancestral_cemetery_sfx_dong` (RESOLUTION: 900 × 1871)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **RECTANGULAR NARRATION CARD**:
///   `"君家\n祖地墓园"`
/// - **SUPPRESSED SOUND EFFECTS & WATERMARKS**:
///   The vertical gold sound effect on the trees (`"咚\n咚"`) and gate artwork must NOT be detected as text.
/// - **EXACT COUNTS**: Exactly 1 region.
#[test]
fn test_regression_page_jun_family_ancestral_cemetery_sfx_dong() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_jun_family_ancestral_cemetery_sfx_dong/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_jun_family_ancestral_cemetery_sfx_dong: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!("Chinese Jun Family Cemetery Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 1 REGION (0 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 1 FREETEXT)
    crate::assert_element_counts!(res, 1, 0, 0, 1);

    // 2. NARRATION CARD VERIFICATION: [X: 579, Y: 544, W: 170, H: 104]
    let card = res.regions.iter().find(|r| r.text.contains("君家") || r.text.contains("祖地墓园"));
    assert!(card.is_some(), "Must detect rectangular narration card '君家\n祖地墓园'");
    let card = card.unwrap();
    assert!(card.text.contains("君家"));
    assert!(card.text.contains("墓园") || card.text.contains("祖地"));
    crate::assert_region_bounds!(
        card,
        xianscan_rust::ml::schemas::RegionKind::FreeText,
        579,
        544,
        170,
        104,
        15
    );
    crate::assert_region_angle!(card, 0.0, 1.5);

    // 3. SOUND EFFECT SUPPRESSION CHECK
    assert!(
        !res.regions.iter().any(|r| r.text.contains("冬") || r.text.contains("峰") || r.text.contains("咚") || r.text.contains("祖墓")),
        "Sound effect '咚/冬/峰' and artwork gate text must be filtered out"
    );
}
