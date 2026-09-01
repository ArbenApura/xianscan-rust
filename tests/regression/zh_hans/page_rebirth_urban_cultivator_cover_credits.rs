// -- REBIRTH URBAN CULTIVATOR COVER CREDITS REGRESSION TEST -- //

#[test]
fn test_page_rebirth_urban_cultivator_cover_credits() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_rebirth_urban_cultivator_cover_credits/page.webp") {
        Some(img) => img,
        None => return,
    };

    let res = crate::common::get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));

    // 1. STRUCTURAL ELEMENT COUNTS (1 CLEAN CREDITS REGION, 0 TITLE ARTWORK HALLUCINATIONS, 0 WATERMARKS)
    crate::assert_element_counts!(res, 1, 0, 0, 1);

    // 2. VERIFY CLEAN CREDITS BLOCK (NO TITLE POLLUTION)
    let credits = &res.regions[0];
    assert_eq!(
        credits.text.trim(),
        "大行道动漫出品\n责编：西瓜\n原著：十里剑神\n改编：小颜老师\n主笔：仲叔\n助理：安多妮亚小冥"
    );

    // 3. SPATIAL BOUNDS ASSERTIONS FOR CREDITS BLOCK
    assert!(credits.box_.y >= 950, "Credits block should start below title art (y >= 950), got y={}", credits.box_.y);
    assert!(credits.box_.x >= 400, "Credits block should be on the right half (x >= 400), got x={}", credits.box_.x);

    // 4. NEGATIVE GUARDS: NO WATERMARK OR TITLE ARTWORK FRAGMENTS
    assert!(!res.regions.iter().any(|r| r.text.contains("colamanga") || r.text.contains("ACloudMerge")), "Watermarks must be suppressed");
    assert!(!res.regions.iter().any(|r| r.text.contains("都市修仙") || r.text.contains("都ub市") || r.text.contains("重生")), "Title artwork must not be detected");
}
