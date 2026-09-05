// -- CHEN FAN JADE GOURD URBAN CULTIVATOR CREDITS REGRESSION TEST -- //

use crate::common::load_fixture_or_skip;
use xianscan_rust::ml::schemas::RegionKind;

#[test]
fn test_page_chen_fan_jade_gourd_urban_cultivator_credits() {
    let img = match load_fixture_or_skip(
        "zh_hans",
        "page_chen_fan_jade_gourd_urban_cultivator_credits/page.webp",
    ) {
        Some(img) => img,
        None => return,
    };

    let res = crate::common::get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));

    // 1. STRUCTURAL ELEMENT COUNTS (3 DIALOGUE BUBBLES, 0 SFX, 1 CLEAN CREDITS REGION)
    crate::assert_element_counts!(res, 4, 3, 0, 1);

    // 2. VERIFY 3 DIALOGUE BUBBLES
    let b0 = res
        .regions
        .iter()
        .find(|r| r.text.contains("周大师") || r.text.contains("哪里哪里"))
        .expect("Top-left speech bubble '哪里哪里...' must be detected");
    assert!(b0.text.contains("周") && b0.text.contains("大师"));
    crate::assert_region_bounds!(b0, RegionKind::DialogueBubble, 57, 38, 182, 116, 20);

    let b1 = res
        .regions
        .iter()
        .find(|r| r.text.contains("袁桓") || r.text.contains("吴山河"))
        .expect("Top-right speech bubble '我能感觉到，这位袁桓...' must be detected");
    assert!(b1.text.contains("入道") && b1.text.contains("吴山河"));
    crate::assert_region_bounds!(b1, RegionKind::DialogueBubble, 531, 32, 234, 160, 20);

    let b2 = res
        .regions
        .iter()
        .find(|r| r.text.contains("也好"))
        .expect("Middle-right speech bubble '也好。' must be detected");
    assert_eq!(b2.text.trim(), "也好。");
    crate::assert_region_bounds!(b2, RegionKind::DialogueBubble, 680, 604, 92, 46, 20);

    // 3. VERIFY UNIFIED CREDITS BLOCK (NO TITLE POLLUTION)
    let credits = res
        .regions
        .iter()
        .find(|r| r.kind == RegionKind::FreeText)
        .expect("Clean unified credits block must be detected as FreeText");

    assert!(credits.text.contains("大行道动漫出品"));
    assert!(credits.text.contains("十里剑神"));
    assert!(credits.text.contains("小颜老师"));
    assert!(credits.text.contains("仲叔"));

    // 4. SPATIAL BOUNDS FOR CREDITS BLOCK
    assert!(
        credits.box_.y >= 750,
        "Credits block should start below title art (y >= 750), got y={}",
        credits.box_.y
    );
    assert!(
        credits.box_.x >= 350,
        "Credits block should be on the right side (x >= 350), got x={}",
        credits.box_.x
    );

    // 5. NEGATIVE GUARDS: NO WATERMARK OR TITLE ARTWORK FRAGMENTS
    assert!(
        !res.regions.iter().any(|r| {
            r.text.contains("colamanga")
                || r.text.contains("ACloudMerge")
                || r.text.contains("COMIC-MANGA")
                || r.text.contains("腾讯动漫")
        }),
        "Watermarks must be suppressed"
    );
    assert!(
        !res.regions.iter().any(|r| {
            r.text.contains("都市修仙")
                || r.text.contains("修山")
                || (r.text.contains("修仙") && r.kind != RegionKind::DialogueBubble)
                || r.text.contains("重生")
        }),
        "Title artwork must not be detected or merged into credits"
    );
}
