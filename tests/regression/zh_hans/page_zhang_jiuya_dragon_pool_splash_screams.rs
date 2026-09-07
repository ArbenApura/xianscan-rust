// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: page_zhang_jiuya_dragon_pool_splash_screams (RESOLUTION: 900 × 1636)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 NARRATION BOXES**:
///   1. Top left: "三日后\n龙池。" (DialogueBubble, vertical).
///   2. Top right: "无数人类武者，从\n世界各地赶来，想\n见证陈北玄踏龙池，\n屠秘境的壮举。" (DialogueBubble).
/// - **PANEL 3 SPLASH REACTION BUBBLES**:
///   1. Left small spiky bubble: "啊！" (DialogueBubble, single CJK character + exclamation).
///   2. Right reaction bubble: "啊——" / "啊一" (DialogueBubble).
/// - **PANEL 4 DIALOGUE & INTRO**:
///   1. Left bubble: "擅闯龙池者，\n杀!" (DialogueBubble).
///   2. Right bubble: "张九崖，如今人类\n强者齐聚于此，你\n以为你自己一人就\n能抵挡？" (DialogueBubble).
///   3. Bottom left vertical box: "长白老龙最疼爱\n的后辈，张九崖，\n境界地仙。" (DialogueBubble, vertical).
/// - **WATERMARK SUPPRESSION**:
///   Must filter out aggregator logo "COLAMANGA.com" and "AcloudMerge.com".
/// - **EXACT COUNTS**: Exactly 7 regions (7 dialogue bubbles, 0 sound effects, 0 free text).
#[test]
fn test_regression_page_zhang_jiuya_dragon_pool_splash_screams() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_zhang_jiuya_dragon_pool_splash_screams/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_zhang_jiuya_dragon_pool_splash_screams: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Dragon Pool Splash Screams Page detected {} regions:",
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 7 REGIONS (7 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT)
    crate::assert_element_counts!(res, 7, 7, 0, 0);

    // 2. PANEL 1 TOP-LEFT: '三日后\n龙池。'
    let r1 = res.regions.iter().find(|r| r.text.contains("三日后") || r.text.contains("龙池"));
    assert!(r1.is_some(), "Must detect panel 1 top-left '三日后\\n龙池。'");
    let r1 = r1.unwrap();
    assert_eq!(r1.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r1, RegionKind::DialogueBubble, 67, 57, 72, 94, 20);

    // 3. PANEL 1 TOP-RIGHT: '无数人类武者...'
    let r2 = res.regions.iter().find(|r| r.text.contains("无数人类武者") || r.text.contains("踏龙池"));
    assert!(r2.is_some(), "Must detect panel 1 top-right '无数人类武者...'");
    let r2 = r2.unwrap();
    assert_eq!(r2.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r2, RegionKind::DialogueBubble, 627, 389, 209, 121, 20);

    // 4. PANEL 3 LEFT SPLASH BUBBLE: '啊！'
    let r3 = res.regions.iter().find(|r| {
        r.box_.y >= 950
            && r.box_.y <= 1150
            && r.box_.x <= 200
            && (r.text.contains("啊") || r.text.contains('!'))
    });
    assert!(
        r3.is_some(),
        "Must detect panel 3 left splash bubble '啊！'"
    );
    let r3 = r3.unwrap();
    assert_eq!(r3.kind, RegionKind::DialogueBubble);

    // 5. PANEL 3 RIGHT SPLASH BUBBLE: '啊——' / '啊一'
    let r4 = res.regions.iter().find(|r| {
        r.box_.y >= 1050
            && r.box_.y <= 1150
            && r.box_.x >= 250
            && r.box_.x <= 450
            && r.text.contains("啊")
    });
    assert!(
        r4.is_some(),
        "Must detect panel 3 right splash bubble '啊——'"
    );
    let r4 = r4.unwrap();
    assert_eq!(r4.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r4, RegionKind::DialogueBubble, 311, 1081, 74, 40, 20);

    // 6. PANEL 4 LEFT BUBBLE: '擅闯龙池者，\n杀!'
    let r5 = res.regions.iter().find(|r| r.text.contains("擅闯龙池者") || r.text.contains("杀!"));
    assert!(r5.is_some(), "Must detect panel 4 left bubble '擅闯龙池者，\\n杀!'");
    let r5 = r5.unwrap();
    assert_eq!(r5.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r5, RegionKind::DialogueBubble, 145, 1309, 111, 64, 20);

    // 7. PANEL 4 RIGHT BUBBLE: '张九崖，如今人类强者齐聚于此...'
    let r6 = res.regions.iter().find(|r| r.text.contains("如今人类") || r.text.contains("强者齐聚"));
    assert!(r6.is_some(), "Must detect panel 4 right bubble '张九崖，如今人类强者齐聚于此...'");
    let r6 = r6.unwrap();
    assert_eq!(r6.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r6, RegionKind::DialogueBubble, 704, 1299, 160, 106, 20);

    // 8. PANEL 4 BOTTOM-LEFT INTRO: '长白老龙最疼爱的后辈...'
    let r7 = res.regions.iter().find(|r| r.text.contains("长白老龙") || r.text.contains("境界地仙"));
    assert!(r7.is_some(), "Must detect panel 4 intro box '长白老龙最疼爱的后辈...'");
    let r7 = r7.unwrap();
    assert_eq!(r7.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r7, RegionKind::DialogueBubble, 36, 1420, 87, 176, 20);

    // 9. NEGATIVE GUARDS: NO WATERMARK
    assert!(
        !res.regions.iter().any(|r| {
            r.text.contains("COLAMANGA")
                || r.text.contains("AcloudMerge")
                || r.text.contains("ACloudMerge")
        }),
        "Must NOT detect aggregator watermarks"
    );
}
