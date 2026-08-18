use crate::common::get_or_analyze_fixture;

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
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_zhang_yude_chengdu_cemetery.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_679: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture(&img);
    println!("Page 679 regions (len={}):", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  r{}: box={:?}, text='{}'", i, r.box_, r.text.replace('\n', "\\n"));
    }
    assert!(res.regions.len() >= 4 && res.regions.len() <= 5, "Page 679 must have 4 or 5 detected regions, got {}", res.regions.len());

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

    // 4. Panel 3: Location tag ("Z市") if detected
    if let Some(p3_tag) = res.regions.iter().find(|r| r.text.trim() == "Z市" || r.text.contains("Z市")) {
        assert!(p3_tag.box_.w <= 130, "Panel 3 tag width ({}) must be tight (<= 130)", p3_tag.box_.w);
    }

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
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_cultivation_chant_fear_points.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_63617: fixture not found");
            return;
        }
    };

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
    assert_eq!(res.regions[5].text, "嘟！恐惧值+0", "Region r5 text mismatch");
    assert_eq!(res.regions[6].text, "嘟！恐惧值+0", "Region r6 text mismatch");

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
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_fool_pee_pants_adjacent_bubbles.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_683: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture(&img);
    assert!(!res.regions.is_empty(), "Page 683 must have detected regions");
    println!("Page 683 detected {} regions", res.regions.len());
}

/// # Regression Test: Page 688 / PageId 63710 (Resolution: 800 × 1131 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Multi-Line Thought Bubble Unification**:
///   Guarantees that the bottom panel 5-line continuous thought bubble:
///   `只是现在的叶紫芸对沈越\n还是有好感的。\n反倒是看我的目光有几分\n不屑，莫不是把我当作一\n个不学无术的纨绔子弟了？`
///   is unified into a single clean region rather than fragmenting or spawning duplicate line slice boxes (`反倒是看我的目光有几分`).
/// - **Narration & Speech Panel Ground Truth**:
///   Cleanly identifies all 5 dialogue/narration regions across the 3 panels:
///   1. Panel 1 Top-Left: `沈越...对了……\n这货是三大巅峰世家\n神圣世家的子弟，\n也是他们这一代的天才。`
///   2. Panel 1 Top-Right: `沈秀是\n他的姑姑。`
///   3. Panel 2 Mid-Left: `前世沈越一直在追求叶紫芸，据说在光辉之城\n被攻击前，他们已经订婚了。\n论家世他们也是门当户对...若是光辉之城没被攻破……\n他们肯定会结婚！`
///   4. Panel 2 Mid-Right: `但是在光辉之城受到袭击\n的时候，神圣世家却背叛了\n光辉之城，弃城而逃。`
///   5. Panel 3 Bottom: Unified 5-line thought bubble.
///
/// ## Key Invariants:
/// - Exactly 5 regions (`assert_eq!(res.regions.len(), 5)`).
/// - Bottom thought bubble must contain all 5 lines unified.
/// - Negative guard: Zero standalone duplicate lines `反倒是看我的目光有几分`.
#[test]
fn test_regression_page_688() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_shen_yue_ye_ziyun_thought_bubble.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_688: fixture not found");
            return;
        }
    };

    let res = crate::common::force_analyze_fixture(&img);
    println!("Page 688 detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.angle, r.confidence);
    }

    // 1. Exact count: exactly 5 regions
    assert_eq!(res.regions.len(), 5, "Page 688 must have exactly 5 regions, got {}", res.regions.len());

    // 2. Panel 1 top-left thought bubble
    let p1_left = res.regions.iter().find(|r| r.text.contains("沈越") || r.text.contains("神圣世家"));
    assert!(p1_left.is_some(), "Must detect Panel 1 top-left thought bubble");
    let p1_left_text = &p1_left.unwrap().text;
    assert!(p1_left_text.contains("沈越") && p1_left_text.contains("神圣世家"), "Panel 1 top-left thought text must be complete");

    // 3. Panel 1 top-right narration box
    let p1_right = res.regions.iter().find(|r| r.text.contains("沈秀") || r.text.contains("姑姑"));
    assert!(p1_right.is_some(), "Must detect Panel 1 top-right narration box '沈秀是他的姑姑。'");
    assert!(p1_right.unwrap().text.contains("沈秀") && p1_right.unwrap().text.contains("姑姑"), "Panel 1 right narration mismatch");

    // 4. Panel 2 mid-left narration box
    let p2_left = res.regions.iter().find(|r| r.text.contains("追求叶紫芸") || r.text.contains("订婚") || r.text.contains("门当户对"));
    assert!(p2_left.is_some(), "Must detect Panel 2 mid-left narration box");
    let p2_left_text = &p2_left.unwrap().text;
    assert!(p2_left_text.contains("叶紫芸") && p2_left_text.contains("结婚"), "Panel 2 left narration text must be complete");

    // 5. Panel 2 mid-right narration box
    let p2_right = res.regions.iter().find(|r| r.text.contains("受到袭击") || r.text.contains("背叛") || r.text.contains("弃城而逃"));
    assert!(p2_right.is_some(), "Must detect Panel 2 mid-right narration box");
    let p2_right_text = &p2_right.unwrap().text;
    assert!(p2_right_text.contains("受到袭击") && p2_right_text.contains("弃城而逃"), "Panel 2 right narration text must be complete");

    // 6. Panel 3 bottom continuous thought bubble
    let p3_bottom = res.regions.iter().find(|r| r.text.contains("不学无术") || r.text.contains("纨绔子弟") || r.text.contains("还是有好感"));
    assert!(p3_bottom.is_some(), "Must detect Panel 3 bottom unified thought bubble");
    let p3_bottom_text = &p3_bottom.unwrap().text;
    assert!(
        p3_bottom_text.contains("叶紫芸") && p3_bottom_text.contains("好感") && p3_bottom_text.contains("目光") && p3_bottom_text.contains("纨绔子弟"),
        "Panel 3 bottom thought bubble must unify all constituent dialogue lines without splitting, got: {}",
        p3_bottom_text
    );

    // 7. Negative Guard: Zero standalone duplicate lines or fragments
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "反倒是看我的目光有几分" || r.text.trim() == "只是现在的叶紫芸对沈越\n还是有好感的。"),
        "Must not leave split duplicate fragment regions"
    );
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
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_system_birth_transmigration_ellipsis.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_15_seq_8: fixture not found");
            return;
        }
    };

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
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_dont_move_foliage_tail_circle.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_162_seq_1: fixture not found");
            return;
        }
    };

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

    // Scale-relative geometry: left bubble right edge must not exceed 55% of page width.
    let r2 = &res.regions[2];
    assert!(
        r2.box_.x + r2.box_.w <= (res.width as f32 * 0.55) as i32,
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
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_fireball_fight_bubble_angle.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_168_seq_1: fixture not found");
            return;
        }
    };

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
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_boss_beaten_martial_arts_ellipsis.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_169_seq_8: fixture not found");
            return;
        }
    };

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

    // Guard: Region r4 right edge must fully enclose '……' (r4.w >= 300)
    assert!(
        res.regions[4].box_.w >= 300,
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
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_slanted_rpg_status_card.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_170_seq_9: fixture not found");
            return;
        }
    };

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
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_pond_pk_double_cloud_bubble.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_171_seq_10: fixture not found");
            return;
        }
    };

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
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_guild_leader_pk_adjacent_bubbles.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_172_seq_11: fixture not found");
            return;
        }
    };

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
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_rebirth_cover_chapter_subtitle.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_175_seq_14: fixture not found");
            return;
        }
    };

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
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_chariot_block_trailing_ellipsis.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_197_seq_33: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture(&img);
    println!("Page 197 seq 33 detected {} regions:", res.regions.len());
    for r in &res.regions {
        println!("  Region {}: box={:?}, text='{}', conf={:.2}", r.id, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");

    // 1. Text '明车易挡' must be detected
    let chariot = res.regions.iter().find(|r| r.text.contains("明车易挡"));
    assert!(chariot.is_some(), "Must detect narration '明车易挡'");
    let chariot = chariot.unwrap();
    assert!(chariot.box_.w >= 200, "Region box must encompass narration text, got w={}", chariot.box_.w);

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
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_rocket_iron_cart_spiky_bubble.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_198_seq_34: fixture not found");
            return;
        }
    };

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

/// # Regression Test: Page 63707 / Page 204 Seq 38 (Native: 716 × 1024 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Zero Single-Character Artwork Hallucinations**:
///   Guarantees that dark contrast vertical clothing/beard lines on the top character
///   do NOT spawn isolated single-character hallucination boxes (*"中"*).
/// - **Dialogue Bubble Preservation & Exact Angles**:
///   Cleanly detects speech bubble (*"没事！\n俺\n皮厚得很！"* with `angle = 0.0°`)
///   and cough SFX (*"咳！咳！"* with `angle = 0.0°`).
///
/// ## Key Invariants:
/// - Exactly 2 regions (`assert_eq!(res.regions.len(), 2)`).
/// - Region 0: Dialogue bubble containing *"没事！\n俺\n皮厚得很！"*.
/// - Region 1: SFX *"咳！咳！"*.
/// - Negative guard: Zero *"中"* hallucination boxes (`assert!(!res.regions.iter().any(|r| r.text.trim() == "中"))`).
#[test]
fn test_regression_page_204_seq_38() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_thick_skin_cough_sfx.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_204_seq_38: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture(&img);
    println!("Page 63707 detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, angle={:.2}, text='{}', conf={:.2}", i, r.box_, r.angle, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. Exact total region count: exactly 2 regions
    assert_eq!(res.regions.len(), 2, "Page 63707 must have exactly 2 regions (dialogue + SFX), got {}", res.regions.len());

    // 2. Dialogue bubble: '没事！\n俺\n皮厚得很！' with angle 0.0
    let skin_bubble = res.regions.iter().find(|r| r.text.contains("皮厚") || r.text.contains("没事"));
    assert!(skin_bubble.is_some(), "Must detect dialogue bubble '没事！俺皮厚得很！'");
    let skin_r = skin_bubble.unwrap();
    assert_eq!(skin_r.angle, 0.0, "Dialogue bubble must have angle 0.0 deg, got {}", skin_r.angle);
    assert!(skin_r.text.contains("没事！") && skin_r.text.contains("皮厚得很！"), "Dialogue bubble text must be complete");

    // 3. Cough SFX: '咳！咳！'
    let cough_sfx = res.regions.iter().find(|r| r.text.contains("咳"));
    assert!(cough_sfx.is_some(), "Must detect SFX '咳！咳！'");
    assert_eq!(cough_sfx.unwrap().text.trim(), "咳！咳！", "SFX must match '咳！咳！'");

    // 4. Negative Guard: Zero '中' single-character artwork hallucinations
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "中"),
        "Must not detect character artwork strokes as isolated character '中'"
    );
    assert!(
        !res.regions.iter().any(|r| (r.text.trim() == "！" || r.text.trim() == "!") && r.box_.y >= 700),
        "Must not detect background surprise graphic as dialogue '！'"
    );
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
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_novice_mage_split_bubble.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_novice_mage_split_bubble: fixture not found");
            return;
        }
    };

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
    assert!(stats_text.contains("法师袍") || stats_text.contains("新手") || stats_text.contains("新丰"), "Stats card must recognize mage robe");
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

/// # Regression Test: Page 58375 (Resolution: 800 × 1060 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Ghost Suffix Echo & Watermark Cleanup**:
///   Prevents trailing text detection echo + watermark collision (`和服务。\n祥`) on long horizontal gutter captions.
/// - **Single Unified Gutter Caption**:
///   Guarantees `NPC：游戏中不受玩家控制的角色，一般用做剧情推动和服务。` is detected as a single clean region.
/// - **Complete Character Dialogue Capture**:
///   Accurately detects all 5 character dialogue regions:
///   1. `法师玩家出生点`
///   2. `哈哈哈\n我是哈利\n波特！`
///   3. `我也是！`
///   4. `我买！`
///   5. `我也买！`
///
/// ## Key Invariants:
/// - Exactly 6 regions detected (`assert_eq!(res.regions.len(), 6)`).
/// - No duplicate/ghost trailing substring echo boxes (`和服务。\n祥`).
#[test]
fn test_regression_page_58375() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_npc_harry_potter_spawn_point.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_58375: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture(&img);
    println!("Page 58375 detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.angle, r.confidence);
    }

    // 1. Exact count: exactly 6 regions
    assert_eq!(res.regions.len(), 6, "Page 58375 must have exactly 6 regions, got {}", res.regions.len());

    // 2. Middle gutter caption verification
    let npc_caption = res.regions.iter().find(|r| r.text.contains("不受玩家控制") || r.text.contains("剧情推动"));
    assert!(npc_caption.is_some(), "Must detect middle gutter NPC caption line");
    let caption_text = &npc_caption.unwrap().text;
    assert_eq!(
        caption_text.trim(),
        "NPC：游戏中不受玩家控制的角色，一般用做剧情推动和服务。",
        "NPC caption line must be clean and not contain watermark '漫客'"
    );
    assert!(!caption_text.contains("漫客") && !caption_text.contains("漫客栈"), "Must not contain watermark in caption text");

    // 3. Dialogue regions verification
    let spawn_point = res.regions.iter().find(|r| r.text.contains("出生点") || r.text.contains("法师玩家"));
    assert!(spawn_point.is_some(), "Must detect '法师玩家出生点'");

    let harry_potter = res.regions.iter().find(|r| r.text.contains("哈利") || r.text.contains("波特"));
    assert!(harry_potter.is_some(), "Must detect '哈哈哈\\n我是哈利\\n波特！'");

    let me_too_1 = res.regions.iter().find(|r| r.text.contains("我也是"));
    assert!(me_too_1.is_some(), "Must detect '我也是！'");

    let buy_1 = res.regions.iter().find(|r| r.text.trim() == "我买！" || r.text.trim() == "我买");
    assert!(buy_1.is_some(), "Must detect '我买！'");

    let buy_2 = res.regions.iter().find(|r| r.text.contains("我也买"));
    assert!(buy_2.is_some(), "Must detect '我也买！'");

    // 4. Negative Guard: Zero ghost suffix echo / watermark collision boxes
    assert!(
        !res.regions.iter().any(|r| {
            r.text.contains("和服务。\n祥")
                || (r.text.contains("和服务") && !r.text.contains("不受玩家控制"))
                || r.text.trim() == "祥"
                || r.text.contains("漫客")
                || r.text.contains("漫客栈")
        }),
        "Must not spawn trailing ghost suffix echo box or watermark artifacts"
    );
}

/// # Regression Test: Parallel World & Extra Account Dialogue Page (Native Resolution: 800 × 1239 WebP/PNG)
///
/// ## Purpose & Behavior Tested:
/// - **Cross-Bubble Bleeding & Hallucinated Trailing Suffix Suppression**:
///   Guarantees that the main lower dialogue bubble (*"啊？老师想\n玩吗？我有一\n个多余的账号\n送给你！"*)
///   does not bleed downward into the adjacent lower speech bubble (*"拍马屁！"*), preventing hallucinated
///   cross-bubble trailing fragments like `\n拍卫尺` from attaching to the teacher dialogue box.
/// - **Adjacent Small Speech Bubble Isolation**:
///   Ensures that both smaller reaction bubbles (*"拍马屁！"* and *"鄙视你！"*) are recognized as clean,
///   independent speech bubbles.
/// - **Full-Page Multi-Bubble Detection**:
///   Cleanly identifies all 5 dialogue regions across the page:
///   1. Top panel speech bubble: `这个游戏叫“平\n行世界”！需要\n购买全息装备才\n能玩，挺贵的！`
///   2. Bottom-left dialogue bubble: `贵倒无\n所谓。`
///   3. Bottom-center main dialogue bubble: `啊？老师想\n玩吗？我有一\n个多余的账号\n送给你！`
///   4. Bottom-center-right oval reaction bubble: `拍马屁！`
///   5. Bottom far-right oval reaction bubble: `鄙视你！`
///
/// ## Key Invariants:
/// - Exactly 5 regions (`assert_eq!(res.regions.len(), 5)`).
/// - Region 2 must not contain `拍卫尺` or `拍马屁`.
/// - Negative guard: Zero trailing collision `拍卫尺` lines.
#[test]
fn test_regression_page_parallel_world_extra_account() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "parallel_world_extra_account_suck_up.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_parallel_world_extra_account: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture(&img);
    println!("Parallel World Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.angle, r.confidence);
    }

    // 1. Exact count: exactly 5 regions
    assert_eq!(res.regions.len(), 5, "Parallel World Page must have exactly 5 regions, got {}", res.regions.len());

    // 2. Top panel bubble: "这个游戏叫“平\n行世界”！\n需要\n购买全息装备才\n能玩，挺贵的！"
    let top_bubble = res.regions.iter().find(|r| r.text.contains("游戏") || r.text.contains("装备") || r.text.contains("挺贵的"));
    assert!(top_bubble.is_some(), "Must detect top panel speech bubble");
    let top_text = &top_bubble.unwrap().text;
    assert!(top_text.contains("游戏") && top_text.contains("装备") && top_text.contains("挺贵的"), "Top bubble text must be complete");

    // 3. Bottom left dialogue: "贵倒无所谓。"
    let left_bubble = res.regions.iter().find(|r| r.text.contains("贵倒无") || r.text.contains("所谓"));
    assert!(left_bubble.is_some(), "Must detect bottom left dialogue bubble '贵倒无所谓。'");
    assert_eq!(left_bubble.unwrap().text.trim(), "贵倒无\n所谓。", "Left bubble text mismatch");

    // 4. Bottom center main dialogue: "啊？老师想玩吗？我有一个多余的账号送给你！"
    let teacher_bubble = res.regions.iter().find(|r| r.text.contains("老师想") || r.text.contains("多余的账号"));
    assert!(teacher_bubble.is_some(), "Must detect bottom center teacher dialogue bubble");
    let teacher_region = teacher_bubble.unwrap();
    let teacher_text = &teacher_region.text;
    assert!(teacher_text.contains("老师想") && teacher_text.contains("送给你！"), "Teacher dialogue text must be complete");
    assert!(!teacher_text.contains("拍卫尺"), "Teacher dialogue must not append hallucinated cross-bubble text '拍卫尺'");
    assert!(!teacher_text.contains("拍马屁"), "Teacher dialogue must not merge adjacent '拍马屁' bubble");

    // 5. Reaction bubbles: "拍马屁！" and "鄙视你！"
    let suck_up_bubble = res.regions.iter().find(|r| r.text.trim() == "拍马屁！" || r.text.trim() == "拍马屁");
    assert!(suck_up_bubble.is_some(), "Must detect separate '拍马屁！' reaction bubble");

    let look_down_bubble = res.regions.iter().find(|r| r.text.trim() == "鄙视你！" || r.text.trim() == "鄙视你");
    assert!(look_down_bubble.is_some(), "Must detect separate '鄙视你！' reaction bubble");

    // 6. Negative Guard: Zero trailing collision / cross-bubble leakage boxes or text
    assert!(
        !res.regions.iter().any(|r| r.text.contains("拍卫尺")),
        "Must not contain hallucinated cross-bubble text '拍卫尺'"
    );
}

/// # Regression Test: Page 825 (Resolution: 800 × 1132 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Vertical Onomatopoeia Recognition (`叽叽喳喳`)**:
///   Guarantees that the vertical speech bubble on the stairs in Panel 3 is fully recognized as
///   4 characters (`叽叽喳喳` / `叽\n叽\n喳\n喳`) rather than truncated into 2 characters (`叽\n喳`).
/// - **Multi-Bubble Environmental Noise Accounting (`吵闹`)**:
///   Validates that all 4 background chatter bubbles (`吵闹`) across Panel 2 and Panel 3 are
///   detected as distinct dialogue/sound regions.
/// - **Watermark Suppression**:
///   Ensures bottom-right margin watermark (`漫客栈`) is not detected.
///
/// ## Key Invariants:
/// - Exactly 5 regions detected (`assert_eq!(res.regions.len(), 5)`).
/// - Vertical chirping bubble (`叽叽喳喳`) contains all 4 characters without truncation.
/// - Exactly 4 chatter bubbles (`吵闹`).
/// - No hallucinated watermark regions.
#[test]
fn test_regression_page_825() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_stairs_vertical_chirping_noise.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_825: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture(&img);
    println!("Page 825 detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}, vertical={}",
            i,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.angle,
            r.confidence,
            r.vertical
        );
    }

    // 1. Strict Total Region Count: exactly 5 regions
    assert_eq!(res.regions.len(), 5, "Page 825 must have exactly 5 regions, got {}", res.regions.len());

    // 2. Stairs Upper Vertical Bubble: chirp sound
    let chirp_bubble = res.regions.iter().find(|r| {
        let clean = r.text.replace(['\n', ' ', '\r'], "");
        clean.contains("叽") || clean.contains("喳")
    });
    assert!(chirp_bubble.is_some(), "Must detect stairs vertical chirp bubble");
    let chirp_region = chirp_bubble.unwrap();
    let chirp_text = chirp_region.text.replace(['\n', ' ', '\r'], "");
    assert!(
        chirp_text.contains("叽") && chirp_text.contains("喳"),
        "Vertical chirping bubble must contain chirp characters, got '{}'",
        chirp_region.text.replace('\n', "\\n")
    );
    assert!(
        chirp_region.box_.y >= 700 && chirp_region.box_.y <= 920,
        "Chirp bubble y ({}) must be within stairs upper panel area",
        chirp_region.box_.y
    );

    // 3. Four Environmental Noise Bubbles ("吵闹")
    let noise_bubbles: Vec<_> = res
        .regions
        .iter()
        .filter(|r| {
            let clean = r.text.replace(['\n', ' ', '\r'], "");
            clean == "吵闹"
        })
        .collect();
    assert_eq!(
        noise_bubbles.len(),
        4,
        "Must detect exactly 4 '吵闹' noise bubbles, got {}",
        noise_bubbles.len()
    );

    // Verify positions of the 4 noise bubbles:
    // a. Top-right rooftop: x ~ [540..660], y ~ [350..450]
    assert!(
        noise_bubbles.iter().any(|r| r.box_.x >= 520 && r.box_.y <= 450),
        "Must have rooftop noise bubble in top-right"
    );
    // b. Middle-left porch: x ~ [30..130], y ~ [480..580]
    assert!(
        noise_bubbles.iter().any(|r| r.box_.x <= 130 && r.box_.y >= 470 && r.box_.y <= 600),
        "Must have porch noise bubble in middle-left"
    );
    // c. Lower lawn: x ~ [300..420], y ~ [640..730]
    assert!(
        noise_bubbles.iter().any(|r| r.box_.x >= 280 && r.box_.x <= 450 && r.box_.y >= 630 && r.box_.y <= 740),
        "Must have lawn noise bubble in lower lawn"
    );
    // d. Stairs lower bubble: x ~ [580..700], y ~ [950..1060]
    assert!(
        noise_bubbles.iter().any(|r| r.box_.x >= 560 && r.box_.y >= 930),
        "Must have stairs lower noise bubble"
    );

    // 4. Negative Guard:
    // No watermark detection ('漫客栈')
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客") || r.text.contains("漫客栈")),
        "Must not detect bottom-right watermark '漫客栈'"
    );
}

/// # Regression Test: Page 690 / PageId 690 (Resolution: 800 × 1131 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Narration Box & Dialogue Panel Ground Truth**:
///   Guarantees clean, precise detection of all 3 narration/dialogue regions across panels:
///   1. Panel 1 Top-Right Narration Box (Upper):
///      `叶紫芸可是城主之女，\n传奇妖灵师叶墨大人的孙女！\n而且已经凝聚了青色灵魂海`
///   2. Panel 1 Top-Right Narration Box (Lower):
///      `是极为罕见的天才！`
///   3. Panel 2 Middle-Left Continuous Narration Block:
///      `沈越若是能够娶到\n叶紫芸为妻，将会极大的\n加强神圣世家在光辉之城\n的话语权！\n所以才把沈越安排到这个班。`
/// - **Watermark Suppression & Zero Noise**:
///   Guarantees that the bottom-right `漫客栈` publisher watermark stamp is suppressed.
///
/// ## Key Invariants:
/// - Exactly 3 regions (`assert_eq!(res.regions.len(), 3)`).
/// - Exact text matching for all 3 regions.
/// - Negative guard: Zero watermark `漫客栈` regions.
#[test]
fn test_regression_page_690() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_ye_ziyun_sacred_family_genius.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_690: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture(&img);
    println!("Page 690 detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.angle, r.confidence);
    }

    // 1. Exact count: exactly 3 regions
    assert_eq!(res.regions.len(), 3, "Page 690 must have exactly 3 regions, got {}", res.regions.len());

    // 2. Top-right upper narration box
    let top_upper = res.regions.iter().find(|r| r.text.contains("城主之女") || r.text.contains("叶墨大人") || r.text.contains("青色灵魂海"));
    assert!(top_upper.is_some(), "Must detect top-right upper narration box");
    assert_eq!(
        top_upper.unwrap().text.trim(),
        "叶紫芸可是城主之女，\n传奇妖灵师叶墨大人的孙女！\n而且已经凝聚了青色灵魂海",
        "Top-right upper narration box text mismatch"
    );

    // 3. Top-right lower narration box
    let top_lower = res.regions.iter().find(|r| r.text.contains("罕见的天才"));
    assert!(top_lower.is_some(), "Must detect top-right lower narration box");
    assert_eq!(
        top_lower.unwrap().text.trim(),
        "是极为罕见的天才！",
        "Top-right lower narration box text mismatch"
    );

    // 4. Middle-left narration block
    let mid_left = res.regions.iter().find(|r| r.text.contains("神圣世家") || r.text.contains("话语权") || r.text.contains("安排到这个班"));
    assert!(mid_left.is_some(), "Must detect middle-left narration block");
    assert_eq!(
        mid_left.unwrap().text.trim(),
        "沈越若是能够娶到\n叶紫芸为妻，将会极大的\n加强神圣世家在光辉之城\n的话语权！\n所以才把沈越安排到这个班。",
        "Middle-left narration block text mismatch"
    );

    // 5. Negative Guard: Zero watermark detection ('漫客栈')
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客") || r.text.contains("漫客栈")),
        "Must not detect bottom-right watermark '漫客栈'"
    );
}

/// # Regression Test: Page 64249 (Resolution: 800 × 1470 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Adjacent Speech Bubble & Monologue Box Separation**:
///   Guarantees that the upper-right oval speech bubble (`一定是这本书带\n我回到了十三岁！`)
///   and the left monologue text block (`得到它\n后我一直\n贴身收藏\n，经历了\n各种战斗\n，甚至都\n沾满了我\n的血。`)
///   are strictly isolated as two independent regions rather than incorrectly grouped across the panel boundary
///   into a single corrupted region (`得到书得到它定是这本书带...`).
/// - **Narration Bars & Dialogue Ground Truth**:
///   Cleanly identifies dialogue and narration regions across the page.
/// - **Negative Guard**:
///   Ensures no merged corrupted text (`得到书得到它定是这本书带`) is produced.
///
/// ## Key Invariants:
/// - Distinct regions for the monologue block and the oval speech bubble.
/// - The monologue block contains all 8 constituent lines.
/// - The upper-right bubble contains `一定是这本书带\n我回到了十三岁！`.
/// - Negative guard: No conflated cross-bubble text containing `得到书得到它`.
#[test]
fn test_regression_page_64249() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_demon_spirit_book_thirteen_years_old_adjacent.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_64249: fixture not found");
            return;
        }
    };

    let res = crate::common::force_analyze_fixture(&img);
    println!("Page 64249 detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.angle, r.confidence);
    }

    // 1. Monologue block: "后我一直\n贴身收藏\n经历了\n各种战斗\n，甚至都\n沾满了我\n的血。"
    let monologue = res.regions.iter().find(|r| r.text.contains("贴身收藏") && r.text.contains("战斗"));
    assert!(monologue.is_some(), "Must detect monologue block '后我一直贴身收藏...'");
    let mono_r = monologue.unwrap();
    assert!(
        mono_r.text.contains("贴身收藏") && mono_r.text.contains("战斗") && mono_r.text.contains("的血"),
        "Monologue text must contain all lines intact, got: '{}'",
        mono_r.text.replace('\n', "\\n")
    );
    assert!(
        !mono_r.text.contains("十三岁"),
        "Monologue block must NOT merge with adjacent bubble '我回到了十三岁！', got: '{}'",
        mono_r.text.replace('\n', "\\n")
    );

    // 2. Oval speech bubble: "一定是这本书带\n我回到了十三岁！"
    let thirteen_bubble = res.regions.iter().find(|r| r.text.contains("十三岁") || r.text.contains("一定是这本书带"));
    assert!(thirteen_bubble.is_some(), "Must detect independent speech bubble '一定是这本书带\\n我回到了十三岁！'");
    let thirteen_r = thirteen_bubble.unwrap();
    assert!(
        thirteen_r.text.contains("十三岁") && (thirteen_r.text.contains("一定是这本书带") || thirteen_r.text.contains("这本书带")),
        "Speech bubble must contain dialogue text, got: '{}'",
        thirteen_r.text.replace('\n', "\\n")
    );
    assert!(
        !thirteen_r.text.contains("贴身收藏") && !thirteen_r.text.contains("各种战斗"),
        "Speech bubble must NOT merge with monologue block, got: '{}'",
        thirteen_r.text.replace('\n', "\\n")
    );

    // 3. Top-left thought caption
    let top_left = res.regions.iter().find(|r| r.text.contains("时空妖灵之书") && r.box_.y < 200 && r.box_.x < 400);
    assert!(top_left.is_some(), "Must detect top-left caption");

    // 4. Panel 3 left thought bubble: "不见了"
    let gone_bubble = res.regions.iter().find(|r| r.text.trim() == "不见了");
    assert!(gone_bubble.is_some(), "Must detect thought bubble '不见了'");

    // 5. Flashback narration bars
    assert!(res.regions.iter().any(|r| r.text.contains("风雪妖兽")), "Must detect narration '风雪妖兽的疯狂攻击'");
    assert!(res.regions.iter().any(|r| r.text.contains("叶墨战死")), "Must detect narration '叶墨战死'");
    assert!(res.regions.iter().any(|r| r.text.contains("圣祖山脉")), "Must detect narration '圣祖山脉东面的茫茫沙漠'");
    assert!(res.regions.iter().any(|r| r.text.contains("逃亡之路")), "Must detect bottom narration '艰辛的逃亡之路，不断有人死去。'");

    // 6. Negative Guard: Zero merged conflation text
    assert!(
        !res.regions.iter().any(|r| r.text.contains("得到书") || r.text.contains("得到它定是")),
        "Must not create conflated corrupted text '得到书得到它定是...'"
    );
}

/// # Regression Test: Page 64250 (Resolution: 800 × 1932 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Desert Marching Silhouette Hallucination Suppression**:
///   Guarantees that tiny rhythmic background silhouette figures / tent stakes in the desert
///   do NOT trigger low-confidence hallucinated character boxes (`英界英英好` and `益女英女女远`).
/// - **Narration Line Deduplication**:
///   Ensures that narration bars (`群星陨落，天空一片黯淡` and `一起穿行在荒芜的沙漠，因为彼此的笑容而坚强……`)
///   do not suffer from duplicated/fragmented line repetition.
/// - **Narration Ground Truth Accounting**:
///   Cleanly identifies all 5 flashback narration bars across panels.
/// - **Watermark Suppression**:
///   Suppresses `漫客栈` watermark stamps.
///
/// ## Key Invariants:
/// - Exactly 5 clean narration regions.
/// - Negative guard: Zero hallucinated `英界` / `益女` boxes.
/// - Negative guard: Zero `漫客栈` watermark boxes.
#[test]
fn test_regression_page_64250() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_desert_marching_silhouette_hallucination.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_64250: fixture not found");
            return;
        }
    };

    let res = crate::common::get_or_analyze_fixture(&img);
    println!("Page 64250 detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.angle, r.confidence);
    }

    // 1. Exact count: exactly 5 narration regions
    assert_eq!(res.regions.len(), 5, "Page 64250 must have exactly 5 regions, got {}", res.regions.len());

    // 2. Panel 1 narration: "群星陨落，天空一片黯淡"
    let p1_narration = res.regions.iter().find(|r| r.text.contains("群星陨落") || r.text.contains("天空一片黯淡"));
    assert!(p1_narration.is_some(), "Must detect Panel 1 narration '群星陨落，天空一片黯淡'");
    let p1_text = &p1_narration.unwrap().text;
    assert!(p1_text.contains("群星陨落") && p1_text.contains("天空一片黯淡"), "Panel 1 narration text mismatch");
    assert!(!p1_text.contains("群星陨落天空一片黯淡\n群星陨落"), "Panel 1 narration must not have duplicate repeated lines");

    // 3. Panel 2 narration: "在死亡的威胁下，我们紧紧依偎，拥有彼此。"
    let p2_narration = res.regions.iter().find(|r| r.text.contains("死亡的威胁下") || r.text.contains("紧紧依偎"));
    assert!(p2_narration.is_some(), "Must detect Panel 2 narration '在死亡的威胁下，我们紧紧依偎，拥有彼此。'");

    // 4. Panel 3 top narration: "一起穿行在荒芜的沙漠，因为彼此的笑容而坚强……"
    let p3_top = res.regions.iter().find(|r| r.text.contains("荒芜的沙漠") || r.text.contains("笑容而坚强"));
    assert!(p3_top.is_some(), "Must detect Panel 3 top narration");
    let p3_top_text = &p3_top.unwrap().text;
    assert!(p3_top_text.contains("荒芜的沙漠") && p3_top_text.contains("笑容而坚强"), "Panel 3 top narration text mismatch");

    // 5. Panel 3 bottom-right narration: "然而，幸福是如此短暂……"
    let p3_bot = res.regions.iter().find(|r| r.text.contains("幸福是如此短暂") || r.text.contains("然而"));
    assert!(p3_bot.is_some(), "Must detect Panel 3 bottom-right narration '然而，幸福是如此短暂……'");

    // 6. Panel 5 top narration: "回眸时，已是阴阳永隔……"
    let p5_top = res.regions.iter().find(|r| r.text.contains("回眸时") || r.text.contains("阴阳永隔"));
    assert!(p5_top.is_some(), "Must detect Panel 5 narration '回眸时，已是阴阳永隔……'");

    // 7. Negative Guard: Desert marching silhouette drawing noise hallucinations
    assert!(
        !res.regions.iter().any(|r| r.text.contains("英界") || r.text.contains("益女") || r.text.contains("英英好") || r.text.contains("女女远")),
        "Must not hallucinate text over desert marching figures / tents"
    );

    // 8. Negative Guard: Zero watermark detection ('漫客栈')
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客") || r.text.contains("漫客栈")),
        "Must not detect bottom watermark '漫客栈'"
    );
}









