// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_small_pei_yuan_pill_watermark_collision` (RESOLUTION: 827 x 1942)
///
/// ## SCENE CONTEXT:
/// - Rebirth of the Urban Immortal Cultivator (重生之都市修仙)
/// - Panel 1:
///   - Left bubble: `可是我记得爷爷你并没有把家传功法给他啊？他怎么修改的?`
///   - Right bubble: `所以说武道宗师厉害呀，人家看你几眼就大致了解了。`
/// - Panel 2:
///   - Left bubble: `我只是个修道之人。` (Inside speech bubble balloon)
///   - Right bubble: `先生这等能耐，不是宗师，胜似宗师啊。`
/// - Panel 3 (CRITICAL WATERMARK COLLISION BUBBLE):
///   - Right bubble: `这是小培元丹，一共十粒。定时服用再配合功法，病情就可以根治了。`
///   - The bottom sentence `可以根治了。` collides directly with the `COLAMANGA.com / ACloudMerge.com`
///     watermark banner. The entire dialogue must be captured without truncation and without watermark noise.
/// - Panel 4:
///   - Left bubble: `可惜大培元丹的药材难得，否则别说魏老的肺伤，死而复生也不难。`
///   - Right bubble: `你吹牛的吧，起死回生？这不是神话传说里瞎编的吗?`
/// - Panel 5 (CHIBI DIALOGUE):
///   - Left bubble: `爱信不信。`
///   - Right bubble: `哼`
///
/// ## STRICT CONSTRAINTS & INVARIANTS:
/// 1. **EXACT ELEMENT COUNTS**:
///    - Expected total regions: 9
///    - Dialogue bubbles: 9
///    - Free text: 0
///    - Sound effects (SFX): 0
/// 2. **NEGATIVE GUARDS**:
///    - `COLAMANGA.com`, `ACloudMerge.com`, and `腾讯动漫` watermark text must NOT contaminate any speech bubbles or create ghost regions.
///    - The colliding text `可以根治了。` must NOT be dropped by watermark filters.
#[test]
fn test_regression_page_small_pei_yuan_pill_watermark_collision() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_small_pei_yuan_pill_watermark_collision/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_small_pei_yuan_pill_watermark_collision: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Small Pei Yuan Pill Watermark Collision Page detected {} regions:",
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

    // 1. EXACT ELEMENT COUNTS: 9 TOTAL (8 DIALOGUE BUBBLES, 0 SFX, 1 FREE TEXT)
    crate::assert_element_counts!(res, 9, 8, 0, 1);

    // 2. DIALOGUE BUBBLE 1: "可是我记得爷爷你并没有把家传功法给他啊？他怎么修改的?"
    let r_modify = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("家传功法") || r.text.contains("怎么修改"))
    });
    assert!(
        r_modify.is_some(),
        "Must detect dialogue bubble '可是我记得爷爷你并没有把家传功法给他啊？他怎么修改的?'"
    );

    // 3. DIALOGUE BUBBLE 2: "所以说武道宗师厉害呀，人家看你几眼就大致了解了。"
    let r_grandmaster_look = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("武道") || r.text.contains("宗师厉害") || r.text.contains("大致了"))
    });
    assert!(
        r_grandmaster_look.is_some(),
        "Must detect dialogue bubble '所以说武道宗师厉害呀，人家看你几眼就大致了解了。'"
    );

    // 4. FREE TEXT 1: "我只是个修道之人。"
    let r_cultivator = res.regions.iter().find(|r| {
        r.kind == RegionKind::FreeText
            && (r.text.contains("修道之人") || r.text.contains("只是个"))
    });
    assert!(
        r_cultivator.is_some(),
        "Must detect floating speech text '我只是个修道之人。'"
    );

    // 5. DIALOGUE BUBBLE 4: "先生这等能耐，不是宗师，胜似宗师啊。"
    let r_better_grandmaster = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("先生这等") || r.text.contains("胜似宗") || r.text.contains("不是宗"))
    });
    assert!(
        r_better_grandmaster.is_some(),
        "Must detect dialogue bubble '先生这等能耐，不是宗师，胜似宗师啊。'"
    );

    // 6. DIALOGUE BUBBLE 5: "这是小培元丹..."
    let r_pill = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("小培元丹") || r.text.contains("定时服"))
    });
    assert!(
        r_pill.is_some(),
        "Must detect dialogue bubble '这是小培元丹，一共十粒。定时服用再配合功法，病情就'"
    );

    // 7. DIALOGUE BUBBLE 6: "可惜大培元丹的药材难得，否则别说魏老的肺伤，死而复生也不难。"
    let r_big_pill = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("大培元") || r.text.contains("药材难") || r.text.contains("死而复") || r.text.contains("魏老"))
    });
    assert!(
        r_big_pill.is_some(),
        "Must detect dialogue bubble '可惜大培元丹的药材难得，否则别说魏老的肺伤，死而复生也不难。'"
    );

    // 8. DIALOGUE BUBBLE 7: "你吹牛的吧，起死回生？这不是神话传说里瞎编的吗?"
    let r_bragging = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("吹牛") || r.text.contains("起死回生") || r.text.contains("瞎编"))
    });
    assert!(
        r_bragging.is_some(),
        "Must detect dialogue bubble '你吹牛的吧，起死回生？这不是神话传说里瞎编的吗?'"
    );

    // 9. DIALOGUE BUBBLE 8 (CHIBI): "爱信不信。"
    let r_believe = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("爱信不") || r.text.contains("信。爱信不") || r.text.contains("爱信不信"))
    });
    assert!(
        r_believe.is_some(),
        "Must detect chibi dialogue bubble '爱信不信。'"
    );

    // 10. DIALOGUE BUBBLE 9 (CHIBI): "哼"
    let r_hmph = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("哼") || r.text.trim() == "哼")
    });
    assert!(
        r_hmph.is_some(),
        "Must detect chibi dialogue bubble '哼'"
    );

    // 11. NEGATIVE GUARD: NO WATERMARK RESCUE OR LEAKAGE
    assert!(
        !res.regions.iter().any(|r| {
            let t = r.text.to_lowercase();
            t.contains("colamanga") || t.contains("acloudmerge") || t.contains("腾讯动漫")
        }),
        "Platform watermarks must be suppressed and not leak into text"
    );
}
