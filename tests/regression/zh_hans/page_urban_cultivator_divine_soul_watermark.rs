// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_urban_cultivator_divine_soul_watermark` (RESOLUTION: 827 x 1290)
///
/// ## SCENE CONTEXT:
/// - Rebirth of the Urban Immortal Cultivator (重生之都市修仙)
/// - Top panel credits block:
///   `责编：西瓜\n原著：十里剑神\n改编：小颜老师\n主笔：仲叔\n助理：安多妮亚小冥`
/// - Bottom left dialogue bubble:
///   `左须神社，原来是神\n境强者的神魂通过神\n道转换，存活下来的。`
/// - Bottom right speech bubble (obscured by COLAMANGA.com / ACloudMerge.com watermark):
///   `也是，如果不能踏入先\n天，，最多活到一百八\n十岁。但死去后，神魂\n却可以存活数百年`
///   The final line `却可以存活数百年` is covered by the colored aggregator watermark and
///   must be recovered through crop refinement without watermark text corruption.
///
/// ## STRICT CONSTRAINTS & INVARIANTS:
/// 1. Exactly 3 regions (1 dialogue bubble, 0 SFX, 2 free text).
/// 2. The bottom right dialogue must contain `却可以存活数百年`.
/// 3. Watermark text must NOT be included in translatable regions.
#[test]
fn test_regression_page_urban_cultivator_divine_soul_watermark() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_urban_cultivator_divine_soul_watermark/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Urban Cultivator Divine Soul Watermark detected {} regions:",
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

    // 1. EXACT STRUCTURAL ELEMENT COUNTS (3 TOTAL, 1 BUBBLE, 0 SFX, 2 FREE TEXT)
    crate::assert_element_counts!(res, 3, 1, 0, 2);

    // 2. CREDITS TEXT BLOCK
    let r_credits = res.regions.iter().find(|r| {
        r.text.contains("十里剑神") || r.text.contains("小颜老师")
    });
    assert!(
        r_credits.is_some(),
        "Must detect credits text block '原著：十里剑神'"
    );
    let r0 = r_credits.unwrap();
    crate::assert_region_bounds!(r0, RegionKind::FreeText, 101, 509, 150, 109, 8);

    // 3. LEFT DIALOGUE BUBBLE
    let r_shrine = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.contains("左须神社")
    });
    assert!(
        r_shrine.is_some(),
        "Must detect dialogue bubble '左须神社，原来是神...'"
    );
    let r1 = r_shrine.unwrap();
    crate::assert_region_bounds!(r1, RegionKind::DialogueBubble, 46, 1091, 225, 98, 8);
    crate::assert_bubble_bounds!(r1, 17, 1036, 281, 218, 8);

    // 4. RIGHT DIALOGUE BUBBLE WITH RECOVERED WATERMARK-OBSCURED LINE
    let r_divine_soul = res.regions.iter().find(|r| {
        r.text.contains("不能踏入先") || r.text.contains("最多活到一百八")
    });
    assert!(
        r_divine_soul.is_some(),
        "Must detect right dialogue '也是，如果不能踏入先天...'"
    );
    let r2 = r_divine_soul.unwrap();
    crate::assert_region_bounds!(r2, RegionKind::FreeText, 553, 1102, 245, 104, 8);
    assert!(
        r2.text.contains("存活数百年") || r2.text.contains("却可以存活"),
        "Right dialogue must recover obscured line '却可以存活数百年', got: '{}'",
        r2.text.replace('\n', " ")
    );

    // 5. NEGATIVE GUARDS: NO WATERMARK LEAKAGE
    assert!(
        !res.regions.iter().any(|r| {
            let t = r.text.to_lowercase();
            t.contains("colamanga") || t.contains("acloudmerge") || t.contains("广告最少") || t.contains("观看，最快")
        }),
        "Watermark text must not contaminate any region"
    );
}
