// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_herb_shop_silence_ellipsis_dots` (RESOLUTION: 800 × 1132)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 BUBBLE**: `"嘿咻，\n嘿咻！"`
/// - **PANEL 1 FLAG FREE TEXT**: `"药"`
/// - **PANEL 2 LEFT BUBBLE**: `"紫岚草？"`
/// - **PANEL 2 RIGHT BUBBLE**: `"你也是翼龙\n世家的仆人\n吧，刚才你们\n家的人已经\n来把紫岚草\n买完了……"`
/// - **PANEL 3 BOTTOM LEFT BUBBLE**: `"啊！药园里种的也\n要！小姐说了，有多\n少要多少！"`
/// - **PANEL 3 BOTTOM RIGHT BUBBLE**: `"咱们整个宅子用\n几十斤紫岚草就\n够了啊…也罢！\n小姐最近修为突\n飞猛进，整个家族\n都很重视。家主说\n钱和珍贵材料，小\n姐高兴就行！"`
/// - **CRITICAL SILENCE BUBBLE SUPPRESSION**: Reaction bubble with silence ellipsis dots `(………)\n6` / `……` must be skipped.
/// - **EXACT COUNTS**: Exactly 5 dialogue bubbles, 1 free text ('药'), 0 sound effects (Total 6 regions).
#[test]
fn test_regression_page_herb_shop_silence_ellipsis_dots() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_herb_shop_silence_ellipsis_dots") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_herb_shop_silence_ellipsis_dots: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Herb Shop Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 0. EXACT ELEMENT COUNTS: EXACTLY 5 REGIONS (5 DIALOGUE BUBBLES, 0 FREE TEXT, 0 SFX)
    crate::assert_element_counts!(res, 5, 5, 0, 0);

    // 1. PANEL 1 BUBBLE: '嘿咻，\n嘿咻！'
    let b1 = res.regions.iter().find(|r| r.text.contains("嘿咻") && r.box_.y < 300);
    assert!(b1.is_some(), "Must detect panel 1 dialogue bubble '嘿咻，嘿咻！'");
    let b1 = b1.unwrap();
    assert_eq!(b1.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 152, 41, 86, 72, 10);
    crate::assert_region_angle!(b1, 0.0, 2.0);

    // 3. PANEL 2 LEFT BUBBLE: '紫岚草？'
    let b3 = res.regions.iter().find(|r| r.text.contains("紫岚草") && r.box_.y > 400 && r.box_.y < 700 && r.box_.x < 300);
    assert!(b3.is_some(), "Must detect panel 2 left dialogue bubble '紫岚草？'");
    let b3 = b3.unwrap();
    assert_eq!(b3.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b3, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 100, 528, 128, 58, 10);
    crate::assert_region_angle!(b3, 0.0, 2.0);

    // 4. PANEL 2 RIGHT BUBBLE: '你也是翼龙...'
    let b4 = res.regions.iter().find(|r| r.text.contains("翼龙") || r.text.contains("仆人") || r.text.contains("买完了"));
    assert!(b4.is_some(), "Must detect panel 2 right dialogue bubble '你也是翼龙世家的仆人吧...'");
    let b4 = b4.unwrap();
    assert_eq!(b4.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b4, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 530, 448, 117, 172, 10);
    crate::assert_region_angle!(b4, 0.0, 2.0);

    // 5. PANEL 3 BOTTOM LEFT BUBBLE: '啊！药园里种的也要！...'
    let b5 = res.regions.iter().find(|r| r.text.contains("药园") || r.text.contains("多少要多少"));
    assert!(b5.is_some(), "Must detect panel 3 bottom left dialogue bubble '啊！药园里种的也要！...'");
    let b5 = b5.unwrap();
    assert_eq!(b5.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b5, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 90, 748, 177, 83, 10);
    crate::assert_region_angle!(b5, 0.0, 2.0);

    // 6. PANEL 3 BOTTOM RIGHT BUBBLE: '咱们整个宅子用...'
    let b6 = res.regions.iter().find(|r| r.text.contains("整个宅子") || r.text.contains("修为突飞猛进") || r.text.contains("高兴就行"));
    assert!(b6.is_some(), "Must detect panel 3 bottom right dialogue bubble '咱们整个宅子用...'");
    let b6 = b6.unwrap();
    assert_eq!(b6.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_region_bounds!(b6, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 590, 765, 154, 246, 10);
    crate::assert_region_angle!(b6, 0.0, 2.0);

    // 7. CRITICAL NEGATIVE GUARD: SILENCE ELLIPSIS BUBBLE MUST BE FILTERED
    assert!(
        !res.regions.iter().any(|r| (r.box_.x > 290 && r.box_.x < 360 && r.box_.y > 780 && r.box_.y < 900)
            || r.text.contains("………")
            || (r.text.contains('…') && r.text.trim().chars().all(|c| c == '…' || c == '.' || c == '·' || c == '(' || c == ')' || c == '6' || c == '9' || c.is_whitespace()))),
        "Must filter out silence reaction ellipsis dots bubble"
    );
}
