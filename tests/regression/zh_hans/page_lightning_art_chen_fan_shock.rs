// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_lightning_art_chen_fan_shock` (RESOLUTION: 827 x 1255)
///
/// ## SCENE CONTEXT:
/// - Rebirth of the Urban Immortal Cultivator (重生之都市修仙)
/// - Top panel: Cultivator struck by lightning shouting `啊！` (SFX / shout: completely banned / suppressed).
/// - Middle panel: Cultivator kneeling in shock seeing Celestial Master lightning: `天……天师道的雷法!`.
/// - Bottom panel: Cultivator kowtowing begging for mercy: `弟子再也不敢了...`, `大师饶命，`.
///   Bystanders in background shock reaction free-text: `这！陈凡？天哪！` and `这！陈凡？`.
///
/// ## STRICT CONSTRAINTS & INVARIANTS:
/// 1. **EXACT ELEMENT COUNTS**:
///    - Expected total regions: 5
///    - Dialogue bubbles: 3 (`天……天师道的雷法!`, `弟子再也不敢了...`, `大师饶命`)
///    - Sound effects (SFX): 0 (SFX is strictly banned/suppressed across all panels)
///    - Free text: 2 (Bystander shock reactions: `这！陈凡？天哪！` and `这！陈凡？`)
/// 2. **NEGATIVE GUARDS**:
///    - `啊！` in the top panel must be filtered out as SFX/shout noise (0 SFX policy).
///    - Aggregator watermarks `COLAMANGA.com` and `ACloudMerge.com` in the middle gutter must be suppressed.
///    - Publisher watermark `腾讯动漫` in the middle right margin must be suppressed.
///    - Lightning burst strokes and robes must not generate hallucinated glyph fragments.
#[test]
fn test_regression_page_lightning_art_chen_fan_shock() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_lightning_art_chen_fan_shock/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_lightning_art_chen_fan_shock: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Lightning Art Chen Fan Shock Page detected {} regions:",
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

    // 1. EXACT ELEMENT COUNTS: 5 TOTAL REGIONS (3 DIALOGUE BUBBLES, 0 SFX, 2 FREE TEXT)
    crate::assert_element_counts!(res, 5, 3, 0, 2);

    // 2. DIALOGUE BUBBLE 1: CELESTIAL MASTER LIGHTNING ART
    let r_lightning = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("师道") || r.text.contains("雷法") || r.text.contains("天……天"))
    });
    assert!(
        r_lightning.is_some(),
        "Must detect middle panel dialogue bubble '天……天师道的雷法!'"
    );

    // 3. DIALOGUE BUBBLE 2: DISCIPLE DARES NOT AGAIN
    let r_disciple = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("弟子") || r.text.contains("再也不敢"))
    });
    assert!(
        r_disciple.is_some(),
        "Must detect bottom right dialogue bubble '弟子再也不敢了...'"
    );

    // 4. DIALOGUE BUBBLE 3: MASTER SPARE MY LIFE
    let r_spare = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("大师") || r.text.contains("饶命"))
    });
    assert!(
        r_spare.is_some(),
        "Must detect bottom center dialogue bubble '大师饶命'"
    );

    // 5. FREE TEXT 1: BYSTANDER REACTION "这！陈凡？天哪！"
    let r_reaction1 = res.regions.iter().find(|r| {
        r.kind == RegionKind::FreeText
            && r.text.contains("陈凡")
            && (r.text.contains("天哪") || r.text.contains("这！"))
            && r.box_.y < 1000
    });
    assert!(
        r_reaction1.is_some(),
        "Must detect upper bystander shock reaction '这！陈凡？天哪！' as FreeText"
    );

    // 6. FREE TEXT 2: BYSTANDER REACTION "这！陈凡？"
    let r_reaction2 = res.regions.iter().find(|r| {
        r.kind == RegionKind::FreeText
            && r.text.contains("陈凡")
            && r.box_.y >= 1000
    });
    assert!(
        r_reaction2.is_some(),
        "Must detect bottom-left bystander shock reaction '这！陈凡？' as FreeText"
    );

    // 7. NEGATIVE GUARD: NO SFX / SCREAM "啊！" DETECTED (STRICT 0 SFX POLICY)
    assert!(
        !res.regions.iter().any(|r| {
            let t = r.text.trim();
            t == "啊！" || t == "啊!" || t == "啊"
        }),
        "Top panel scream '啊！' must be suppressed under 0 SFX policy"
    );

    // 8. NEGATIVE GUARD: NO WATERMARK RESCUE
    assert!(
        !res.regions.iter().any(|r| {
            r.text.to_lowercase().contains("colamanga")
                || r.text.to_lowercase().contains("acloudmerge")
                || r.text.contains("腾讯动漫")
        }),
        "Aggregator watermarks must be suppressed"
    );
}
