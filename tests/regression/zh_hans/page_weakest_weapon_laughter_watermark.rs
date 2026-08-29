// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_weakest_weapon_laughter_watermark` (RESOLUTION: 858 × 1024)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 UPPER DIALOGUE BUBBLE**: `"这么弱只会\n拖累自己的队友"` (DialogueBubble, 2 lines).
/// - **PANEL 2 MIDDLE DIALOGUE BUBBLE**: `"他不是绰号\n“人类最弱兵器”？"` (DialogueBubble, 2 lines).
/// - **PANEL 3 BOTTOM DIALOGUE BUBBLE**: `"哈哈哈哈最弱兵器\n笑死人了！"` (DialogueBubble, 2 lines).
/// - **WATERMARK SUPPRESSION**:
///   1. Must filter out translucent clothing watermark `"快看! 快看漫画"` / `"快刮!快看慢画"`.
///   2. Must filter out overlapping aggregator watermark `"COLAMANHUA.com"` / `"ACloudMerge.com"`.
/// - **EXACT COUNTS**: Exactly 3 regions (3 dialogue bubbles, 0 sound effects, 0 free text).
#[test]
fn test_regression_page_weakest_weapon_laughter_watermark() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_weakest_weapon_laughter_watermark/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_weakest_weapon_laughter_watermark: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Weakest Weapon Page detected {} regions:",
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 3 REGIONS (3 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT)
    crate::assert_element_counts!(res, 3, 3, 0, 0);

    // 2. UPPER DIALOGUE BUBBLE: '这么弱只会\n拖累自己的队友'
    let b1 = res
        .regions
        .iter()
        .find(|r| r.text.contains("这么弱只会") || r.text.contains("拖累自己的队友"));
    assert!(
        b1.is_some(),
        "Must detect upper dialogue bubble '这么弱只会\\n拖累自己的队友'"
    );
    let b1 = b1.unwrap();
    assert_eq!(b1.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b1, RegionKind::DialogueBubble, 487, 80, 301, 128, 15);

    // 3. MIDDLE DIALOGUE BUBBLE: '他不是绰号\n“人类最弱兵器”？'
    let b2 = res
        .regions
        .iter()
        .find(|r| r.text.contains("他不是绰号") || (r.text.contains("最弱兵器") && r.text.contains("人类")));
    assert!(
        b2.is_some(),
        "Must detect middle dialogue bubble '他不是绰号\\n“人类最弱兵器”？'"
    );
    let b2 = b2.unwrap();
    assert_eq!(b2.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b2, RegionKind::DialogueBubble, 124, 357, 397, 144, 15);

    // 4. BOTTOM DIALOGUE BUBBLE: '哈哈哈哈最弱兵器\n笑死人了！'
    let b3 = res
        .regions
        .iter()
        .find(|r| r.text.contains("笑死人了") || r.text.contains("哈哈哈哈"));
    assert!(
        b3.is_some(),
        "Must detect bottom dialogue bubble '哈哈哈哈最弱兵器\\n笑死人了！'"
    );
    let b3 = b3.unwrap();
    assert_eq!(b3.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b3, RegionKind::DialogueBubble, 211, 802, 363, 136, 15);

    // 5. NEGATIVE GUARD: NO WATERMARK OR FREETEXT HALLUCINATIONS
    assert!(
        !res.regions.iter().any(|r| {
            r.kind == RegionKind::FreeText
                || r.text.contains("快看")
                || r.text.contains("快刮")
                || r.text.contains("COLAMANHUA")
                || r.text.contains("ACloudMerge")
        }),
        "Must NOT detect clothing watermark or aggregator logos as free text"
    );
}
