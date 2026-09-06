// -- INTERNAL IMPORTS -- //
use crate::common::{clean_fixture_with_cache, get_or_analyze_fixture_with_lang};

// -- TESTS -- //

/// # CHINESE REAL-PAGE REGRESSION: `page_uncle_take_him_down_trailing_dash` (RESOLUTION: 827 x 1505)
///
/// ## CONTEXT & PURPOSE:
/// - Source: Production page 114095 (seq 1), native 827 x 1505 uncompressed.
/// - Scene: Damon shouting to his uncle to capture Chen Beixuan while Chen Beixuan addresses the Blood Clan elder.
/// - Defect: Panel 2 speech bubble ends with a trailing dash `叔叔，这家伙一路从华国追杀\n我到这里！而且他似乎与仙门\n中人有关，你一定要拿下他——`.
///   The OCR box clipped at x=391 while the dash stroke visually reached x=413.
///   LaMa neural inpainting extended the unmasked line backwards across the bubble, and shrinkwrap stroke protection
///   falsely preserved it as untranslated artwork, leaving a persistent `---------` horizontal bar.
/// - EXPECTED:
///   1. Exactly 5 dialogue bubbles, 0 sound effects, 0 free text.
///   2. Panel 2 bubble contains the complete sentence ending with `拿下他`.
///   3. Two-stage inpainting and shrinkwrap must erase the dialogue bubble cavity completely,
///      leaving zero persistent dash streaks in the cleaned bubble.
#[test]
fn test_regression_page_uncle_take_him_down_trailing_dash() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_uncle_take_him_down_trailing_dash/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_uncle_take_him_down_trailing_dash: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("=== Chinese Uncle Take Him Down Trailing Dash (827x1505) ===");
    println!("Detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  [Region {}] id={}, kind={:?}, text=\"{}\", conf={:.3}, angle={:.2}, vertical={}, box={:?}, bubble_box={:?}, typeset_box={:?}",
            i,
            r.id,
            r.kind,
            r.text.replace('\n', "\\n"),
            r.confidence,
            r.angle,
            r.vertical,
            r.box_,
            r.bubble_box,
            r.typeset_box
        );
    }

    // 1. EXACT ELEMENT COUNTS: 5 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 5, 5, 0);

    // 2. REGION 0: TOP-LEFT BUBBLE ("我没想到，\n这个枯竭\n的地球上，\n竟然还有\n半血遗族在。")
    let r0 = res
        .regions
        .iter()
        .find(|r| r.text.contains("半血遗族") || r.text.contains("枯竭"))
        .expect("Must detect top-left speech bubble '我没想到，这个枯竭的地球上...'");
    assert_eq!(r0.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_bubble_bounds!(r0, 43, 78, 194, 216, 15);

    // 3. REGION 1: TOP-RIGHT BUBBLE ("不过你不该\n阻拦我...")
    let r1 = res
        .regions
        .iter()
        .find(|r| r.text.contains("阻拦我") || r.text.contains("成年血族"))
        .expect("Must detect top-right speech bubble '不过你不该阻拦我...'");
    assert_eq!(r1.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_bubble_bounds!(r1, 563, 62, 225, 270, 15);

    // 4. REGION 2: PANEL 2 DAMON SHOUT BUBBLE ("叔叔，这家伙一路从华国追杀...")
    let r2 = res
        .regions
        .iter()
        .find(|r| r.text.contains("叔叔") && r.text.contains("追杀"))
        .expect("Must detect panel 2 speech bubble '叔叔，这家伙一路从华国追杀...'");
    assert_eq!(r2.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(
        r2.text.contains("拿下他"),
        "Bubble text must contain '拿下他', got: '{}'",
        r2.text.replace('\n', "\\n")
    );
    crate::assert_bubble_bounds!(r2, 40, 389, 407, 219, 15);
    crate::assert_region_bounds!(r2, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 75, 433, 316, 120, 15);

    // 5. REGION 3: UNCLE SHOUT BUBBLE ("住嘴！")
    let r3 = res
        .regions
        .iter()
        .find(|r| r.text.contains("住嘴"))
        .expect("Must detect panel 2 uncle shout bubble '住嘴！'");
    assert_eq!(r3.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_bubble_bounds!(r3, 571, 399, 153, 141, 15);

    // 6. REGION 4: BOTTOM BUBBLE ("尊敬的陈北玄先生...")
    let r4 = res
        .regions
        .iter()
        .find(|r| r.text.contains("陈北玄先生") || r.text.contains("停手吧"))
        .expect("Must detect bottom speech bubble '尊敬的陈北玄先生...'");
    assert_eq!(r4.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    crate::assert_bubble_bounds!(r4, 361, 1207, 428, 270, 15);

    // 7. TWO-STAGE INPAINTING AND SHRINKWRAP CLEANING
    // THE TRAILING DASH (y=527, x=338..413) MUST BE WIPED CLEAN TO PURE WHITE FLOOR
    if let Some(cleaned) = clean_fixture_with_cache(&img, &res) {
        let rgb = cleaned.to_rgb8();
        let mut min_lum = 255u8;
        let mut dark_dash_pixels = 0;
        // SAMPLE THE HORIZONTAL LINE AREA OF THE TRAILING DASH INSIDE THE BUBBLE INTERIOR
        for y in 525..=529 {
            for x in 345..=410 {
                let p = rgb.get_pixel(x, y);
                let lum = ((p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000) as u8;
                min_lum = min_lum.min(lum);
                if lum < 180 {
                    dark_dash_pixels += 1;
                }
            }
        }
        assert!(
            dark_dash_pixels == 0,
            "Trailing dash '---------' must be completely cleaned by inpainting/shrinkwrap, but found {} dark pixels (min lum={})",
            dark_dash_pixels,
            min_lum
        );
    }
}
