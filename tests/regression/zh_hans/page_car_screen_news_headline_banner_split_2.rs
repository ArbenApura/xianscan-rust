// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_car_screen_news_headline_banner_split_2` (RESOLUTION: 900 × 1561)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **CAR INFOTAINMENT SCREEN BANNER & HEADLINE SEPARATION (VARIANT)**:
///   ON A SECOND SLANTED CAR CONSOLE PAGE, THE TOP NOTIFICATION BANNER "新狼一猜你喜欢" MUST BE
///   SEPARATED FROM THE 3-LINE NEWS HEADLINE BODY.
/// - **EXACT COUNTS**: AT LEAST 2 SEPARATE FREE TEXT REGIONS ON THE CAR SCREEN.
///   BANNER MUST NOT BE MERGED WITH NEWS BODY.
#[test]
fn test_regression_page_car_screen_news_headline_banner_split_2() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_car_screen_news_headline_banner_split_2/page.webp") {
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

    // 1. BANNER HEADER MUST BE DETECTED AS SEPARATE REGION
    let r_banner = res.regions.iter().find(|r| r.text.contains("猜你喜欢") || r.text.contains("新狼"));
    assert!(r_banner.is_some(), "Must detect car screen notification banner '新狼一猜你喜欢'");
    let r_banner = r_banner.unwrap();
    assert_eq!(r_banner.kind, RegionKind::FreeText);
    assert!(!r_banner.text.contains("神秘富豪"), "Banner must NOT contain news headline body");

    // 2. NEWS HEADLINE BODY MUST BE DETECTED AS SEPARATE REGION
    let r_headline = res.regions.iter().find(|r| r.text.contains("神秘富豪") || r.text.contains("刷了1亿"));
    assert!(r_headline.is_some(), "Must detect car screen news headline body");
    let r_headline = r_headline.unwrap();
    assert_eq!(r_headline.kind, RegionKind::FreeText);
    assert!(!r_headline.text.contains("猜你喜欢"), "News headline must NOT contain banner header");

    // 3. NEGATIVE CHECK: BANNER MUST NOT BE MERGED WITH NEWS HEADLINE BODY
    assert!(
        !res.regions.iter().any(|r| r.text.contains("猜你喜欢") && r.text.contains("神秘富豪")),
        "Banner '新狼一猜你喜欢' must NOT be merged with news headline body"
    );
}
