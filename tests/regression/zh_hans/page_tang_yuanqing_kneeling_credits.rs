// -- TANG YUANQING KNEELING CREDITS REGRESSION TEST -- //

use crate::common::load_fixture_or_skip;
use xianscan_rust::ml::schemas::RegionKind;

#[test]
fn test_page_tang_yuanqing_kneeling_credits() {
    let img = match load_fixture_or_skip(
        "zh_hans",
        "page_tang_yuanqing_kneeling_credits/page.webp",
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
        .find(|r| r.text.contains("唐远清") || r.text.contains("陈大师"))
        .expect("Top-left speech bubble '唐远清，拜见陈大师！' must be detected");
    assert!(b0.text.contains("唐远清") || b0.text.contains("陈大师"));
    crate::assert_region_bounds!(b0, RegionKind::DialogueBubble, 112, 75, 133, 72, 20);

    let b1 = res
        .regions
        .iter()
        .find(|r| r.text.contains("保全唐家") || r.text.contains("活下去"))
        .expect("Middle-right speech bubble '我要活下去，我要保全唐家！' must be detected");
    assert!(b1.text.contains("活下去") && b1.text.contains("唐家"));
    crate::assert_region_bounds!(b1, RegionKind::DialogueBubble, 545, 587, 188, 70, 20);

    let b2 = res
        .regions
        .iter()
        .find(|r| r.text.contains("没动静"))
        .expect("Middle speech bubble '怎么没动静？' must be detected");
    assert!(b2.text.contains("动静"));
    crate::assert_region_bounds!(b2, RegionKind::DialogueBubble, 84, 1021, 146, 42, 20);

    let b3 = res
        .regions
        .iter()
        .find(|r| r.text.contains("小命") || r.text.contains("终于保住"))
        .expect("Bottom speech bubble '呼，终于保住一条小命啊。' must be detected");
    assert!(b3.text.contains("小命"));
    crate::assert_region_bounds!(b3, RegionKind::DialogueBubble, 559, 1711, 181, 78, 20);

    // 3. VERIFY UNIFIED CREDITS BLOCK (NO TITLE POLLUTION)
    let credits = res
        .regions
        .iter()
        .find(|r| r.kind == RegionKind::FreeText)
        .expect("Clean unified credits block must be detected as FreeText");

    assert_eq!(
        credits.text.trim(),
        "大行道动漫出品\n责编：西瓜\n原著：十里剑神\n改编：小颜老师\n主笔：仲叔\n助理：安多妮亚小冥"
    );

    // 4. SPATIAL BOUNDS FOR CREDITS BLOCK
    assert!(
        credits.box_.y >= 1400,
        "Credits block should start below title art (y >= 1400), got y={}",
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
