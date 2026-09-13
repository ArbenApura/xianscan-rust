// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_car_screen_news_headline_banner_split` (RESOLUTION: 900 × 1343)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **CAR INFOTAINMENT SCREEN BANNER & HEADLINE SEPARATION**:
///   ON THE SLANTED CAR CONSOLE DISPLAY, THE TOP NOTIFICATION BANNER "新狼—猜你喜欢" MUST BE
///   SEPARATED FROM THE 2-LINE NEWS HEADLINE BODY "神秘富豪再出手！穷得只剩钱\n在逗鱼直播给女主播刷了1亿！".
/// - **TOP DIALOGUE BUBBLE**:
///   REACTION BUBBLE "穷得只剩钱\n跑去逗鱼了？" MUST BE DETECTED AS DIALOGUE BUBBLE.
/// - **EXACT COUNTS**: 3 REGIONS TOTAL (1 DIALOGUE BUBBLE, 0 SFX, 2 FREE TEXT REGIONS).
#[test]
fn test_regression_page_car_screen_news_headline_banner_split() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_car_screen_news_headline_banner_split/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("Detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT STRUCTURAL ELEMENT COUNTS: 3 REGIONS TOTAL
    // (1 DIALOGUE BUBBLE, 0 SFX, 2 FREE TEXT REGIONS ON CAR DISPLAY)
    crate::assert_element_counts!(res, 3, 1, 0, 2);

    // 2. TOP SPIKY DIALOGUE BUBBLE: "穷得只剩钱\n跑去逗鱼了？"
    let r_bubble = res.regions.iter().find(|r| r.text.contains("穷得只剩钱") && r.text.contains("跑去逗鱼"));
    assert!(r_bubble.is_some(), "Must detect top dialogue bubble '穷得只剩钱跑去逗鱼了？'");
    let r_bubble = r_bubble.unwrap();
    assert_eq!(r_bubble.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(r_bubble, RegionKind::DialogueBubble, 534, 218, 200, 85, 20);

    // 3. CAR SCREEN BANNER HEADER: "新狼—猜你喜欢"
    let r_banner = res.regions.iter().find(|r| r.text.contains("猜你喜欢") || r.text.contains("新狼"));
    assert!(r_banner.is_some(), "Must detect car screen notification banner '新狼—猜你喜欢'");
    let r_banner = r_banner.unwrap();
    assert_eq!(r_banner.kind, RegionKind::FreeText);
    assert!(!r_banner.text.contains("神秘富豪"), "Banner '新狼—猜你喜欢' must NOT contain news headline body");
    crate::assert_region_bounds!(r_banner, RegionKind::FreeText, 555, 725, 103, 45, 15);
    crate::assert_region_angle!(r_banner, 14.31, 3.0);

    // 4. CAR SCREEN NEWS HEADLINE BODY: 2-LINE UNIFIED DIALOGUE
    let r_headline = res.regions.iter().find(|r| r.text.contains("神秘富豪") || r.text.contains("刷了1亿"));
    assert!(r_headline.is_some(), "Must detect car screen news headline body");
    let r_headline = r_headline.unwrap();
    assert_eq!(r_headline.kind, RegionKind::FreeText);
    assert!(!r_headline.text.contains("猜你喜欢"), "News headline body must NOT contain banner header '猜你喜欢'");
    assert!(r_headline.text.contains("神秘富豪再出手") || r_headline.text.contains("富豪"), "Must contain line 1 of news body");
    assert!(r_headline.text.contains("女主播") || r_headline.text.contains("1亿"), "Must contain line 2 of news body");
    crate::assert_region_bounds!(r_headline, RegionKind::FreeText, 537, 770, 204, 95, 15);
    crate::assert_region_angle!(r_headline, 16.10, 3.0);

    // 5. NEGATIVE CHECK: BANNER MUST NOT BE MERGED WITH NEWS HEADLINE BODY
    assert!(
        !res.regions.iter().any(|r| r.text.contains("猜你喜欢") && r.text.contains("神秘富豪")),
        "Banner '新狼—猜你喜欢' must NOT be merged with news headline body"
    );
}
