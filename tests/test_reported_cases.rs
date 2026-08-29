use xianscan_rust::ml::detect::clean_stray_ocr_artifacts;

#[test]
fn test_case_5_clean_stray_ocr_artifacts_normal() {
    let raw = "哼，这么胡\n来，菜鸟一\n个！";
    let cleaned = clean_stray_ocr_artifacts(raw);
    assert_eq!(cleaned, "哼，这么胡\n来，菜鸟一\n个！");
}

#[test]
fn test_case_11_sfx_exclamation_retention() {
    let raw = "咳！";
    let cleaned = clean_stray_ocr_artifacts(raw);
    assert_eq!(cleaned, "咳！");
}

#[test]
fn test_page_6857_manhwa_bubble_safe_core_and_tail_handling() {
    use xianscan_rust::ml::schemas::{BoxRect, Region, RegionKind};
    use xianscan_rust::pipeline::region_builder::expansion::expand_bubble_text_boxes;

    // PAGE 6857: 690x1771 MANHWA DIALOGUE BUBBLES
    let page_w = 690;
    let page_h = 1771;

    // REGION 0 (TOP): ASYMMETRIC LONG TAIL BELOW (352px bubble height, 136px text height)
    let top_bubble = BoxRect { x: 208, y: 779, w: 463, h: 352 };
    let top_ocr = BoxRect { x: 260, y: 872, w: 364, h: 136 };

    // REGION 1 (BOTTOM): LANDSCAPE BUBBLE, WELL-CENTERED TEXT (378x262 bubble, 291x136 text)
    let bot_bubble = BoxRect { x: 12, y: 1455, w: 378, h: 262 };
    let bot_ocr = BoxRect { x: 51, y: 1504, w: 291, h: 136 };

    let mut regions = vec![
        Region {
            id: "9059".to_string(),
            box_: top_ocr,
            polygon: vec![],
            inpaint_box: None,
            typeset_box: None,
            text: "이제 다시 진료받으러\n올 필요는 없겠군.".to_string(),
            confidence: 0.727592,
            vertical: false,
            angle: 0.0,
            bubble_box: Some(top_bubble.clone()),
            bubble_polygon: None,
            centroid: None,
            kind: RegionKind::DialogueBubble,
            is_title: false,
            is_subtitle: false,
        },
        Region {
            id: "9060".to_string(),
            box_: bot_ocr,
            polygon: vec![],
            inpaint_box: None,
            typeset_box: None,
            text: "석의원,\n그동안 고마웠네.".to_string(),
            confidence: 0.73019564,
            vertical: false,
            angle: 0.0,
            bubble_box: Some(bot_bubble.clone()),
            bubble_polygon: None,
            centroid: None,
            kind: RegionKind::DialogueBubble,
            is_title: false,
            is_subtitle: false,
        },
    ];

    expand_bubble_text_boxes(&mut regions, page_w, page_h, 0.03, 0.00);

    // VERIFY TOP REGION (9059): SKIPS SAFE CORE, RETAINS ANCHORED UPPER POSITION (0% EXTRA SCALING)
    let top_tb = regions[0].typeset_box.as_ref().expect("top typeset box should exist");
    assert_eq!(top_tb.y, 852);
    assert_eq!(top_tb.h, 176);

    // VERIFY BOTTOM REGION (9060): CENTERS TO BUBBLE CENTROID WITH PRESERVED DIMENSIONS
    let bot_tb = regions[1].typeset_box.as_ref().expect("bottom typeset box should exist");
    assert_eq!(bot_tb.w, 291);
    assert_eq!(bot_tb.h, 154);
    assert_eq!(bot_tb.x + bot_tb.w / 2, bot_bubble.x + bot_bubble.w / 2);
    assert_eq!(bot_tb.y + bot_tb.h / 2, bot_bubble.y + bot_bubble.h / 2);
}
