// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_beiqiong_spatial_formation_thought_bubble` (RESOLUTION: 827 x 1805)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 THOUGHT BUBBLE**: `"那里是法阵波动？"` (DialogueBubble, lower thought lobes/circles severed, typeset box centered in main chamber)
/// - **PANEL 2 THOUGHT BUBBLE**: `"果然有法阵，而且带着空间之力，极有可能是金丹设下的。"` (DialogueBubble)
/// - **PANEL 2 SHOUT BUBBLE**: `"起!"` (DialogueBubble, tail-cut carrier validated)
/// - **PANEL 3 SPIKY BUBBLE**: `"开！开！开！"` (DialogueBubble)
/// - **PANEL 3 THOUGHT BUBBLE**: `"就是现在！"` (DialogueBubble)
/// - **EXACT COUNTS**: Exactly 5 dialogue bubble regions.
#[test]
fn test_regression_page_beiqiong_spatial_formation_thought_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_beiqiong_spatial_formation_thought_bubble.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_beiqiong_spatial_formation_thought_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Spatial Formation Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, bubble={:?}, carrier={:?}, typeset={:?}, text='{}'",
            i, r.kind, r.angle, r.box_, r.bubble_box, r.carrier_box, r.typeset_box, r.text.replace('\n', " "));
    }

    // 1. EXACT ELEMENT COUNTS
    crate::assert_element_counts!(res, 5, 5, 0);

    // 2. REGION 0: "那里是法阵波动？"
    // Thought bubble with attached lower lobe and small trailing circle:
    // Carrier must be validated, severing the lower thought chain, and typeset box must be centered inside the oval.
    let formation_bubble = res.regions.iter().find(|r| r.text.contains("那里是法") || r.text.contains("波动"));
    assert!(formation_bubble.is_some(), "Must detect '那里是法阵波动？' bubble");
    let formation_bubble = formation_bubble.unwrap();
    assert_eq!(formation_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(formation_bubble.carrier_box.is_some(), "Region 0 must publish a carrier box severing thought lobes");

    let bb = formation_bubble.bubble_box.as_ref().expect("bubble box must exist");
    let carrier = formation_bubble.carrier_box.as_ref().unwrap();
    let tb = formation_bubble.typeset_box.as_ref().expect("typeset box must exist");

    // Carrier height must sever lower thought lobe and trailing circle
    assert!(carrier.h < bb.h, "Carrier height must be trimmed from raw bubble height");
    assert!(carrier.h <= 140, "Carrier height must cut off bottom lobe, got {}", carrier.h);

    // Typeset box must be centered within the carrier chamber
    let carrier_cy = carrier.y + carrier.h / 2;
    let tb_cy = tb.y + tb.h / 2;
    assert!(
        (tb_cy - carrier_cy).abs() <= 3,
        "Typeset box Y must be centered in carrier chamber (got tb_cy={}, carrier_cy={})",
        tb_cy, carrier_cy
    );

    // 3. REGION 4: "就是现在！"
    // Thought bubble with attached upward lobe pointing to detached circle trail:
    // Carrier must sever top thought lobe and typeset box must be centered inside main oval body.
    let now_bubble = res.regions.iter().find(|r| r.text.contains("就是现在"));
    assert!(now_bubble.is_some(), "Must detect '就是现在！' bubble");
    let now_bubble = now_bubble.unwrap();
    assert_eq!(now_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(now_bubble.carrier_box.is_some(), "Region 4 must publish a carrier box severing top thought lobe");

    let bb4 = now_bubble.bubble_box.as_ref().expect("bubble box must exist");
    let carrier4 = now_bubble.carrier_box.as_ref().unwrap();
    let tb4 = now_bubble.typeset_box.as_ref().expect("typeset box must exist");

    // Carrier top Y must cut off the top thought lobe
    assert!(carrier4.y > bb4.y, "Carrier top must be trimmed downward from raw bubble box");
    assert!(
        carrier4.y - bb4.y >= 14,
        "Carrier top must trim at least 14px from top lobe, got trim={}",
        carrier4.y - bb4.y
    );
    assert!(carrier4.h <= 98, "Carrier height must be <= 98px, got {}", carrier4.h);

    // Typeset box must be vertically centered in the severed carrier oval
    let carrier4_cy = carrier4.y + carrier4.h / 2;
    let tb4_cy = tb4.y + tb4.h / 2;
    assert!(
        (tb4_cy - carrier4_cy).abs() <= 3,
        "Typeset box Y must be centered in carrier chamber (got tb4_cy={}, carrier4_cy={})",
        tb4_cy, carrier4_cy
    );

    // 4. INPAINTING & SHRINKWRAP CLEANING: GENERATE inpainted.webp AND cleaned.webp
    let cleaned = crate::common::clean_fixture_with_cache(&img, &res);
    assert!(cleaned.is_some(), "Inpainting and cavity cleaning must produce cleaned result");
    if let Some(cleaned_img) = cleaned {
        let rgb = cleaned_img.to_rgb8();
        let mut dark_pixels = 0;
        let mut min_lum = 255u8;
        // Check Region 0 cavity interior
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
            "Region 0 bubble cavity must be completely cleaned to white, found {} dark pixels (min lum: {})",
            dark_pixels, min_lum
        );

        // Check Region 4 cavity interior
        let mut dark_pixels_r4 = 0;
        let mut min_lum_r4 = 255u8;
        for y in (tb4.y + 6)..=(tb4.y + tb4.h - 6) {
            for x in (tb4.x + 10)..=(tb4.x + tb4.w - 10) {
                let p = rgb.get_pixel(x as u32, y as u32);
                let lum = ((p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000) as u8;
                min_lum_r4 = min_lum_r4.min(lum);
                if lum < 180 {
                    dark_pixels_r4 += 1;
                }
            }
        }
        assert_eq!(
            dark_pixels_r4, 0,
            "Region 4 bubble cavity must be completely cleaned to white, found {} dark pixels (min lum: {})",
            dark_pixels_r4, min_lum_r4
        );
    }
}
