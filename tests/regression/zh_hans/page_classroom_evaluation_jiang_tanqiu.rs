// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_classroom_evaluation_jiang_tanqiu` (RESOLUTION: 827 x 1256)
///
/// ## SCENE CONTEXT:
/// - Rebirth of the Urban Immortal Cultivator (重生之都市修仙)
/// - Top panel: Classroom setting where classmates silently judge Chen Fan with 4 mandatory floating comment labels:
///   1. `平平无奇。`
///   2. `长相一般。` (MUST detect, floating near top right student)
///   3. `没钱没权。`
///   4. `没意思，不值得交往。`
/// - Bottom left panel: Blue-haired student Jiang Tanqiu talking to Chen Fan:
///   `陈凡？你这自我介绍也太简单了吧，` and `怎么吸引妹子们的注意力?`
/// - Bottom right panel: Jiang Tanqiu bragging about his nightclub nickname:
///   `算了。我叫蒋谈秋，人送外号“夜店小王子”` and `这楚州的夜店场子没有我不知道的。`
/// - Top margin watermark: `colamanga.com观看，最快最稳，广告最少` (must be suppressed).
/// - Bottom margin watermarks: `COLAMANGA.com`, `ACloudMerge.com`, `腾讯动漫` (must be suppressed).
///
/// ## STRICT CONSTRAINTS & INVARIANTS:
/// 1. **EXACT ELEMENT COUNTS**:
///    - Expected total regions: 8
///    - Dialogue bubbles: 4 (`陈凡？你这自我介绍...`, `怎么吸引妹子...`, `算了。我叫蒋谈秋...`, `这楚州的夜店场子...`)
///    - Free text: 4 mandatory floating classroom evaluation labels (`平平无奇。`, `长相一般。`, `没钱没权。`, `没意思，不值得交往。`)
///    - Sound effects (SFX): 0
/// 2. **NEGATIVE GUARDS**:
///    - Top header watermark `colamanga.com观看，最快最稳，广告最少` or `最快最稳，广告最少` must NOT be extracted.
///    - Gutter aggregator watermarks `COLAMANGA.com`, `ACloudMerge.com`, `腾讯动漫` must be suppressed.
///    - Desks and classroom background lines must not produce hallucinated noise regions.
#[test]
fn test_regression_page_classroom_evaluation_jiang_tanqiu() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_classroom_evaluation_jiang_tanqiu/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_classroom_evaluation_jiang_tanqiu: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Classroom Evaluation Jiang Tanqiu Page detected {} regions:",
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

    // 1. EXACT ELEMENT COUNTS: 8 TOTAL (4 DIALOGUE BUBBLES, 0 SFX, 4 FREE TEXT)
    crate::assert_element_counts!(res, 8, 4, 0, 4);

    // 2. DIALOGUE BUBBLE 1: CHEN FAN SELF INTRODUCTION TOO SIMPLE
    let r_intro = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("自我介绍") || r.text.contains("陈凡？") || r.text.contains("简单了吧"))
    });
    assert!(
        r_intro.is_some(),
        "Must detect dialogue bubble '陈凡？你这自我介绍也太简单了吧，'"
    );

    // 3. DIALOGUE BUBBLE 2: ATTRACT GIRLS ATTENTION
    let r_attract = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("吸引妹子") || r.text.contains("注意力") || r.text.contains("妹子"))
    });
    assert!(
        r_attract.is_some(),
        "Must detect dialogue bubble '怎么吸引妹子们的注意力?'"
    );

    // 4. DIALOGUE BUBBLE 3: JIANG TANQIU NIGHTCLUB PRINCE
    let r_prince = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("蒋谈秋") || r.text.contains("夜店小王子") || r.text.contains("人送外号"))
    });
    assert!(
        r_prince.is_some(),
        "Must detect dialogue bubble '算了。我叫蒋谈秋，人送外号“夜店小王子”'"
    );

    // 5. DIALOGUE BUBBLE 4: CHUZHOU NIGHTCLUBS
    let r_chuzhou = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("楚州") || r.text.contains("夜店场子") || r.text.contains("不知道的"))
    });
    assert!(
        r_chuzhou.is_some(),
        "Must detect dialogue bubble '这楚州的夜店场子没有我不知道的。'"
    );

    // 6. FREE TEXT 1: PLAIN AND ORDINARY
    let r_ordinary = res.regions.iter().find(|r| {
        r.kind == RegionKind::FreeText
            && r.text.contains("平平无奇")
    });
    assert!(
        r_ordinary.is_some(),
        "Must detect floating classroom comment '平平无奇。'"
    );

    // 7. FREE TEXT 2: AVERAGE LOOKS (MANDATORY)
    let r_looks = res.regions.iter().find(|r| {
        r.kind == RegionKind::FreeText
            && (r.text.contains("长相一般") || r.text.contains("长相") || r.text.contains("一般"))
    });
    assert!(
        r_looks.is_some(),
        "Must detect floating classroom comment '长相一般。'"
    );

    // 8. FREE TEXT 3: NO MONEY NO POWER
    let r_no_money = res.regions.iter().find(|r| {
        r.kind == RegionKind::FreeText
            && (r.text.contains("没钱没权") || r.text.contains("没钱"))
    });
    assert!(
        r_no_money.is_some(),
        "Must detect floating classroom comment '没钱没权。'"
    );

    // 9. FREE TEXT 4: BORING NOT WORTH SOCIALIZING
    let r_boring = res.regions.iter().find(|r| {
        r.kind == RegionKind::FreeText
            && (r.text.contains("没意思") || r.text.contains("不值得交往"))
    });
    assert!(
        r_boring.is_some(),
        "Must detect floating classroom comment '没意思，不值得交往。'"
    );

    // 10. NEGATIVE GUARD: NO TOP PLATFORM HEADER WATERMARK RESCUE
    assert!(
        !res.regions.iter().any(|r| {
            let t = r.text.to_lowercase();
            t.contains("colamanga")
                || t.contains("最快最稳")
                || t.contains("广告最少")
                || t.contains("观看")
        }),
        "Top site redirect header watermark must NOT be extracted as text"
    );

    // 11. NEGATIVE GUARD: NO BOTTOM AGGREGATOR WATERMARKS
    assert!(
        !res.regions.iter().any(|r| {
            let t = r.text.to_lowercase();
            t.contains("acloudmerge") || t.contains("腾讯动漫")
        }),
        "Bottom platform watermarks must be suppressed"
    );
}
