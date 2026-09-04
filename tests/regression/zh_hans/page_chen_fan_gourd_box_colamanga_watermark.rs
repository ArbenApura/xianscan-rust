// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: page_chen_fan_gourd_box_colamanga_watermark (RESOLUTION: 827 x 1285)
///
/// ## SCENE CONTEXT:
/// - Rebirth of the Urban Immortal Cultivator (重生之都市修仙)
/// - Top gutter: Red aggregator watermark colamanga.com观看，最快最稳，广告最少
/// - Bottom right: Colored aggregator watermark COLAMANGA.com / AcloudMerge.com
/// - Dialogue bubble 1 (left): 陈先生，三千万就买这个，太不值了吧。
/// - Dialogue bubble 2 (bottom right): 郑少听说你得了件法器，我特地赶来一看啊。
///
/// ## INVARIANTS:
/// 1. Exactly 2 dialogue bubbles.
/// 2. Watermark text must NOT be included in translatable regions.
#[test]
fn test_regression_page_chen_fan_gourd_box_colamanga_watermark() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_chen_fan_gourd_box_colamanga_watermark/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Chen Fan Gourd Box Colamanga Watermark detected {} regions:",
        res.regions.len()
    );
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    crate::assert_element_counts!(res, 2, 2, 0, 0);

    // Dialogue Bubble 1: "陈先生，三千万就买这个，太不值了吧。"
    let r1 = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("陈先生") || r.text.contains("三千万") || r.text.contains("太不值"))
    });
    assert!(
        r1.is_some(),
        "Must detect dialogue bubble '陈先生，三千万就买这个，太不值了吧。'"
    );

    // Dialogue Bubble 2: "郑少听说你得了件法器，我特地赶来一看啊。"
    let r2 = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("郑少") || r.text.contains("法器") || r.text.contains("赶来一看"))
    });
    assert!(
        r2.is_some(),
        "Must detect dialogue bubble '郑少听说你得了件法器，我特地赶来一看啊。'"
    );

    // Watermark text must NOT leak into translatable regions
    assert!(
        !res.regions.iter().any(|r| {
            let t = r.text.to_lowercase();
            t.contains("colamanga") || t.contains("acloudmerge") || t.contains("广告最少") || t.contains("最快最稳")
        }),
        "Watermark text must not be present in translatable regions"
    );

    // 3. VERIFY BUBBLE CAVITY CLEANING & BOUNDARY PRESERVATION
    crate::assert_bubble_cleaned!(&img, &res);
}
