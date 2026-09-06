// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_shushan_treasury_pills_artifacts` (RESOLUTION: 827 x 1996)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 SPEECH BUBBLE**: `"这不会就是蜀山剑宫的藏宝库吧。"` (DialogueBubble, downward tail severed)
/// - **PANEL 1 THOUGHT BUBBLE**: `"一个上古门派的藏宝库啊，那里面会藏着多少宝物？"` (DialogueBubble, downward thought chain severed)
/// - **PANEL 1 THOUGHT BUBBLE**: `"一旦拿出来，足以撼动整个世界吧。"` (DialogueBubble)
/// - **PANEL 2 SPEECH BUBBLE**: `"进去吧。"` (DialogueBubble)
/// - **PANEL 3 ROUND BUBBLE WITH ELLIPSIS**: `"果然有无数的丹药法器......"` (DialogueBubble, rightward tail trimmed, bottom ellipsis dots and full circular cavity preserved without false 48px bottom cut)
/// - **PANEL 3 SPIKY BUBBLE**: `"灵石，而且非常多的灵石，足有数万枚？"` (DialogueBubble)
/// - **PANEL 4 SPEECH BUBBLE**: `"不错，这才事此次最大收获。"` (DialogueBubble)
/// - **EXACT COUNTS**: Exactly 7 dialogue bubble regions.
#[test]
fn test_regression_page_shushan_treasury_pills_artifacts() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_shushan_treasury_pills_artifacts.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_shushan_treasury_pills_artifacts: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Shushan Treasury Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, bubble={:?}, carrier={:?}, typeset={:?}, text='{}'",
            i, r.kind, r.angle, r.box_, r.bubble_box, r.carrier_box, r.typeset_box, r.text.replace('\n', " "));
    }

    // 1. EXACT ELEMENT COUNTS
    crate::assert_element_counts!(res, 7, 7, 0);

    // 2. REGION 4: "果然有无数的丹药法器"
    // Round speech bubble with rightward tail and trailing ellipsis dots at bottom:
    // Right tail must be trimmed by carrier, but bottom must NOT be sliced by 48px.
    let pills_bubble = res.regions.iter().find(|r| r.text.contains("果然有无数") || r.text.contains("丹药法器"));
    assert!(pills_bubble.is_some(), "Must detect '果然有无数的丹药法器' bubble");
    let pills_bubble = pills_bubble.unwrap();
    assert_eq!(pills_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    let bb = pills_bubble.bubble_box.as_ref().expect("bubble box must exist");
    assert!(bb.w >= 230 && bb.h >= 200, "Bubble box must cover full circular contour");

    // Carrier box must preserve the bottom of the bubble (height >= 200, bottom >= 1400)
    if let Some(ref carrier) = pills_bubble.carrier_box {
        assert!(
            carrier.h >= 200,
            "Carrier height must not falsely slice bottom of circular bubble (got carrier.h={}, bb.h={})",
            carrier.h, bb.h
        );
        assert!(
            (carrier.y + carrier.h) >= 1400,
            "Carrier bottom must preserve lower bubble contour and ellipsis dots (got bottom={})",
            carrier.y + carrier.h
        );
    }

    // Typeset box must have ample breathing room vertically (not squished to top with y < 1240)
    let tb = pills_bubble.typeset_box.as_ref().expect("typeset box must exist");
    let tb_cy = tb.y + tb.h / 2;
    let bb_cy = bb.y + bb.h / 2;
    assert!(
        (tb_cy - bb_cy).abs() <= 20,
        "Typeset box must remain vertically centered in the round bubble, got tb_cy={}, bb_cy={}",
        tb_cy, bb_cy
    );

    // 3. INPAINTING & SHRINKWRAP CLEANING: GENERATE inpainted.webp AND cleaned.webp
    let cleaned = crate::common::clean_fixture_with_cache(&img, &res);
    assert!(cleaned.is_some(), "Inpainting and cavity cleaning must produce cleaned result");
    if let Some(cleaned_img) = cleaned {
        let rgb = cleaned_img.to_rgb8();
        let mut dark_pixels = 0;
        let mut min_lum = 255u8;
        // Check Region 4 cavity interior
        for y in (tb.y + 10)..=(tb.y + tb.h - 10) {
            for x in (tb.x + 10)..=(tb.x + tb.w - 10) {
                let p = rgb.get_pixel(x as u32, y as u32);
                let lum = ((p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000) as u8;
                min_lum = min_lum.min(lum);
                if lum < 180 {
                    dark_pixels += 1;
                }
            }
        }
        assert_eq!(
            dark_pixels, 0,
            "Region 4 bubble cavity must be completely cleaned to white, found {} dark pixels (min lum: {})",
            dark_pixels, min_lum
        );
    }
}
