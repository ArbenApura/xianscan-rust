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
            carrier_box: None,
        },
        Region {
            id: "9060".to_string(),
            box_: bot_ocr.clone(),
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
            carrier_box: None,
        },
    ];

    expand_bubble_text_boxes(&mut regions, None, page_w, page_h, 0.03, 0.00);

    // VERIFY TOP REGION (9059): TAIL-CUT CARRIER LIMITS THE TYPESET BOX INSIDE THE UPPER CHAMBER
    let top_tb = regions[0].typeset_box.as_ref().expect("top typeset box should exist");
    assert_eq!(top_tb.y, 841);
    assert_eq!(top_tb.h, 146);
    // VALIDATED CARRIER PUBLISHED (TAIL TRIMMED FROM 352 TO 271)
    assert_eq!(regions[0].carrier_box, Some(xianscan_rust::ml::schemas::BoxRect { x: 208, y: 779, w: 463, h: 271 }));

    // VERIFY BOTTOM REGION (9060): CENTERS TO CARRIER CENTROID WITH PRESERVED DIMENSIONS
    let bot_tb = regions[1].typeset_box.as_ref().expect("bottom typeset box should exist");
    let bot_carrier = xianscan_rust::pipeline::region_builder::derive_carrier_box(&bot_bubble, &bot_ocr, page_h);
    assert_eq!(bot_tb.w, 291);
    assert_eq!(bot_tb.h, 146);
    assert_eq!(bot_tb.x + bot_tb.w / 2, bot_carrier.x + bot_carrier.w / 2);
    assert_eq!(bot_tb.y + bot_tb.h / 2, bot_carrier.y + bot_carrier.h / 2);
    assert!(bot_tb.y >= bot_bubble.y && bot_tb.y + bot_tb.h <= bot_bubble.y + bot_bubble.h);
}
