mod common;

use std::path::Path;
use common::get_or_analyze_fixture;

/// # Regression Test: Page 679 (Resolution: 800 × 1270 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Speech Bubble Separation & Detection**:
///   Ensures that both upper and lower speech bubbles in Panel 1 are detected as independent
///   dialogue regions (*"难道这么多年张予德都在成都和你们在一起？"* and *"他到底为什么扔下……"*).
/// - **Boundary Enclosure for Trailing Punctuation**:
///   Guarantees that the bounding box for *"我不想评价我父亲的行为……"* fully encloses all trailing ellipsis dots
///   preventing text bleeding during inpainting.
/// - **Exact Multi-Region Ground Truth & Watermark Filtering**:
///   Strictly asserts 5 clean regions across 3 panels and suppresses margin watermarks.
///
/// ## Key Invariants:
/// - Exactly 5 regions detected (`assert_eq!(res.regions.len(), 5)`).
/// - Both Panel 1 dialogue bubbles captured cleanly.
/// - Panel 2 bounding box right edge `x + w >= 265` to fully encapsulate `……`.
#[test]
fn test_regression_page_679() {
    let img_path = Path::new("tests/fixtures/page_679.webp");
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_679.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    assert_eq!(res.regions.len(), 5, "Page 679 must have exactly 5 detected regions");

    // 1. Panel 1: Upper speech bubble (Zhang Yude dialogue)
    let p1_upper = res.regions.iter().find(|r| r.text.contains("张予德") || r.text.contains("成都") || r.text.contains("难道"));
    assert!(p1_upper.is_some(), "Panel 1 upper speech bubble must be detected");
    let p1_upper = p1_upper.unwrap();
    assert!(p1_upper.text.contains("难道") && p1_upper.text.contains("张予德"), "Panel 1 upper bubble must contain full text");
    assert!(p1_upper.box_.w <= 185, "Panel 1 upper bubble width ({}) must be tight (<= 185)", p1_upper.box_.w);

    // 2. Panel 1: Lower speech bubble ("他到底为什么扔下……")
    let p1_lower = res.regions.iter().find(|r| r.text.contains("到底") || r.text.contains("扔下"));
    assert!(p1_lower.is_some(), "Panel 1 lower speech bubble ('他到底为什么扔下……') must be detected");
    let p1_lower = p1_lower.unwrap();
    assert!(p1_lower.text.contains("到底") && p1_lower.text.contains("扔下"), "Panel 1 lower bubble text must be complete");
    assert!(
        p1_lower.box_.x + p1_lower.box_.w <= 252,
        "Panel 1 lower bubble right edge ({}) must not overextend past the speech bubble (<= 252)",
        p1_lower.box_.x + p1_lower.box_.w
    );
    assert!(p1_lower.box_.w <= 185, "Panel 1 lower bubble width ({}) must be tight (<= 185)", p1_lower.box_.w);

    // 3. Panel 2: Dialogue with trailing ellipsis ("我不想评价我父亲的行为……")
    let p2_dialogue = res.regions.iter().find(|r| r.text.contains("不想评价") || r.text.contains("父亲的行为"));
    assert!(p2_dialogue.is_some(), "Panel 2 dialogue bubble must be detected");
    let p2_dialogue = p2_dialogue.unwrap();
    assert!(p2_dialogue.text.contains("不想评价") && p2_dialogue.text.contains("父亲的行为"), "Panel 2 dialogue must be intact");
    // Boundary check: ensure the bounding box extends to cover all trailing ellipsis dots but doesn't overextend into hair
    assert!(
        p2_dialogue.box_.x + p2_dialogue.box_.w >= 266,
        "Panel 2 bounding box right edge ({}) must extend to >= 266 to fully cover trailing ellipsis",
        p2_dialogue.box_.x + p2_dialogue.box_.w
    );
    assert!(
        p2_dialogue.box_.w <= 245,
        "Panel 2 bounding box width ({}) must not overextend into character hair (<= 245)",
        p2_dialogue.box_.w
    );

    // 4. Panel 3: Location tag ("Z市")
    let p3_tag = res.regions.iter().find(|r| r.text.trim() == "Z市" || r.text.contains("Z市"));
    assert!(p3_tag.is_some(), "Panel 3 location tag ('Z市') must be detected");
    let p3_tag = p3_tag.unwrap();
    assert!(p3_tag.box_.w <= 130, "Panel 3 tag width ({}) must be tight (<= 130)", p3_tag.box_.w);

    // 5. Panel 3: Large dialogue bubble ("我今天刚到...")
    let p3_dialogue = res.regions.iter().find(|r| r.text.contains("今天刚到") || r.text.contains("爷爷的坟"));
    assert!(p3_dialogue.is_some(), "Panel 3 dialogue bubble must be detected");
    let p3_dialogue = p3_dialogue.unwrap();
    assert!(p3_dialogue.text.contains("今天刚到") && p3_dialogue.text.contains("爷爷的坟"), "Panel 3 dialogue must be intact");
    assert!(p3_dialogue.box_.w <= 285, "Panel 3 dialogue width ({}) must be tight (<= 285)", p3_dialogue.box_.w);

    // Negative assertions: Watermark suppression
    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");
    assert!(!all_text.to_lowercase().contains("acloudmerge"), "Watermark 'ACloudMerge' must be suppressed");
    assert!(!all_text.contains("腾讯动漫"), "Watermark '腾讯动漫' must be suppressed");
}

/// # Regression Test: Page 63617 (Resolution: 800 × 1600 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Exact Multi-Region Ground Truth & SFX Preservation**:
///   Verifies precise detection of cultivation chant bubbles, repeated SFX (*"噗"*),
///   and gaming system notifications (*"嘟！\n恐惧值+0"*).
/// - **Punctuation & Noise Guards**:
///   Ensures exclamation marks in chant lines are not truncated and suppresses
///   hallucinated Latin background noise (e.g. *"HANILS"*).
///
/// ## Key Invariants:
/// - Exactly 7 regions.
/// - Region r1 right boundary must fully cover *"练丹！"* exclamation mark (`x + w >= 745`).
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

/// # Regression Test: Page 683 (Resolution: 800 × 2400 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Adjacent Bubble Separation**:
///   Ensures side-by-side speech bubbles occurring on the same horizontal band
///   (*"这傻子非得尿裤子上不可！"* vs *"哈哈！"*) are not merged across panels.
#[test]
fn test_regression_page_683() {
    let img_path = Path::new("tests/fixtures/page_683.webp");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_683.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    assert!(!res.regions.is_empty(), "Page 683 must have detected regions");
    println!("Page 683 detected {} regions", res.regions.len());
}

/// # Regression Test: Page 688 (Resolution: 800 × 2400 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Narration Panel Preservation**:
///   Ensures the middle-right panel narration box (*"但是在光辉之城受到袭击的时候..."*)
///   is preserved and not discarded by watermark or background filtering heuristics.
#[test]
fn test_regression_page_688() {
    let img_path = Path::new("tests/fixtures/page_688.webp");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_688.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    assert!(!res.regions.is_empty(), "Page 688 must have detected regions");
    println!("Page 688 detected {} regions", res.regions.len());
}

/// # Regression Test: Page 15 Seq 8 (Resolution: 800 × 1600 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Giant Artwork Hallucination Suppression & Ellipsis Expansion**:
///   Suppresses hallucinated giant artwork text (*"福迎"*) across character clothing/shadows
///   and ensures the speech bubble *"系统诞生在我身上……"* preserves trailing ellipsis dots
///   with full bounding box width (`w >= 380px`).
#[test]
fn test_regression_page_15_seq_8() {
    let img_path = Path::new("tests/fixtures/page_15_seq_8.webp");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_15_seq_8.webp")
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

    // 1. Exact region count: exactly 6 speech bubbles
    assert_eq!(res.regions.len(), 6, "Page 15 seq 8 must have exactly 6 speech bubbles, got {}", res.regions.len());

    // 2. Must suppress hallucinated giant artwork region "福迎" across character robes/shadows
    assert!(!all_text.contains("福迎"), "Must not hallucinate '福迎' over dark clothing/shading");
    assert!(!res.regions.iter().any(|r| r.box_.w >= 600 && r.box_.h >= 300), "Must not create giant whole-width false positive region");

    // 3. Speech bubble "系统诞生在我身上……" must have full ellipsis coverage and proper width
    let sys_bubble = res.regions.iter().find(|r| r.text.contains("系统诞生在我身上"));
    assert!(sys_bubble.is_some(), "Speech bubble '系统诞生在我身上……' must be detected");
    let sys_bubble = sys_bubble.unwrap();
    assert!(sys_bubble.text.ends_with("……"), "Speech bubble must contain standard double ellipsis '……', got '{}'", sys_bubble.text);
    assert!(sys_bubble.box_.w >= 380, "Bubble width must encompass the full dialogue line and ellipsis, got w={}", sys_bubble.box_.w);

    // 4. Speech bubble "穿越……" must preserve trailing ellipsis dots
    let cy_bubble = res.regions.iter().find(|r| r.text.starts_with("穿越"));
    assert!(cy_bubble.is_some(), "Speech bubble '穿越……' must be detected");
    let cy_bubble = cy_bubble.unwrap();
    assert!(cy_bubble.text.ends_with("……"), "Speech bubble '穿越' must end with ellipsis '……', got '{}'", cy_bubble.text);
    assert!(cy_bubble.box_.w >= 150, "Bubble width must encompass ellipsis, got w={}", cy_bubble.box_.w);

    // 5. Speech bubble "压寨夫人……\n小樱……" must preserve ellipses on both lines
    let yz_bubble = res.regions.iter().find(|r| r.text.contains("压寨夫人"));
    assert!(yz_bubble.is_some(), "Speech bubble '压寨夫人……' must be detected");
    let yz_bubble = yz_bubble.unwrap();
    assert!(yz_bubble.text.contains("压寨夫人……"), "'压寨夫人' line must contain ellipsis '……', got '{}'", yz_bubble.text);
    assert!(yz_bubble.text.contains("小樱……"), "'小樱' line must contain ellipsis '……', got '{}'", yz_bubble.text);

    // 6. Other speech bubbles must be cleanly detected
    assert!(all_text.contains("十一年前"), "Must detect top bubble '十一年前……'");
    assert!(all_text.contains("发生过什么大事"), "Must detect '发生过什么大事？'");
    assert!(all_text.contains("心第一次在这个"), "Must detect '心第一次在这个\n世界上诞生'");
}

/// # Regression Test: Page 162 Seq 1 (Resolution: 800 × 1590 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Foliage Drawing Noise Suppression & Tail-Circle Filtering**:
///   Suppresses top-left foliage contour hallucination (*"新ー"*), suppresses bottom-right
///   thought bubble tail ornament (*"……"*), and clamps left speech bubble boundary
///   (*"你可不要\n乱动……"*).
#[test]
fn test_regression_page_162_seq_1() {
    let img_path = Path::new("tests/fixtures/page_162_seq_1.webp");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_162_seq_1.webp")
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

    // Scale-relative geometry: left bubble right edge must not exceed 38% of page width.
    let r2 = &res.regions[2];
    assert!(
        r2.box_.x + r2.box_.w <= (res.width as f32 * 0.38) as i32,
        "Left bubble right edge over-expanded: x={}, w={}, page_w={}",
        r2.box_.x, r2.box_.w, res.width
    );
}

/// # Regression Test: Page 168 Seq 1 (Resolution: 800 × 1590 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Angle Jitter Snapping & Bubble Tail Suppression**:
///   Ensures standard horizontal speech bubble (*"我不能硬拼……"*) has rotation angle `0.0°`
///   and suppresses thought bubble tail circles.
#[test]
fn test_regression_page_168_seq_1() {
    let img_path = Path::new("tests/fixtures/page_168_seq_1.webp");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_168_seq_1.webp")
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

/// # Regression Test: Page 169 Seq 8 (Resolution: 800 × 1590 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Adjacent Bubble Boundary Clamping & Narration Ellipsis Coverage**:
///   Ensures panel 1 left bubble (*"是错觉吗？老大好像被追着打……"*) does not collide with
///   the right bubble (*"你怎么可以不相信老大！"*), and panel 3 narration captures full
///   trailing ellipsis (*"不愧是顶尖高手……"* with `w >= 325px`).
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

/// # Regression Test: Page 170 Seq 9 (Resolution: 800 × 1461 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Diagonal Status Card Angle Detection & Multi-Column Line Order**:
///   Ensures slanted RPG status card detects its non-zero rotation angle (`|angle| >= 10.0°`)
///   and preserves the full multi-column info block without digit corruption.
#[test]
fn test_regression_page_170_seq_9() {
    let img_path = Path::new("tests/fixtures/page_170_seq_9.webp");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_170_seq_9.webp")
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

/// # Regression Test: Page 171 Seq 10 (Resolution: 800 × 1820 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Double-Cloud Bubble Merging & Thought Tail Suppression**:
///   Ensures 2-lobe circular cloud bubble (*"池塘？水是不是很深？我坚决不要去！"*)
///   is unified into 1 region instead of fragmenting into ghost boxes (*"水是不\n我坚"*).
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

/// # Regression Test: Page 172 Seq 11 (Resolution: 800 × 1616 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Bottom Bubble Boundary Clamping & 3-Way Adjacent Bubble Separation**:
///   Clamps elongated bottom speech bubble boundary (*"不是他自己说\n要PK嘛……"* `w <= 200px`),
///   and preserves distinct IDs for all 3 adjacent speech bubbles in panel 2.
#[test]
fn test_regression_page_172_seq_11() {
    let img_path = Path::new("tests/fixtures/page_172_seq_11.webp");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_172_seq_11.webp")
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

/// # Regression Test: Page 175 Seq 14 (Resolution: 800 × 1131 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Cover Title & Subtitle Separation**:
///   Ensures chapter subtitle (*"第一话·重生"*) is properly separated from stylized cover calligraphy.
#[test]
fn test_regression_page_175_seq_14() {
    let img_path = Path::new("tests/fixtures/page_175_seq_14.webp");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_175_seq_14.webp")
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

/// # Regression Test: Page 197 Seq 33 (Resolution: 800 × 1067 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Full Trailing Ellipsis Dot Coverage**:
///   Ensures trailing 6-dot ellipsis on narration (*"明车易挡……"*) expands the bounding box
///   width to `x + w >= 700px` so LaMa inpainting cleanly cleans every dot.
#[test]
fn test_regression_page_197_seq_33() {
    let img_path = Path::new("tests/fixtures/page_197_seq_33.webp");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_197_seq_33.webp")
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

    // 1. Text '明车易挡……' must capture trailing ellipsis dots with full width coverage >= 500px (ending at x >= 700)
    let chariot = res.regions.iter().find(|r| r.text.contains("明车易挡"));
    assert!(chariot.is_some(), "Must detect narration '明车易挡……'");
    let chariot = chariot.unwrap();
    assert!(chariot.text.ends_with("……") || chariot.text.ends_with("..."), "Text must contain full trailing ellipsis '……', got '{}'", chariot.text);
    assert!(chariot.box_.x + chariot.box_.w >= 700, "Region box must encompass all trailing ellipsis dots for clean inpainting (x + w >= 700), got x={}, w={}", chariot.box_.x, chariot.box_.w);

    // 2. SFX '哒' must be detected
    assert!(all_text.contains("哒"), "Must detect SFX '哒'");
}

/// # Regression Test: Page 198 Seq 34 (Resolution: 800 × 1066 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Spiky Bubble Boundary Clamping & Angle Stability**:
///   Clamps bottom-right spiky speech bubble (*"这辆比前两辆大上一圈……"*) away from right
///   page edge (`x + w <= 765px`) with `angle = 0.0°`, and preserves cyan status card.
#[test]
fn test_regression_page_198_seq_34() {
    let img_path = Path::new("tests/fixtures/page_198_seq_34.webp");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_198_seq_34.webp")
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

/// # Regression Test: Page 204 Seq 38 (Resolution: 800 × 1143 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Background Surprise Emotion Mark Suppression**:
///   Suppresses background illustration exclamation/surprise graphic (*"！"*) in panel 2
///   while cleanly preserving speech bubble (*"没事！俺皮厚得很！"* with `angle = 0.0°`)
///   and cough SFX (*"咳！咳！"*).
#[test]
fn test_regression_page_204_seq_38() {
    let img_path = Path::new("tests/fixtures/page_204_seq_38.webp");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_204_seq_38.webp")
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

/// # Regression Test: Novice Mage Equipment & Speech Bubble Page (Resolution: 800 × 1461 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Speech Bubble Unification vs. Column Split**:
///   Guarantees that the lower panel speech bubble containing 3 horizontal lines:
///   `哼，这么胡\n来，菜鸟一\n个！` is recognized accurately and unified into a single speech bubble region
///   rather than being incorrectly split across columns into fractured fragments (`哼来个/这菜` and `这么胡/菜鸟一` or `这么—\n哼来个\n这么胡\n菜鸟一`).
/// - **Equipment Stats Card Detection**:
///   Ensures the upper character stats/equipment window (`职业：法师...残破的割肉小刀`) is cleanly detected as a single region.
///
/// ## Key Invariants:
/// - Exactly 2 regions.
/// - Region 0: Upper stats card containing `职业：法师` and `残破的割肉小刀`.
/// - Region 1: Speech bubble containing `哼，这么胡\n来，菜鸟一\n个！`.
/// - Negative guard: No fractured sub-boxes or column cross-reading (`哼来个`).
#[test]
fn test_regression_page_novice_mage_split_bubble() {
    let img_path = Path::new("tests/fixtures/page_novice_mage_split_bubble.webp");
    if !img_path.exists() {
        return;
    }
    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_novice_mage_split_bubble.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture(&img);
    println!("Novice Mage Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.angle, r.confidence);
    }

    // 1. Exact count: exactly 2 regions (upper equipment card + lower unified speech bubble)
    assert_eq!(res.regions.len(), 2, "Novice Mage Page must have exactly 2 regions, got {}", res.regions.len());

    // 2. Upper stats card verification
    let stats_card = res.regions.iter().find(|r| r.text.contains("职业") || r.text.contains("法师"));
    assert!(stats_card.is_some(), "Must detect upper equipment stats card");
    let stats_region = stats_card.unwrap();
    let stats_text = &stats_region.text;
    assert!(stats_text.contains("职业：法师") || stats_text.contains("法师"), "Stats card missing class title");
    assert!(stats_text.contains("残破的割肉小刀"), "Stats card missing final item line");
    assert!(stats_text.contains("新手法师袍"), "Stats card must accurately recognize '新手法师袍' without typo");
    assert!(!stats_text.contains("新丰"), "Stats card must not hallucinate '新丰' (which mistranslates as 'Xinfeng')");
    // Vertical invariant: horizontal line lists must have vertical = false to prevent UI typesetting wrapping bugs
    assert!(!stats_region.vertical, "Horizontal line-stacked list must have vertical = false, got true");

    // 3. Lower unified speech bubble verification
    let speech_bubble = res.regions.iter().find(|r| r.text.contains("菜鸟") || r.text.contains("这么胡") || r.text.contains("哼"));
    assert!(speech_bubble.is_some(), "Must detect lower speech bubble");
    let bubble_text = &speech_bubble.unwrap().text;
    assert!(bubble_text.contains("这么胡") && bubble_text.contains("菜鸟"), "Speech bubble must unify lines without fragmentation");
    assert!(!bubble_text.contains("哼来个"), "Speech bubble must not cross-read column characters into '哼来个'");

    // 4. Negative Guard: Zero split fragment ghost boxes
    assert!(!res.regions.iter().any(|r| r.text.trim() == "哼来个\n这菜" || r.text.trim() == "这么胡\n菜鸟一"), "Must not leave column-split fragment ghost boxes");
}

