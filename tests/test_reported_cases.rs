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
            ocr_box: None,
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
            ocr_box: None,
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

    expand_bubble_text_boxes(&mut regions, &[], None, page_w, page_h, None, None);

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

#[test]
fn test_page_113830_thought_bubble_right_lobe_tail_cutting() {
    use xianscan_rust::ml::schemas::{BoxRect, Region, RegionKind};
    use xianscan_rust::pipeline::region_builder::expansion::expand_bubble_text_boxes;

    // PAGE 113830: 827x1785 CHEN FAN THOUGHT BUBBLE (REGION 0)
    // HAS A BULBOUS CIRCULAR LOBE (~35PX) PROTRUDING ON THE RIGHT SIDE TOWARD THE THOUGHT CHAIN
    let page_w = 827;
    let page_h = 1785;

    let bubble = BoxRect { x: 76, y: 290, w: 229, h: 243 };
    let ocr_box = BoxRect { x: 109, y: 355, w: 127, h: 116 };

    let mut regions = vec![Region {
        id: "65471".to_string(),
        box_: ocr_box,
        polygon: vec![],
        ocr_box: None,
        inpaint_box: None,
        typeset_box: None,
        text: "现在，魏家\n该给我一个\n交代了。".to_string(),
        confidence: 0.731,
        vertical: false,
        angle: 0.0,
        bubble_box: Some(bubble.clone()),
        bubble_polygon: None,
        centroid: None,
        kind: RegionKind::DialogueBubble,
        is_title: false,
        is_subtitle: false,
        carrier_box: None,
    }];

    expand_bubble_text_boxes(&mut regions, &[], None, page_w, page_h, None, None);

    // 1. CARRIER BOX MUST PROPERLY SEVER THE RIGHT THOUGHT LOBE (WIDTH REDUCED FROM 229 TO 193)
    let carrier = regions[0].carrier_box.as_ref().expect("carrier box must be published for right lobe thought bubble");
    assert_eq!(carrier.x, 76, "left edge of carrier must match oval boundary");
    assert_eq!(carrier.w, 193, "carrier width must be trimmed from 229 to 193, cutting off the right-side lobe");
    assert_eq!(carrier.h, 243);

    // 2. TYPESET BOX MUST REMAIN CENTERED INSIDE THE OVAL CHAMBER INSTEAD OF BEING DRAGGED RIGHT TO X:127
    let tb = regions[0].typeset_box.as_ref().expect("typeset box must exist");
    assert_eq!(tb.x, 104, "typeset box X must be centered inside the oval at 104, not pulled rightward to 127");
    assert_eq!(tb.w, 136, "typeset box width expanded symmetrically inside carrier envelope");
    assert_eq!(tb.h, 150, "typeset box height expanded symmetrically inside carrier envelope");
    assert_eq!(tb.x + tb.w / 2, carrier.x + carrier.w / 2, "typeset box center must match carrier chamber center");
}

#[test]
fn test_page_113831_thought_bubble_left_lobe_tail_cutting() {
    use xianscan_rust::ml::schemas::{BoxRect, Region, RegionKind};
    use xianscan_rust::pipeline::region_builder::expansion::expand_bubble_text_boxes;

    // PAGE 113831: 827x1616 CHEN FAN THOUGHT BUBBLE (REGION 1)
    // HAS A BULBOUS CIRCULAR LOBE PROTRUDING ON THE LOWER-LEFT SIDE TOWARD THE THOUGHT CHAIN
    let page_w = 827;
    let page_h = 1616;

    let bubble = BoxRect { x: 557, y: 59, w: 217, h: 255 };
    let ocr_box = BoxRect { x: 614, y: 102, w: 125, h: 156 };

    let mut regions = vec![Region {
        id: "65476".to_string(),
        box_: ocr_box,
        polygon: vec![],
        ocr_box: None,
        inpaint_box: None,
        typeset_box: None,
        text: "这么巧，这\n么说，许多\n故人同学都\n会回来了？".to_string(),
        confidence: 0.729,
        vertical: false,
        angle: 0.0,
        bubble_box: Some(bubble.clone()),
        bubble_polygon: None,
        centroid: None,
        kind: RegionKind::DialogueBubble,
        is_title: false,
        is_subtitle: false,
        carrier_box: None,
    }];

    expand_bubble_text_boxes(&mut regions, &[], None, page_w, page_h, None, None);

    // 1. CARRIER BOX MUST PROPERLY SEVER THE LEFT THOUGHT LOBE (X SHIFTED FROM 557 TO 579, WIDTH FROM 217 TO 195)
    let carrier = regions[0].carrier_box.as_ref().expect("carrier box must be published for left lobe thought bubble");
    assert_eq!(carrier.x, 579, "carrier X must be trimmed from 557 to 579, cutting off the left-side lobe");
    assert_eq!(carrier.w, 195, "carrier width must be trimmed from 217 to 195");
    assert_eq!(carrier.h, 255);

    // 2. TYPESET BOX MUST REMAIN CENTERED INSIDE THE OVAL CHAMBER INSTEAD OF BEING PULLED LEFT TO X:598
    let tb = regions[0].typeset_box.as_ref().expect("typeset box must exist");
    assert_eq!(tb.x, 608, "typeset box X must be centered inside the oval at 608, not pulled leftward to 598");
    assert_eq!(tb.w, 136, "typeset box width expanded symmetrically inside carrier envelope");
    assert_eq!(tb.h, 168, "typeset box height expanded symmetrically inside carrier envelope");
    assert_eq!(tb.x + tb.w / 2, carrier.x + carrier.w / 2, "typeset box center must match carrier chamber center");
}

#[test]
fn test_page_117955_short_horizontal_dialogue_bubble_expansion() {
    use xianscan_rust::ml::schemas::{BoxRect, Region, RegionKind};
    use xianscan_rust::pipeline::region_builder::expansion::expand_bubble_text_boxes;

    // PAGE 117955 (REGION 73913): 900x1593 BUBBLE WITH 1-LINE CHINESE TEXT
    // BUBBLE HEIGHT IS 154PX, OCR HEIGHT IS 26PX.
    // MUST EXPAND HEIGHT SIGNIFICANTLY TO ACCOMMODATE TRANSLATED MULTI-LINE TEXT.
    let page_w = 900;
    let page_h = 1593;

    let bubble = BoxRect { x: 25, y: 329, w: 244, h: 154 };
    let ocr_box = BoxRect { x: 61, y: 384, w: 163, h: 26 };

    let mut regions = vec![Region {
        id: "73913".to_string(),
        box_: ocr_box.clone(),
        polygon: vec![
            [61, 384],
            [224, 384],
            [224, 410],
            [61, 410],
        ],
        ocr_box: None,
        inpaint_box: None,
        typeset_box: None,
        text: "玄·天·斩·剑·术！".to_string(),
        confidence: 0.725,
        vertical: false,
        angle: 0.0,
        bubble_box: Some(bubble.clone()),
        bubble_polygon: None,
        centroid: None,
        kind: RegionKind::DialogueBubble,
        is_title: false,
        is_subtitle: false,
        carrier_box: None,
    }];

    expand_bubble_text_boxes(&mut regions, &[], None, page_w, page_h, None, None);

    // BASE BOX REMAINS TIGHT ORIGINAL OCR BOUNDARY WITHOUT ARTIFICIAL INFLATION
    assert_eq!(regions[0].box_.h, 26);
    assert_eq!(regions[0].box_.w, 163);

    // TYPESET BOX MUST BE CENTERED AND EXPANDED TO FIT MULTI-LINE TRANSLATION
    let tb = regions[0].typeset_box.as_ref().expect("typeset box must exist");
    assert!(tb.h >= 65, "typeset_box height should be >= 65px");
    assert!(tb.y >= bubble.y && tb.y + tb.h <= bubble.y + bubble.h);
    assert!(tb.x >= bubble.x && tb.x + tb.w <= bubble.x + bubble.w);

    // INPAINT BOX DERIVES FROM TIGHT BASE WITH FIXED 3% EXPANSION
    let ib = regions[0].inpaint_box.as_ref().expect("inpaint box must exist");
    assert!(ib.w >= regions[0].box_.w);
    assert!(ib.h >= regions[0].box_.h);
}

#[test]
fn test_failed_chapters_pages_analysis_succeeds() {
    let base = std::path::PathBuf::from(r"C:\Users\Admin\AppData\Roaming\XianScan\data");
    let test_rel_paths = [
        "uploads/3419/6ee0437b-d3ac-456c-a32a-056549607e99.webp", // Chapter 3419 Page 18 (crash site)
        "uploads/3419/2b7865b9-6d11-4f9d-9bce-60f5015c51ef.webp", // Chapter 3419 Page 19
        "uploads/3420/882ad1f2-3e3c-40fa-9ac5-4fc45e59bc70.webp", // Chapter 3420 Page 0
        "uploads/3421/bf1aad50-286f-4a9e-a7c5-196970ce3174.webp", // Chapter 3421 Page 0
        "uploads/3422/0f8bbd26-e0a4-4039-873b-e4137a93b477.webp", // Chapter 3422 Page 0
        "uploads/3423/95941023-9f74-4509-b0b5-fec38d9d694e.webp", // Chapter 3423 Page 0
        "uploads/3424/1d416b52-0f91-44a3-b3c8-52b3632e45e6.webp", // Chapter 3424 Page 0
    ];

    let mut engine = xianscan_rust::pipeline::PipelineEngine::new(std::path::Path::new("models"));
    for rel in test_rel_paths {
        let p = base.join(rel);
        if !p.exists() {
            continue;
        }
        let img = image::open(&p).unwrap_or_else(|e| panic!("Failed to open {}: {}", rel, e));
        let res = engine.analyze_image(&img);
        assert!(res.is_ok(), "Analysis on {} failed: {:?}", rel, res.err());
    }
}




