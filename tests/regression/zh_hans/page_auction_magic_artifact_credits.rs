// -- AUCTION MAGIC ARTIFACT CREDITS REGRESSION TEST -- //

use crate::common::load_fixture_or_skip;
use xianscan_rust::ml::schemas::RegionKind;

#[test]
fn test_page_auction_magic_artifact_credits() {
    let img = match load_fixture_or_skip(
        "zh_hans",
        "page_auction_magic_artifact_credits/page.webp",
    ) {
        Some(img) => img,
        None => return,
    };

    let res = crate::common::get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));

    // 1. STRUCTURAL ELEMENT COUNTS (9 DIALOGUE BUBBLES, 0 SFX, 1 CLEAN CREDITS REGION)
    crate::assert_element_counts!(res, 10, 9, 0, 1);

    // 2. VERIFY DIALOGUE BUBBLES
    let b_hours = res
        .regions
        .iter()
        .find(|r| r.text.contains("几个小时后"))
        .expect("Top narration bubble '几个小时后……' must be detected");
    crate::assert_region_bounds!(b_hours, RegionKind::DialogueBubble, 63, 88, 180, 30, 20);

    let b_grass = res
        .regions
        .iter()
        .find(|r| r.text.contains("天香") && r.text.contains("草"))
        .expect("Top-right speech bubble '果然是天香草...' must be detected");
    assert!(b_grass.text.contains("天香") && b_grass.text.contains("草"));

    let b_nothing = res
        .regions
        .iter()
        .find(|r| r.text.contains("没什么") && r.text.contains("好看"))
        .expect("Middle speech bubble '后面就没什么好看的了。' must be detected");
    assert!(b_nothing.text.contains("好看"));

    let b_auction = res
        .regions
        .iter()
        .find(|r| r.text.contains("拍卖会") || r.text.contains("重头戏"))
        .expect("Auctioneer speech bubble '诸位，本场拍卖会...' must be detected");
    assert!(b_auction.text.contains("拍卖"));

    let b_artifact = res
        .regions
        .iter()
        .find(|r| r.text.contains("现在要拍卖的") || r.text.contains("法器"))
        .expect("Auctioneer speech bubble '现在要拍卖的，是一件法器。' must be detected");
    assert!(b_artifact.text.contains("法器"));

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
        credits.box_.y >= 430,
        "Credits block should start below title art (y >= 430), got y={}",
        credits.box_.y
    );
    assert!(
        credits.box_.x >= 450,
        "Credits block should be on the right side (x >= 450), got x={}",
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
                || (r.text.contains("修仙") && r.kind != RegionKind::DialogueBubble)
                || r.text.contains("重生")
        }),
        "Title artwork must not be detected or merged into credits"
    );
}
