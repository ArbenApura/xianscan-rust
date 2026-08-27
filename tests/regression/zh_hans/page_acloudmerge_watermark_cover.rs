// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_acloudmerge_watermark_cover` (RESOLUTION: 800 x 1427)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **FULL-COLOR MANGA COVER / SPLASH PAGE**: Single character artwork with zero speech bubbles or dialogue.
/// - **ZERO REGIONS**: Must detect exactly 0 regions. No dialogue, SFX, or free text exists.
/// - **NEGATIVE GUARD**: Must NOT extract the large bottom-left ACloudMerge platform watermark
///   (`"儿云数据"` / `"集云数据"` / `"云数据"`) as a free text region.
///   The OCR misreads the decorative calligraphic `集` glyph as `儿`, causing the
///   string `"儿云数据"` to bypass the `集云数据` watermark keyword filter.
/// - **BOUNDARY CONDITION**: The watermark box sits at `y=1269, h=122` on an `800x1427` page
///   (`y+h=1391`), placing it within the bottom ~2.5% margin. The bottom-margin suppressor
///   previously only fired for tiny strips (`h < 25`), missing this large platform logo stamp.
#[test]
fn test_regression_page_acloudmerge_watermark_cover() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_acloudmerge_watermark_cover/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_acloudmerge_watermark_cover: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "ACloudMerge Cover Page detected {} regions:",
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 0 REGIONS (0 DIALOGUE BUBBLES, 0 SOUND EFFECTS, 0 FREE TEXT)
    crate::assert_element_counts!(res, 0, 0, 0, 0);

    // 2. NEGATIVE GUARD: NO ACLOUDMERGE WATERMARK HALLUCINATION
    // Catches OCR variants: "儿云数据", "集云数据", "云数据", "ACloudMerge", "acloud"
    assert!(
        !res.regions.iter().any(|r| {
            r.text.contains("云数据")
                || r.text.contains("集云")
                || r.text.contains("ACloud")
                || r.text.contains("acloud")
        }),
        "Must NOT extract ACloudMerge bottom watermark logo as a free text region"
    );

    // 3. NEGATIVE GUARD: NO TOP HEADER WATERMARK HALLUCINATION
    // Catches "请至集云数据(acloudmerge.com)观看" redirect header
    assert!(
        !res.regions
            .iter()
            .any(|r| r.text.contains("acloudmerge") || r.text.contains("观看")),
        "Must NOT extract top platform redirect header as a text region"
    );

    // 4. NEGATIVE GUARD: NO TENCENT MANKE DIAGONAL WATERMARK
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客") || r.text.contains("腾讯")),
        "Must NOT extract diagonal Tencent Manke watermark as a text region"
    );
}
