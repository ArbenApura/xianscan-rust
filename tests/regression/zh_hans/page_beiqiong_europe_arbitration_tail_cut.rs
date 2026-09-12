// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_beiqiong_europe_arbitration_tail_cut` (RESOLUTION: 880 x 1345)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 SPEECH BUBBLE**: `"我要北琼派填充黑暗仲裁部留下的势力空白..."` (DialogueBubble)
/// - **PANEL 1 RIGHT BUBBLE**: `"这些条件，恐怕不会那么轻易就能谈成啊......"` (DialogueBubble, tail points upward/leftward, bottom contains ellipsis dots and must not be cut)
/// - **PANEL 2 SPEECH BUBBLE**: `"既然这样，那我就在欧洲多待一段时间..."` (DialogueBubble, tail cut on left towards speaker)
/// - **PANEL 3 ROUND BUBBLE**: `"我的上帝啊！"` (DialogueBubble, symmetrical circular bubble, must not have right side cut off as a false tail)
/// - **PANEL 3 THOUGHT BUBBLE**: `"再这样下去，欧洲贵族非得一个不剩了！"` (DialogueBubble)
/// - **EXACT COUNTS**: Exactly 5 dialogue bubble regions.
#[test]
fn test_regression_page_beiqiong_europe_arbitration_tail_cut() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_beiqiong_europe_arbitration_tail_cut.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_beiqiong_europe_arbitration_tail_cut: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Beiqiong Europe Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, bubble={:?}, carrier={:?}, typeset={:?}, text='{}'",
            i, r.kind, r.angle, r.box_, r.bubble_box, r.carrier_box, r.typeset_box, r.text);
    }

    // 1. EXACT ELEMENT COUNTS
    crate::assert_element_counts!(res, 5, 5, 0);

    // 2. PANEL 1 LEFT SPEECH BUBBLE: "我要北琼派填充黑暗仲裁部留下的势力空白..."
    let p1_bubble = res.regions.iter().find(|r| r.text.contains("北琼派") || r.text.contains("黑暗仲裁部"));
    assert!(p1_bubble.is_some(), "Must detect panel 1 left speech bubble");
    let p1_bubble = p1_bubble.unwrap();
    assert_eq!(p1_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_carrier_bounds!(p1_bubble, 34, 391, 254, 285, 15);

    // 3. REGION 1: "这些条件，恐怕不会那么轻易就能谈成啊"
    // Full bubble boundary must be preserved (no bottom cut slicing through ellipsis dots, no left cut)
    let condition_bubble = res.regions.iter().find(|r| r.text.contains("这些条件") || r.text.contains("轻易"));
    assert!(condition_bubble.is_some(), "Must detect '这些条件，恐怕不会那么轻易就能谈成啊' bubble");
    let condition_bubble = condition_bubble.unwrap();
    assert_eq!(condition_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert_eq!(condition_bubble.carrier_box, None, "Region 1 must not publish a false tail-cut carrier box");

    // 3. REGION 2: "既然这样，那我就在欧洲多待一段时间..."
    // Full bubble boundary must be preserved (no aggressive left cut through the bubble body)
    let black_duke_bubble = res.regions.iter().find(|r| r.text.contains("黑公爵") || r.text.contains("既然这样"));
    assert!(black_duke_bubble.is_some(), "Must detect '既然这样，那我就在欧洲多待一段时间' bubble");
    let black_duke_bubble = black_duke_bubble.unwrap();
    assert_eq!(black_duke_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert_eq!(black_duke_bubble.carrier_box, None, "Region 2 must not publish a false tail-cut carrier box slicing bubble body");

    // 4. REGION 3: "我的上帝啊！"
    // Symmetrical circular bubble: must not chop off the right side of the bubble
    let god_bubble = res.regions.iter().find(|r| r.text.contains("我的上") && r.text.contains("帝啊"));
    assert!(god_bubble.is_some(), "Must detect '我的上帝啊！' bubble");
    let god_bubble = god_bubble.unwrap();
    assert_eq!(god_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert_eq!(god_bubble.carrier_box, None, "Region 3 must not publish a false tail-cut carrier box on circular bubble");
    let tb = god_bubble.typeset_box.as_ref().expect("typeset box must exist");
    let bb = god_bubble.bubble_box.as_ref().expect("bubble box must exist");
    assert!(((tb.x + tb.w / 2) - (bb.x + bb.w / 2)).abs() <= 3, "typeset box X must be centered in circular bubble, got tb_cx={}, bb_cx={}", tb.x + tb.w / 2, bb.x + bb.w / 2);
    assert!(((tb.y + tb.h / 2) - (bb.y + bb.h / 2)).abs() <= 3, "typeset box Y must be centered in circular bubble, got tb_cy={}, bb_cy={}", tb.y + tb.h / 2, bb.y + bb.h / 2);

    // 5. INPAINTING & SHRINKWRAP CLEANING: GENERATE inpainted.webp AND cleaned.webp
    let cleaned = crate::common::clean_fixture_with_cache(&img, &res);
    assert!(cleaned.is_some(), "Inpainting and cavity cleaning must produce cleaned result");
    if let Some(cleaned_img) = cleaned {
        let rgb = cleaned_img.to_rgb8();
        let mut dark_pixels = 0;
        let mut min_lum = 255u8;
        for y in 640..=650 {
            for x in 660..=715 {
                let p = rgb.get_pixel(x, y);
                let lum = ((p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000) as u8;
                min_lum = min_lum.min(lum);
                if lum < 180 {
                    dark_pixels += 1;
                }
            }
        }
        assert_eq!(
            dark_pixels, 0,
            "Region 1 trailing ellipsis '......' must be completely cleaned to pure white, found {} dark pixels (min lum: {})",
            dark_pixels, min_lum
        );
    }
}
