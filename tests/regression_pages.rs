mod common;

use std::path::Path;
use common::get_or_analyze_fixture;

#[test]
fn test_regression_page_679() {
    let img_path = Path::new("tests/fixtures/page_679.jpg");
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_679.jpg")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    assert!(!res.regions.is_empty(), "Page 679 must have detected regions");

    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");
    println!("Page 679 detected text:\n{}", all_text);
    assert!(res.regions.len() >= 4, "Page 679 should have at least 4 grouped paragraphs");
    assert!(all_text.contains("难道") || all_text.contains("张予德"), "Page 679 must contain speech bubble text");
}

#[test]
fn test_regression_page_63617() {
    let img_path = Path::new("tests/fixtures/page_63617.webp");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_63617.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Page 63617 detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.angle, r.confidence);
    }

    // Exact count: 7 regions
    assert_eq!(res.regions.len(), 7, "Page 63617 must have exactly 7 regions, got {}", res.regions.len());

    assert_eq!(res.regions[0].text, "阴阳为炭兮！\n造化为工！", "Region r0 text mismatch");
    assert_eq!(res.regions[1].text, "化婴！练丹！\n脱离苦海！", "Region r1 text mismatch");
    assert_eq!(res.regions[2].text, "噗", "Region r2 text mismatch");
    assert_eq!(res.regions[3].text, "噗", "Region r3 text mismatch");
    assert_eq!(res.regions[4].text, "噗", "Region r4 text mismatch");
    assert_eq!(res.regions[5].text, "嘟！\n恐惧值+0", "Region r5 text mismatch");
    assert_eq!(res.regions[6].text, "嘟！\n恐惧值+0", "Region r6 text mismatch");

    // Guard: Region r1 right edge must fully enclose the second exclamation mark of '练丹！' (x + w >= 745)
    assert!(res.regions[1].box_.x + res.regions[1].box_.w >= 745, "Region r1 right boundary must fully cover '练丹！' exclamation mark, got x={}, w={}", res.regions[1].box_.x, res.regions[1].box_.w);

    // Guard: Middle '噗' must not contain hallucinated 'HANILS' noise
    assert!(!res.regions.iter().any(|r| r.text.contains("HANILS")), "Must not contain hallucinated 'HANILS' noise");
}

#[test]
fn test_regression_page_683() {
    let img_path = Path::new("tests/fixtures/page_683.jpg");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_683.jpg")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    assert!(!res.regions.is_empty(), "Page 683 must have detected regions");
    println!("Page 683 detected {} regions", res.regions.len());
}

#[test]
fn test_regression_page_688() {
    let img_path = Path::new("tests/fixtures/page_688.jpg");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_688.jpg")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    assert!(!res.regions.is_empty(), "Page 688 must have detected regions");
    println!("Page 688 detected {} regions", res.regions.len());
}

#[test]
fn test_regression_page_63602() {
    let img_path = Path::new("tests/fixtures/page_63602.png");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_63602.png")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Page 63602 detected {} regions:", res.regions.len());
    for r in &res.regions {
        println!("  Region {}: box={:?}, text='{}', conf={:.2}", r.id, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. Must detect speech bubble with intact dialogue and ellipsis without rogue brackets
    let bubble = res.regions.iter().find(|r| r.text.contains("哇啊") || r.text.contains("老大") || r.text.contains("状况"));
    assert!(bubble.is_some(), "Speech bubble region must be detected");
    let bubble_text = &bubble.unwrap().text;
    assert!(bubble_text.contains("哇啊……啊……"), "Ellipsis must be cleanly normalized");
    assert!(bubble_text.contains("老大！有状况啊！"), "Dialogue line 2 must be complete");
    assert!(!bubble_text.contains('['), "Must not have rogue bracket artifact");

    // 2. Must suppress false-positive artwork/drawing contour regions (e.g. hair '色', motion sweat '小', 'S', margin '中')
    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");
    assert!(!all_text.contains("色"), "Must not detect hair vibration contour as '色'");
    assert!(!all_text.contains("小"), "Must not detect sweat/motion marks as '小'");
    assert!(!res.regions.iter().any(|r| r.text == "S"), "Must not detect squiggle motion marks as single Latin 'S'");
    assert!(!res.regions.iter().any(|r| r.text == "中" && r.box_.x >= 850), "Must not detect right edge margin noise as '中'");

    // 3. Must detect all 3 panel SFX rustling sound effects normalized as '沙—' with full tail width coverage >= 250px
    let sfx_regions: Vec<_> = res.regions.iter().filter(|r| r.text.starts_with("沙")).collect();
    assert_eq!(sfx_regions.len(), 3, "Must detect exactly 3 distinct SFX regions");
    for sfx in &sfx_regions {
        assert!(sfx.text == "沙—" || sfx.text == "沙——", "SFX must normalize prolonged stroke away from numeral '一'");
        assert!(sfx.box_.w >= 250, "SFX bounding box width must cover the full prolonged stroke tail (w >= 250px)");
    }
}

#[test]
fn test_regression_page_15_seq_8() {
    let img_path = Path::new("tests/fixtures/page_15_seq_8.png");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_15_seq_8.png")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Page 15 seq 8 detected {} regions:", res.regions.len());
    for r in &res.regions {
        println!("  Region {}: box={:?}, text='{}', conf={:.2}", r.id, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");

    // 1. Must suppress hallucinated giant artwork region "福迎" across character robes/shadows
    assert!(!all_text.contains("福迎"), "Must not hallucinate '福迎' over dark clothing/shading");
    assert!(!res.regions.iter().any(|r| r.box_.w >= 600 && r.box_.h >= 300), "Must not create giant whole-width false positive region");

    // 2. Speech bubble "系统诞生在我身上……" must have full ellipsis coverage and proper width
    let sys_bubble = res.regions.iter().find(|r| r.text.contains("系统诞生在我身上"));
    assert!(sys_bubble.is_some(), "Speech bubble '系统诞生在我身上……' must be detected");
    let sys_bubble = sys_bubble.unwrap();
    assert!(sys_bubble.text.ends_with("……"), "Speech bubble must contain standard double ellipsis '……', got '{}'", sys_bubble.text);
    assert!(sys_bubble.box_.w >= 380, "Bubble width must encompass the full dialogue line and ellipsis, got w={}", sys_bubble.box_.w);

    // 3. Other speech bubbles must be cleanly detected
    assert!(all_text.contains("十一年前"), "Must detect top bubble '十一年前……'");
    assert!(all_text.contains("发生过什么大事"), "Must detect '发生过什么大事？'");
    assert!(all_text.contains("穿越"), "Must detect '穿越……'");
    assert!(all_text.contains("压寨夫人"), "Must detect '压寨夫人……'");
}

#[test]
fn test_regression_page_32_seq_22() {
    let img_path = Path::new("tests/fixtures/page_32_seq_22.png");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_32_seq_22.png")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Page 32 seq 22 detected {} regions:", res.regions.len());
    for r in &res.regions {
        println!("  Region {}: box={:?}, text='{}', conf={:.2}", r.id, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");

    // 1. Must suppress hallucinated isolated '一' background noise
    assert!(!res.regions.iter().any(|r| r.text.trim() == "一" && r.box_.w <= 60), "Must not detect isolated '一' background contour noise");

    // 2. Middle speech bubble must unify both paragraphs into a single dialogue region
    let mid_bubble = res.regions.iter().find(|r| r.text.contains("世家子弟") || r.text.contains("到时候他还记不记得"));
    assert!(mid_bubble.is_some(), "Middle speech bubble must be detected");
    let mid_text = &mid_bubble.unwrap().text;
    assert!(mid_text.contains("到时候他") || mid_text.contains("记不记得"), "Middle bubble must contain paragraph 1 text");
    assert!(mid_text.contains("世家子弟") && mid_text.contains("修炼"), "Middle bubble must contain paragraph 2 text");

    // 3. Top and bottom speech bubbles must also be intact
    assert!(all_text.contains("现实一点") || all_text.contains("叶紫芸"), "Must detect top bubble");
    assert!(all_text.contains("什么叫整天") || all_text.contains("污蔑"), "Must detect bottom bubble");
}

#[test]
fn test_regression_page_162_seq_1() {
    let img_path = Path::new("tests/fixtures/page_162_seq_1.png");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_162_seq_1.png")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Page 162 seq 1 detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  r{}: box=({},{},{},{}) text='{}'", i,
            r.box_.x, r.box_.y, r.box_.w, r.box_.h, r.text.replace('\n', "\\n"));
    }

    // Exact count: 3 regions.
    // The '……' tail-circle bubble in the bottom-right panel MUST be suppressed.
    assert_eq!(res.regions.len(), 3,
        "Page 162 must have exactly 3 regions, got {}", res.regions.len());

    // Guard: '……' must never be emitted as a standalone region — it is a tail ornament.
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "……"),
        "The bottom-right '……' tail-circle bubble must be suppressed, not emitted standalone"
    );

    // Must not hallucinate artwork contour '新ー' over top-left background foliage
    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");
    assert!(
        !all_text.contains("新ー") && !all_text.contains("新-")
            && !res.regions.iter().any(|r| r.text.trim() == "新"),
        "Must not hallucinate '新ー' over foliage"
    );

    // Exact text ground truth
    assert_eq!(res.regions[0].text, "接",              "r0 text mismatch");
    assert_eq!(res.regions[1].text, "啊！",            "r1 text mismatch");
    assert_eq!(res.regions[2].text, "你可不要\n乱动……", "r2 text mismatch");

    // Guard: the bottom-right ‘……’ bubble must be suppressed, not a standalone region.
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "\u{2026}\u{2026}"),
        "The bottom-right tail-circle bubble must be suppressed, not emitted standalone"
    );

    // Scale-relative geometry: left bubble right edge must not exceed 38% of page width.
    // (Cache: r2 at x=37, w=154 in 515px-wide image → right edge = 191 = 37% of 515)
    let r2 = &res.regions[2];
    assert!(
        r2.box_.x + r2.box_.w <= (res.width as f32 * 0.38) as i32,
        "Left bubble right edge over-expanded: x={}, w={}, page_w={}",
        r2.box_.x, r2.box_.w, res.width
    );
}

#[test]
fn test_regression_page_168_seq_1() {
    let img_path = Path::new("tests/fixtures/page_168_seq_1.png");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_168_seq_1.png")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Page 168 seq 1 detected {} regions:", res.regions.len());
    for r in &res.regions {
        println!("  Region {}: box={:?}, angle={:.2}, text='{}', conf={:.2}", r.id, r.box_, r.angle, r.text.replace('\n', "\\n"), r.confidence);
    }

    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");

    // 1. Dialogue '我不能硬拼……' must have no rotation angle (angle = 0.0)
    let fight_bubble = res.regions.iter().find(|r| r.text.contains("我不能硬拼") || r.text.contains("拉开距离") || r.text.contains("硬拼"));
    assert!(fight_bubble.is_some(), "Must detect speech bubble '我不能硬拼……'");
    let fight_bubble = fight_bubble.unwrap();
    assert_eq!(fight_bubble.angle, 0.0, "Upright speech bubble must have angle 0.0 deg, got {}", fight_bubble.angle);

    // 2. Must suppress thought bubble tail circle '……'
    assert!(!res.regions.iter().any(|r| (r.text.trim() == "……" || r.text.trim() == "...") && r.box_.x >= 400 && r.box_.y >= 300 && r.box_.y <= 450), "Must not detect bubble tail circles as '……'");

    // 3. Close combat dialogue and fireball SFX must be intact
    assert!(all_text.contains("近战") || all_text.contains("可怕"), "Must detect top bubble");
    assert!(all_text.contains("火球"), "Must detect SFX '火球！'");
}

#[test]
fn test_regression_page_169_seq_8() {
    let img_path = Path::new("tests/fixtures/page_169_seq_8.webp");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_169_seq_8.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Page 169 seq 8 detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // Exact count: 5 regions
    assert_eq!(res.regions.len(), 5, "Page 169 must have exactly 5 regions, got {}", res.regions.len());

    // Exact ground truth assertions for every region
    assert_eq!(res.regions[0].text, "是错觉吗？\n老大好像被\n追着打……", "Region r0 text mismatch");
    assert_eq!(res.regions[1].text, "你怎么可以不\n相信老大！", "Region r1 text mismatch");
    assert_eq!(res.regions[2].text, "好厉害！", "Region r2 text mismatch");
    assert_eq!(res.regions[3].text, "刚才我用的是\n“太岁”“撩\n尾”和“夜叉”\n招招取人要害，\n他居然都躲过\n了！", "Region r3 text mismatch");
    assert_eq!(res.regions[4].text, "不愧是顶尖高手……", "Region r4 text mismatch");

    // Guard: Region r0 right edge must NOT overlap Region r1 left edge (r0.x + r0.w < r1.x)
    assert!(
        res.regions[0].box_.x + res.regions[0].box_.w < res.regions[1].box_.x,
        "Region r0 right edge ({}) must be strictly less than Region r1 left edge ({})",
        res.regions[0].box_.x + res.regions[0].box_.w,
        res.regions[1].box_.x
    );

    // Guard: Region r4 right edge must fully enclose '……' (r4.w >= 325)
    assert!(
        res.regions[4].box_.w >= 325,
        "Region r4 must fully cover '……' ellipsis, got w={}",
        res.regions[4].box_.w
    );

}

#[test]
fn test_regression_page_170_seq_9() {
    let img_path = Path::new("tests/fixtures/page_170_seq_9.png");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_170_seq_9.png")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Page 170 seq 9 detected {} regions:", res.regions.len());
    for r in &res.regions {
        println!("  Region {}: box={:?}, angle={:.2}, text='{}', conf={:.2}", r.id, r.box_, r.angle, r.text.replace('\n', "\\n"), r.confidence);
    }

    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");

    // 1. RPG Status Window card must detect non-zero rotation angle
    let status_card = res.regions.iter().find(|r| r.text.contains("职业") || r.text.contains("法师") || r.text.contains("新手法师"));
    assert!(status_card.is_some(), "Must detect RPG status card");
    let status_card = status_card.unwrap();
    assert!(status_card.angle.abs() >= 10.0, "Slanted RPG card must detect non-zero rotation angle (|angle| >= 10.0 deg), got angle={}", status_card.angle);

    // 2. Status card lines must be unified into a single card region
    assert!(status_card.text.contains("职业") && status_card.text.contains("法师") && (status_card.text.contains("新手") || status_card.text.contains("割肉")), "Status card must encompass character info and equipment list");

    // 3. Lower dialogue bubble lines must be intact
    assert!(all_text.contains("菜鸟") || all_text.contains("这么"), "Must detect lower dialogue bubble");
}

#[test]
fn test_regression_page_171_seq_10() {
    let img_path = Path::new("tests/fixtures/page_171_seq_10.webp");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_171_seq_10.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Page 171 seq 10 detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // Exact count: 4 regions (no ghost boxes, no split duplicates)
    assert_eq!(res.regions.len(), 4, "Page 171 must have exactly 4 regions, got {}", res.regions.len());

    // Exact ground truth assertions for every region
    assert_eq!(res.regions[0].text, "我看你能嚣张\n到什么时候！", "Region r0 text mismatch");
    assert_eq!(res.regions[1].text, "那边池塘旁边有\n片空地，咱们到\n那边PK吧。", "Region r1 text mismatch");
    assert_eq!(res.regions[2].text, "池塘？水是不\n是很深？我坚\n决不要去！", "Region r2 text mismatch");
    assert_eq!(res.regions[3].text, "你对池塘都\n有阴影了！", "Region r3 text mismatch");

    // Guard: double-cloud must be merged — split fragments must not appear standalone
    assert!(
        !res.regions.iter().any(|r| r.text.contains("水是不") && !r.text.contains("池塘")),
        "Double-cloud bubble must be merged: 'water' fragment must not appear without '池塘'"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "水是不\n我坚"),
        "Split ghost fragment must be suppressed and merged into r2"
    );
}

#[test]
fn test_regression_page_172_seq_11() {
    let img_path = Path::new("tests/fixtures/page_172_seq_11.png");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_172_seq_11.png")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Page 172 seq 11 detected {} regions:", res.regions.len());
    for r in &res.regions {
        println!("  Region {}: box={:?}, text='{}', conf={:.2}", r.id, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. Bottom speech bubble '不是他自己说\n要PK嘛……' must clamp right boundary
    let bot_bubble = res.regions.iter().find(|r| r.text.contains("不是他自己说") || r.text.contains("要PK嘛"));
    assert!(bot_bubble.is_some(), "Must detect bottom speech bubble '不是他自己说\\n要PK嘛……'");
    let bot_bubble = bot_bubble.unwrap();
    assert!(bot_bubble.box_.x + bot_bubble.box_.w <= 285, "Bottom bubble right edge must not exceed x=285, got x={}, w={}", bot_bubble.box_.x, bot_bubble.box_.w);
    assert!(bot_bubble.box_.w <= 200, "Bottom bubble width must be clamped (w <= 200px), got w={}", bot_bubble.box_.w);

    // 2. All 3 upper speech bubbles in panel 2 must remain isolated
    let b_left = res.regions.iter().find(|r| r.text.contains("真嚣张") || r.text.contains("顶尖"));
    let b_mid = res.regions.iter().find(|r| r.text.contains("我们会长") || r.text.contains("25级"));
    let b_right = res.regions.iter().find(|r| r.text.contains("作死") || r.text.contains("作大") || r.text.contains("在死"));

    assert!(b_left.is_some(), "Must detect upper-left bubble");
    assert!(b_mid.is_some(), "Must detect upper-middle bubble");
    assert!(b_right.is_some(), "Must detect upper-right bubble");

    let id_left = b_left.unwrap().id.clone();
    let id_mid = b_mid.unwrap().id.clone();
    let id_right = b_right.unwrap().id.clone();

    assert_ne!(id_left, id_mid, "Left and middle bubbles must have separate IDs");
    assert_ne!(id_mid, id_right, "Middle and right bubbles must have separate IDs");
}

#[test]
fn test_regression_page_173_seq_12() {
    let img_path = Path::new("tests/fixtures/page_173_seq_12.webp");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_173_seq_12.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Page 173 seq 12 detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // Exact count: 4 regions (upper bubble, lower bubble, 2 SFX)
    assert_eq!(res.regions.len(), 4, "Page 173 must have exactly 4 regions, got {}", res.regions.len());

    // Exact ground truth assertions for every region
    assert_eq!(res.regions[0].text, "靠！反正\n最多挨顿\n打，不过\n是游戏，", "Region r0 text mismatch");
    assert_eq!(res.regions[1].text, "真是的，\n自己又不\n会受伤", "Region r1 text mismatch");
    assert_eq!(res.regions[2].text, "砰！", "Region r2 text mismatch");
    assert_eq!(res.regions[3].text, "啪！", "Region r3 text mismatch");

    // Guard: top "……" thought bubble must be suppressed, not emitted standalone
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "\u{2026}\u{2026}"),
        "Top '\u{2026}\u{2026}' thought bubble must be suppressed"
    );
}

#[test]
fn test_regression_page_175_seq_14() {
    let img_path = Path::new("tests/fixtures/page_175_seq_14.jpg");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_175_seq_14.jpg")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Page 175 seq 14 detected {} regions:", res.regions.len());
    for r in &res.regions {
        println!("  Region {}: box={:?}, angle={:.2}, text='{}', conf={:.2}", r.id, r.box_, r.angle, r.text.replace('\n', "\\n"), r.confidence);
    }

    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");

    // 1. Chapter subtitle '第一话·重生' must be detected
    let subtitle = res.regions.iter().find(|r| r.text.contains("第一话") || r.text.contains("重生"));
    assert!(subtitle.is_some(), "Must detect chapter subtitle '第一话·重生'");
    assert!(all_text.contains("重生") || all_text.contains("第一话"), "Subtitle text must be present");
}

#[test]
fn test_regression_page_176_seq_15() {
    let img_path = Path::new("tests/fixtures/page_176_seq_15.webp");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_176_seq_15.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Page 176 seq 15 detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // Exact count: 3 regions (unified left bubble, upper-right bubble, lower dialogue block)
    assert_eq!(res.regions.len(), 3, "Page 176 must have exactly 3 regions, got {}", res.regions.len());

    // Exact ground truth assertions for every region
    assert_eq!(res.regions[0].text, "结果……\n就变成了\n这样！", "Region r0 text mismatch");
    assert_eq!(res.regions[1].text, "就是说\n要玩这个游戏\n我只能\n当法师\n了？", "Region r1 text mismatch");
    assert_eq!(res.regions[2].text, "搞得我玩这个游戏的\n目的全部丧失了嘛！\n阿发这小子，见到非\n揍他一顿！", "Region r2 text mismatch");

    // Guard: garbled column-reading must not appear in r0
    assert!(
        !res.regions.iter().any(|r| r.text.contains("果变样") || r.text.contains("结就")),
        "r0 must not be read in wrong column order ('果变样' / '结就' are garbled OCR artifacts)"
    );

    // Guard: "……" must not be split off as a standalone region
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "\u{2026}\u{2026}"),
        "'\u{2026}\u{2026}' must be part of r0 text, not a standalone region"
    );

    // Spatial boundary invariant: r0 must span the full width of the bubble so '成了' and '……' are not truncated
    assert!(
        res.regions[0].box_.w >= 135 && (res.regions[0].box_.x + res.regions[0].box_.w) >= 210,
        "Region r0 must cover the full bubble width (expected x+w >= 210, got x={}, w={})",
        res.regions[0].box_.x, res.regions[0].box_.w
    );
}

#[test]
fn test_regression_page_186_seq_25() {
    let img_path = Path::new("tests/fixtures/page_186_seq_25.png");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_186_seq_25.png")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Page 186 seq 25 detected {} regions:", res.regions.len());
    for r in &res.regions {
        println!("  Region {}: box={:?}, angle={:.2}, text='{}', conf={:.2}", r.id, r.box_, r.angle, r.text.replace('\n', "\\n"), r.confidence);
    }

    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");

    // 1. Must suppress faint top-right platform watermark '腾讯动漫' / '信机动摄'
    assert!(!all_text.contains("信机动摄") && !res.regions.iter().any(|r| r.box_.x >= 700 && r.box_.y <= 250 && (r.text.contains("动漫") || r.text.contains("信机"))), "Must not detect faint corner platform watermark as dialogue");

    // 2. Hologram status card '【顶级人物十名。】\n(附带一头顶级宠物)' must detect non-zero rotation angle
    let card = res.regions.iter().find(|r| r.text.contains("附带一头") || (r.text.contains("顶级") && r.box_.y >= 500));
    assert!(card.is_some(), "Must detect hologram status card");
    let card = card.unwrap();
    assert!(card.angle.abs() >= 5.0, "Slanted hologram card must detect non-zero rotation angle (|angle| >= 5.0 deg), got angle={}", card.angle);

    // 3. Stacked snowman dialogue bubbles in upper panel must remain cleanly separated
    let b_top = res.regions.iter().find(|r| r.text.contains("连出一堆") || r.text.contains("伐木工"));
    let b_bot = res.regions.iter().find(|r| r.text.contains("十万山林") || r.text.contains("女巫"));
    assert!(b_top.is_some(), "Must detect upper dialogue bubble");
    assert!(b_bot.is_some(), "Must detect lower connected dialogue bubble");
    assert_ne!(b_top.unwrap().id, b_bot.unwrap().id, "Stacked dialogue bubbles must have distinct region IDs");
}

#[test]
fn test_regression_page_189_seq_26() {
    let img_path = Path::new("tests/fixtures/page_189_seq_26.png");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_189_seq_26.png")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Page 189 seq 26 detected {} regions:", res.regions.len());
    for r in &res.regions {
        println!("  Region {}: box={:?}, angle={:.2}, text='{}', conf={:.2}", r.id, r.box_, r.angle, r.text.replace('\n', "\\n"), r.confidence);
    }

    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");

    // 1. Action sound effects must be detected
    let sfx_regions: Vec<_> = res.regions.iter().filter(|r| r.text.contains("嗖") || r.text.contains("沙")).collect();
    assert!(!sfx_regions.is_empty(), "Must detect action SFX");

    // 2. Speech bubble '大姐大，\n轻，轻点\n.……' must clamp right boundary
    let bubble = res.regions.iter().find(|r| r.text.contains("大姐大") || r.text.contains("轻点"));
    assert!(bubble.is_some(), "Must detect '大姐大，轻，轻点……' bubble");
    let bubble = bubble.unwrap();
    assert!(bubble.box_.x + bubble.box_.w <= 570, "Bubble right edge must not exceed x=570, got x={}, w={}", bubble.box_.x, bubble.box_.w);
    assert!(bubble.box_.w <= 300, "Bubble width must be clamped (w <= 300px), got w={}", bubble.box_.w);

    // 3. Narration blocks and machine label must be detected
    assert!(all_text.contains("又过了一段时间"), "Must detect top narration");
    assert!(all_text.contains("抽奖机"), "Must detect machine label '抽奖机'");
    assert!(all_text.contains("百无聊赖") || all_text.contains("点化"), "Must detect middle narration");
    assert!(all_text.contains("创世神") || all_text.contains("系统功能"), "Must detect lower narration");
}

#[test]
fn test_regression_page_192_seq_28() {
    let img_path = Path::new("tests/fixtures/page_192_seq_28.png");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_192_seq_28.png")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Page 192 seq 28 detected {} regions (dimensions {}x{}):", res.regions.len(), img.width(), img.height());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // Exact count: 2 narration regions
    assert_eq!(res.regions.len(), 2, "Page 192 must have exactly 2 narration regions, got {}", res.regions.len());

    // Exact ground truth assertions for every region
    assert_eq!(res.regions[0].text, "只要这缕人性尚存，\n便可作为锚点，维系\n创世神的沉睡，暂缓\n彻底的疯狂。", "Region r0 text mismatch");
    assert_eq!(res.regions[1].text, "但代价是……脱离了\n西方教廷信仰的支撑，\n这点人性如同无根之水，\n不断逸散，注定走向\n湮灭。", "Region r1 text mismatch");

    // Guard: top narration must not be split across the dark-band boundary into 2 regions
    assert!(
        !res.regions.iter().any(|r|
            r.text.contains("创世神的沉睡") && !r.text.contains("人性尚存")
        ),
        "Top narration must not be split — '创世神的沉睡' and '人性尚存' must be in the same region"
    );

    // Guard: OCR garbage strings must never appear
    assert!(
        !res.regions.iter().any(|r|
            r.text.contains("皮1F") || r.text.contains("列熙") || r.text.contains("非习")
        ),
        "OCR garbage ('皮1F', '列熙', '非习') must not appear in any region"
    );
}

#[test]
fn test_regression_page_197_seq_33() {
    let img_path = Path::new("tests/fixtures/page_197_seq_33.png");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_197_seq_33.png")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Page 197 seq 33 detected {} regions:", res.regions.len());
    for r in &res.regions {
        println!("  Region {}: box={:?}, text='{}', conf={:.2}", r.id, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");

    // 1. Text '明车易挡……' must capture trailing ellipsis dots with full width coverage >= 500px (ending at x >= 720)
    let chariot = res.regions.iter().find(|r| r.text.contains("明车易挡"));
    assert!(chariot.is_some(), "Must detect narration '明车易挡……'");
    let chariot = chariot.unwrap();
    assert!(chariot.text.ends_with("……") || chariot.text.ends_with("..."), "Text must contain full trailing ellipsis '……', got '{}'", chariot.text);
    assert!(chariot.box_.x + chariot.box_.w >= 700, "Region box must encompass all trailing ellipsis dots for clean inpainting (x + w >= 700), got x={}, w={}", chariot.box_.x, chariot.box_.w);

    // 2. SFX '哒' must be detected
    assert!(all_text.contains("哒"), "Must detect SFX '哒'");
}

#[test]
fn test_regression_page_198_seq_34() {
    let img_path = Path::new("tests/fixtures/page_198_seq_34.png");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_198_seq_34.png")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Page 198 seq 34 detected {} regions:", res.regions.len());
    for r in &res.regions {
        println!("  Region {}: box={:?}, text='{}', conf={:.2}", r.id, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");

    // 1. Bottom-right spiky speech bubble '这辆比前两\n辆大上一圈……' must clamp right edge away from the right border (x + w <= 760) and have angle 0.0
    let spiky_bubble = res.regions.iter().find(|r| r.text.contains("大上一圈") || r.text.contains("绝不简单") || r.text.contains("这辆比前两"));
    assert!(spiky_bubble.is_some(), "Must detect bottom-right spiky speech bubble");
    let spiky_bubble = spiky_bubble.unwrap();
    assert!(spiky_bubble.box_.x + spiky_bubble.box_.w <= 765, "Spiky bubble right edge must not reach extreme right page edge (x + w <= 765), got x={}, w={}", spiky_bubble.box_.x, spiky_bubble.box_.w);
    assert!(spiky_bubble.box_.w <= 245, "Spiky bubble width must be clamped (w <= 245px), got w={}", spiky_bubble.box_.w);
    assert_eq!(spiky_bubble.angle, 0.0, "Spiky speech bubble must have angle 0.0 deg, got {}", spiky_bubble.angle);

    // 2. Cyan status card and middle bubble must be detected
    assert!(all_text.contains("神话级") || all_text.contains("火箭铁滑车") || all_text.contains("强哥"), "Must detect cyan status item card");
    assert!(all_text.contains("第三辆"), "Must detect middle speech bubble '第三辆……'");
}

#[test]
fn test_regression_page_204_seq_38() {
    let img_path = Path::new("tests/fixtures/page_204_seq_38.png");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_204_seq_38.png")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Page 204 seq 38 detected {} regions:", res.regions.len());
    for r in &res.regions {
        println!("  Region {}: box={:?}, angle={:.2}, text='{}', conf={:.2}", r.id, r.box_, r.angle, r.text.replace('\n', "\\n"), r.confidence);
    }

    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");

    // 1. Must suppress background illustration emotion surprise mark '！' in panel 2 (near x=513, y=784)
    assert!(!res.regions.iter().any(|r| (r.text.trim() == "！" || r.text.trim() == "!") && r.box_.y >= 700 && r.box_.y <= 1000 && r.box_.x >= 450 && r.box_.x <= 600), "Must not detect background surprise illustration graphic as dialogue '！'");

    // 2. Dialogue bubble and cough SFX must be detected, dialogue bubble must have angle 0.0
    let skin_bubble = res.regions.iter().find(|r| r.text.contains("皮厚") || r.text.contains("没事"));
    assert!(skin_bubble.is_some(), "Must detect dialogue bubble '没事！俺皮厚得很！'");
    assert_eq!(skin_bubble.unwrap().angle, 0.0, "Dialogue bubble must have angle 0.0 deg, got {}", skin_bubble.unwrap().angle);
    assert!(all_text.contains("咳"), "Must detect SFX '咳！咳！'");
}






















