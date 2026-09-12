// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_gu_fei_curtain_waving_jiudengle_bubble` (RESOLUTION: 800 × 1586)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL LOWER-RIGHT SPEECH BUBBLE**:
///   `"久等了!"` (or `"久等了！"`, RegionKind::DialogueBubble).
///   - MUST NOT hallucinate opening or closing parentheses around the speech text (e.g. `"(久等了!)"`).
///   - Speech balloon border curve must not be recognized as punctuation.
/// - **EXACT COUNTS**: EXACTLY 1 REGION TOTAL (1 DIALOGUE BUBBLE).
#[test]
fn test_regression_page_gu_fei_curtain_waving_jiudengle_bubble() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_gu_fei_curtain_waving_jiudengle_bubble/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_gu_fei_curtain_waving_jiudengle_bubble: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Gu Fei Curtain Waving Page detected {} regions:",
        res.regions.len()
    );
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}°, box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 1 REGION TOTAL (1 DIALOGUE BUBBLE)
    assert_eq!(
        res.regions.len(),
        1,
        "Expected exactly 1 region total, got {}",
        res.regions.len()
    );
    let r = &res.regions[0];
    assert_eq!(r.kind, RegionKind::DialogueBubble);

    // 2. TEXT VERIFICATION: MUST CAPTURE '久等了' AND MUST NOT HALLUCINATE PARENTHESES
    assert!(
        r.text.contains("久等了"),
        "Expected region text to contain '久等了', got '{}'",
        r.text
    );
    assert!(
        !r.text.contains('(') && !r.text.contains(')'),
        "Must not hallucinate half-width parentheses in '{}'",
        r.text
    );
    assert!(
        !r.text.contains('（') && !r.text.contains('）'),
        "Must not hallucinate full-width parentheses in '{}'",
        r.text
    );

    // 3. REGION BOUNDS CLAMPING
    crate::assert_region_bounds!(r, RegionKind::DialogueBubble, 543, 1363, 192, 96, 25);
    crate::assert_bubble_bounds!(r, 560, 1352, 156, 122, 25);
}
