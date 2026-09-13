// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

/// # CHINESE REGRESSION: `page_sotu_open_up_banner_tail_cut` (RESOLUTION: 800 × 1351)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP-RIGHT NARRATION**:
///   `"砍了这么久的\n怪还没有哪个\n怪能提起我的\n兴趣，这次的\n索图我倒要看\n看他是什么样\n的难度！"`
///   Free text narration block.
/// - **PANEL 1 LEFT SPEECH BUBBLE**:
///   `"公子的战术\n固然精妙\n他们的配合\n也没得说。\n但是那些都\n不是我喜欢\n的！"`
///   Upright speech bubble on the left margin.
/// - **PANEL 2 PANORAMA BANNER SPEECH BUBBLE WITH DOWNWARD TAIL**:
///   `"索图！快开门！我知道你在家！"`
///   Elongated wide horizontal speech bubble (722 × 210px) with a prominent downward tail.
///   Validates that panorama aspect ratio bubbles cleanly sever downward pointer tails,
///   publishing `carrier_box` and keeping typesetting safely inside the chamber body.
/// - **EXACT COUNTS**: Exactly 3 regions (2 bubbles, 0 SFX, 1 free text).
#[test]
fn test_regression_page_sotu_open_up_banner_tail_cut() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_sotu_open_up_banner_tail_cut/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));

    // 1. EXACT ELEMENT COUNTS
    crate::assert_element_counts!(res, 3, 2, 0, 1);

    // 2. REGION 0: TOP-RIGHT NARRATION (FREE TEXT)
    let r0 = &res.regions[0];
    assert_eq!(r0.kind, RegionKind::FreeText);
    assert!(r0.text.contains("砍了这么久") && r0.text.contains("难度"));
    crate::assert_region_bounds!(r0, RegionKind::FreeText, 593, 154, 203, 253, 15);

    // 3. REGION 1: LEFT SPEECH BUBBLE
    let r1 = &res.regions[1];
    assert_eq!(r1.kind, RegionKind::DialogueBubble);
    assert!(r1.text.contains("公子的战术") && r1.text.contains("喜欢"));
    crate::assert_region_bounds!(r1, RegionKind::DialogueBubble, 8, 338, 170, 252, 15);
    crate::assert_bubble_bounds!(r1, 8, 338, 206, 258, 15);

    // 4. REGION 2: PANORAMA SHOUT BANNER WITH SEVERED DOWNWARD TAIL
    let banner = &res.regions[2];
    assert_eq!(banner.kind, RegionKind::DialogueBubble);
    assert!(banner.text.contains("索图") && banner.text.contains("快开门"));
    crate::assert_region_bounds!(banner, RegionKind::DialogueBubble, 98, 791, 584, 50, 15);
    crate::assert_bubble_bounds!(banner, 25, 761, 722, 210, 15);

    // CARRIER CHAMBER MUST SEVER DOWNWARD TAIL AND CONTAIN TYPESETTING
    crate::assert_carrier_bounds!(banner, 58, 761, 668, 159, 15);
    let carrier = banner.carrier_box.as_ref().unwrap();
    let bb = banner.bubble_box.as_ref().unwrap();
    assert!(
        carrier.h <= bb.h - 40,
        "Carrier height ({}) must cleanly sever downward tail from bubble height ({})",
        carrier.h,
        bb.h
    );

    let tb = banner.typeset_box.as_ref().expect("typeset_box must exist");
    assert!(
        tb.y + tb.h <= carrier.y + carrier.h + 5,
        "Typeset box bottom ({}) must stay inside carrier chamber bottom ({})",
        tb.y + tb.h,
        carrier.y + carrier.h
    );
}
