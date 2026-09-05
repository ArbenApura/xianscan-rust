// -- GRANDFATHER LETTER URBAN CULTIVATOR CREDITS REGRESSION TEST -- //

use crate::common::load_fixture_or_skip;
use xianscan_rust::ml::schemas::RegionKind;

#[test]
fn test_page_grandfather_letter_urban_cultivator_credits() {
    let img = match load_fixture_or_skip(
        "zh_hans",
        "page_grandfather_letter_urban_cultivator_credits/page.webp",
    ) {
        Some(img) => img,
        None => return,
    };

    let res = crate::common::get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));

    // 1. STRUCTURAL ELEMENT COUNTS (4 DIALOGUE BUBBLES, 0 SFX, 1 CLEAN CREDITS REGION)
    crate::assert_element_counts!(res, 5, 4, 0, 1);

    // 2. VERIFY 4 DIALOGUE BUBBLES
    let b0 = res
        .regions
        .iter()
        .find(|r| r.text.contains("这") && r.box_.y < 60)
        .expect("Top-left speech bubble '这……' must be detected");
    assert_eq!(b0.text.trim(), "这……");
    crate::assert_region_bounds!(b0, RegionKind::DialogueBubble, 295, 36, 97, 50, 20);

    let b1 = res
        .regions
        .iter()
        .find(|r| r.text.contains("这") && r.box_.y >= 60 && r.box_.y < 300)
        .expect("Top-right speech bubble '这!！！' must be detected");
    assert!(b1.text.contains("这") && (b1.text.contains('!') || b1.text.contains('！')));
    crate::assert_region_bounds!(b1, RegionKind::DialogueBubble, 649, 127, 112, 48, 20);

    let b2 = res
        .regions
        .iter()
        .find(|r| r.text.contains("爷爷") || r.text.contains("怎么了"))
        .expect("Middle speech bubble '怎么了？\n爷爷？' must be detected");
    assert!(b2.text.contains("怎么了") && b2.text.contains("爷爷"));
    crate::assert_region_bounds!(b2, RegionKind::DialogueBubble, 254, 611, 104, 76, 20);

    let b3 = res
        .regions
        .iter()
        .find(|r| r.text.contains("啊") && r.box_.y > 900)
        .expect("Bottom speech bubble '啊……' must be detected");
    assert_eq!(b3.text.trim(), "啊……");
    crate::assert_region_bounds!(b3, RegionKind::DialogueBubble, 201, 1013, 98, 52, 20);

    // 3. VERIFY UNIFIED CREDITS BLOCK (NO TITLE POLLUTION)
    let credits = res
        .regions
        .iter()
        .find(|r| r.kind == RegionKind::FreeText)
        .expect("Clean unified credits block must be detected as FreeText");

    let norm_credits = credits.text.replace('-', "");
    assert_eq!(
        norm_credits.trim(),
        "大行道动漫出品\n责编：西瓜\n原著：十里剑神\n改编：小颜老师\n主笔：仲叔\n助理：安多妮亚小冥"
    );

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
                || r.text.contains("之攸")
                || (r.text.contains("修仙") && r.kind != RegionKind::DialogueBubble)
                || r.text.contains("重生")
        }),
        "Title artwork must not be detected or merged into credits"
    );
}
