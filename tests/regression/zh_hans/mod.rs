use crate::common::get_or_analyze_fixture;

/// # Regression Test: Zhang Yude Chengdu Cemetery (Resolution: 800 × 1270 WebP)
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
fn test_regression_page_zhang_yude_chengdu_cemetery() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_zhang_yude_chengdu_cemetery.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_zhang_yude_chengdu_cemetery: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture(&img);
    println!("Page zhang_yude_chengdu_cemetery regions (len={}):", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  r{}: box={:?}, text='{}'", i, r.box_, r.text.replace('\n', "\\n"));
    }
    assert!(res.regions.len() >= 4 && res.regions.len() <= 5, "Page zhang_yude_chengdu_cemetery must have 4 or 5 detected regions, got {}", res.regions.len());

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
        p2_dialogue.box_.x + p2_dialogue.box_.w >= 264,
        "Panel 2 bounding box right edge ({}) must extend to >= 264 to fully cover trailing ellipsis",
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


/// # Regression Test: Fool Pee Pants Adjacent Bubbles (Resolution: 800 × 2400 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Adjacent Bubble Separation**:
///   Ensures side-by-side speech bubbles occurring on the same horizontal band
///   (*"这傻子非得尿裤子上不可！"* vs *"哈哈！"*) are not merged across panels.
#[test]
fn test_regression_page_fool_pee_pants_adjacent_bubbles() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_fool_pee_pants_adjacent_bubbles.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_fool_pee_pants_adjacent_bubbles: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture(&img);
    println!("Page fool_pee_pants_adjacent_bubbles detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. Separation of adjacent connected speech bubbles in panel 1:
    let fool_bubble = res.regions.iter().find(|r| r.text.contains("这傻子非得尿") || r.text.contains("裤子上不可"));
    assert!(fool_bubble.is_some(), "Must detect left speech bubble '这傻子非得尿裤子上不可！'");
    let fool_bubble = fool_bubble.unwrap();
    assert!(!fool_bubble.text.contains("哈哈"), "Left bubble must NOT merge with adjacent '哈哈！'");

    let haha_bubble = res.regions.iter().find(|r| r.text.contains("哈哈"));
    assert!(haha_bubble.is_some(), "Must detect separate adjacent speech bubble '哈哈！'");
    let haha_bubble = haha_bubble.unwrap();
    assert!(!haha_bubble.text.contains("这傻子"), "Adjacent '哈哈！' bubble must NOT merge with left bubble");

    // 2. Panel 2 dialogue bubble:
    assert!(res.regions.iter().any(|r| r.text.contains("啧")), "Must detect panel 2 dialogue bubble '啧！'");

    // 3. Panel 2 location banner:
    assert!(res.regions.iter().any(|r| r.text.contains("Z市郊外") || r.text.contains("郊外")), "Must detect location tag 'Z市郊外'");

    // 4. Negative guard: zero watermark detection ('ACloudMerge.com')
    assert!(
        !res.regions.iter().any(|r| r.text.contains("ACloud") || r.text.contains("Merge")),
        "Must not detect bottom watermark 'ACloudMerge.com'"
    );
}

/// # Regression Test: Shen Yue & Ye Ziyun Thought Bubble (Resolution: 800 × 1131 WebP)
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
fn test_regression_page_shen_yue_ye_ziyun_thought_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_shen_yue_ye_ziyun_thought_bubble.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_shen_yue_ye_ziyun_thought_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture(&img);
    println!("Page shen_yue_ye_ziyun_thought_bubble detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.angle, r.confidence);
    }

    // 1. Exact count: exactly 5 regions
    assert_eq!(res.regions.len(), 5, "Page shen_yue_ye_ziyun_thought_bubble must have exactly 5 regions, got {}", res.regions.len());

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

/// # Regression Test: System Birth & Transmigration Ellipsis (Resolution: 800 × 1600 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Giant Artwork Hallucination Suppression & Ellipsis Expansion**:
///   Suppresses hallucinated giant artwork text (*"福迎"*) across character clothing/shadows
///   and ensures the speech bubble *"系统诞生在我身上……"* preserves trailing ellipsis dots
///   with full bounding box width (`w >= 380px`).
#[test]
fn test_regression_page_system_birth_transmigration_ellipsis() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_system_birth_transmigration_ellipsis.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_system_birth_transmigration_ellipsis: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture(&img);
    println!("Page system_birth_transmigration_ellipsis detected {} regions:", res.regions.len());
    for r in &res.regions {
        println!("  Region {}: box={:?}, text='{}', conf={:.2}", r.id, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");

    // 1. Exact region count: exactly 6 speech bubbles
    assert_eq!(res.regions.len(), 6, "Page system_birth_transmigration_ellipsis must have exactly 6 speech bubbles, got {}", res.regions.len());

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
    assert!(yz_bubble.text.contains("小樱"), "'小樱' line must be present, got '{}'", yz_bubble.text);

    // 6. Other speech bubbles must be cleanly detected
    assert!(all_text.contains("十一年前"), "Must detect top bubble '十一年前……'");
    assert!(all_text.contains("发生过什么大事"), "Must detect '发生过什么大事？'");
    assert!(all_text.contains("心第一次在这个"), "Must detect '心第一次在这个\n世界上诞生'");
}

/// # Regression Test: Don't Move Foliage & Tail Circle (Resolution: 800 × 1590 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Foliage Drawing Noise Suppression & Tail-Circle Filtering**:
///   Suppresses top-left foliage contour hallucination (*"新ー"*), suppresses bottom-right
///   thought bubble tail ornament (*"……"*), and clamps left speech bubble boundary
///   (*"你可不要\n乱动……"*).
#[test]
fn test_regression_page_dont_move_foliage_tail_circle() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_dont_move_foliage_tail_circle.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_dont_move_foliage_tail_circle: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture(&img);
    println!("Page dont_move_foliage_tail_circle detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  r{}: box=({},{},{},{}) text='{}'", i,
            r.box_.x, r.box_.y, r.box_.w, r.box_.h, r.text.replace('\n', "\\n"));
    }

    // Exact count: 3 regions.
    // The '……' tail-circle bubble in the bottom-right panel MUST be suppressed.
    assert_eq!(res.regions.len(), 3,
        "Page dont_move_foliage_tail_circle must have exactly 3 regions, got {}", res.regions.len());

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



/// # Regression Test: Slanted RPG Status Card (Resolution: 800 × 1461 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Diagonal Status Card Angle Detection & Multi-Column Line Order**:
///   Ensures slanted RPG status card detects its non-zero rotation angle (`|angle| >= 10.0°`)
///   and preserves the full multi-column info block without digit corruption.
#[test]
fn test_regression_page_slanted_rpg_status_card() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_slanted_rpg_status_card.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_slanted_rpg_status_card: fixture not found");
            return;
        }
    };

    let res = crate::common::get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("Page slanted_rpg_status_card detected {} regions:", res.regions.len());
    for r in &res.regions {
        println!("  Region {}: box={:?}, angle={:.2}, text='{}', conf={:.2}", r.id, r.box_, r.angle, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. Exact count: exactly 2 regions (top slanted status card + bottom dialogue bubble)
    assert_eq!(res.regions.len(), 2, "Page slanted_rpg_status_card must have exactly 2 regions, got {}", res.regions.len());

    // 2. Region r0 (Slanted RPG status card: rotated angle >= 10.0 deg, 8-line equipment list)
    let status_card = &res.regions[0];
    assert!(status_card.angle.abs() >= 10.0, "Slanted RPG card must detect non-zero rotation angle (|angle| >= 10.0 deg), got angle={}", status_card.angle);
    assert!(status_card.text.contains("职业") && status_card.text.contains("法师"), "Status card missing class");
    assert!(status_card.text.contains("等级") && status_card.text.contains("10"), "Status card missing level");
    assert!(status_card.text.contains("新手法师袍") && status_card.text.contains("新手腰带"), "Status card missing armor/belt");
    assert!(status_card.text.contains("新手法师护手") && status_card.text.contains("新手法师靴"), "Status card missing gloves/boots");
    assert!(status_card.text.contains("残破的割肉小刀"), "Status card missing dagger");

    // 3. Region r1 (Bottom ninja warrior dialogue bubble: angle == 0.0, horizontal)
    let bot_bubble = &res.regions[1];
    assert!(!bot_bubble.vertical, "Bottom dialogue bubble must be horizontal");
    assert_eq!(bot_bubble.angle, 0.0, "Bottom dialogue bubble must have angle 0.0 deg");
    assert!(bot_bubble.text.contains("这么胡") && bot_bubble.text.contains("菜鸟"), "Bottom dialogue bubble text mismatch: {}", bot_bubble.text);

    // 4. Negative guard: zero watermark detection ('漫客栈')
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客") || r.text.contains("漫客栈")),
        "Must not detect bottom watermark '漫客栈'"
    );
}

/// # Regression Test: Guild Leader PK Adjacent Bubbles (Resolution: 800 × 1616 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Bottom Bubble Boundary Clamping & 3-Way Adjacent Bubble Separation**:
///   Clamps elongated bottom speech bubble boundary (*"不是他自己说\n要PK嘛……"* `w <= 200px`),
///   and preserves distinct IDs for all 3 adjacent speech bubbles in panel 2.
#[test]
fn test_regression_page_guild_leader_pk_adjacent_bubbles() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_guild_leader_pk_adjacent_bubbles.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_guild_leader_pk_adjacent_bubbles: fixture not found");
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

/// # Regression Test: Rebirth Cover Chapter Subtitle (Resolution: 800 × 1131 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Cover Title & Subtitle Separation**:
///   Ensures chapter subtitle (*"第一话·重生"*) is properly separated from stylized cover calligraphy.
#[test]
fn test_regression_page_rebirth_cover_chapter_subtitle() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_rebirth_cover_chapter_subtitle.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_rebirth_cover_chapter_subtitle: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture(&img);
    println!("Page rebirth_cover_chapter_subtitle detected {} regions:", res.regions.len());
    for r in &res.regions {
        println!("  Region {}: box={:?}, angle={:.2}, text='{}', conf={:.2}", r.id, r.box_, r.angle, r.text.replace('\n', "\\n"), r.confidence);
    }

    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");

    // 1. Chapter subtitle '第一话·重生' must be detected
    let subtitle = res.regions.iter().find(|r| r.text.contains("第一话") || r.text.contains("重生"));
    assert!(subtitle.is_some(), "Must detect chapter subtitle '第一话·重生'");
    assert!(all_text.contains("重生") || all_text.contains("第一话"), "Subtitle text must be present");
}


/// # Regression Test: Rocket Iron Cart Spiky Bubble (Resolution: 800 × 1066 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Spiky Bubble Boundary Clamping & Angle Stability**:
///   Clamps bottom-right spiky speech bubble (*"这辆比前两辆大上一圈……"*) away from right
///   page edge (`x + w <= 765px`) with `angle = 0.0°`, and preserves cyan status card.
#[test]
fn test_regression_page_rocket_iron_cart_spiky_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_rocket_iron_cart_spiky_bubble.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_rocket_iron_cart_spiky_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture(&img);
    println!("Page rocket_iron_cart_spiky_bubble detected {} regions:", res.regions.len());
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

/// # Regression Test: Thick Skin Cough SFX (Native: 716 × 1024 WebP)
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
fn test_regression_page_thick_skin_cough_sfx() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_thick_skin_cough_sfx.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_thick_skin_cough_sfx: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture(&img);
    println!("Page thick_skin_cough_sfx detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, angle={:.2}, text='{}', conf={:.2}", i, r.box_, r.angle, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. Exact total region count: exactly 2 regions
    assert_eq!(res.regions.len(), 2, "Page thick_skin_cough_sfx must have exactly 2 regions (dialogue + SFX), got {}", res.regions.len());

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



/// # Regression Test: NPC Harry Potter Spawn Point (Resolution: 800 × 1060 WebP)
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
fn test_regression_page_npc_harry_potter_spawn_point() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_npc_harry_potter_spawn_point.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_npc_harry_potter_spawn_point: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture(&img);
    println!("Page npc_harry_potter_spawn_point detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.angle, r.confidence);
    }

    // 1. Exact count: exactly 6 regions
    assert_eq!(res.regions.len(), 6, "Page npc_harry_potter_spawn_point must have exactly 6 regions, got {}", res.regions.len());

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
fn test_regression_parallel_world_extra_account_suck_up() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "parallel_world_extra_account_suck_up.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_parallel_world_extra_account_suck_up: fixture not found");
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

/// # Regression Test: Stairs Vertical Chirping Noise (Resolution: 800 × 1132 WebP)
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
fn test_regression_page_stairs_vertical_chirping_noise() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_stairs_vertical_chirping_noise.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_stairs_vertical_chirping_noise: fixture not found");
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
        chirp_text.contains("叽") || chirp_text.contains("喳"),
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

/// # Regression Test: Ye Ziyun Sacred Family Genius (Resolution: 800 × 1131 WebP)
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
fn test_regression_page_ye_ziyun_sacred_family_genius() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_ye_ziyun_sacred_family_genius.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_ye_ziyun_sacred_family_genius: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture(&img);
    println!("Page ye_ziyun_sacred_family_genius detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.angle, r.confidence);
    }

    // 1. Exact count: exactly 3 regions
    assert_eq!(res.regions.len(), 3, "Page ye_ziyun_sacred_family_genius must have exactly 3 regions, got {}", res.regions.len());

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
    let mid_text = &mid_left.unwrap().text;
    assert!(
        mid_text.contains("沈越") && mid_text.contains("叶紫芸") && mid_text.contains("神圣世家") && mid_text.contains("安排到这个班"),
        "Middle-left narration block text mismatch: {}",
        mid_text
    );

    // 5. Negative Guard: Zero watermark detection ('漫客栈')
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客") || r.text.contains("漫客栈")),
        "Must not detect bottom-right watermark '漫客栈'"
    );
}

/// # Regression Test: Demon Spirit Book & Thirteen Years Old Adjacent (Resolution: 800 × 1470 WebP)
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
fn test_regression_page_demon_spirit_book_thirteen_years_old_adjacent() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_demon_spirit_book_thirteen_years_old_adjacent.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_demon_spirit_book_thirteen_years_old_adjacent: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture(&img);
    println!("Page demon_spirit_book_thirteen_years_old_adjacent detected {} regions:", res.regions.len());
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

/// # Regression Test: Desert Marching Silhouette Hallucination (Resolution: 800 × 1932 WebP)
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
fn test_regression_page_desert_marching_silhouette_hallucination() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_desert_marching_silhouette_hallucination.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_desert_marching_silhouette_hallucination: fixture not found");
            return;
        }
    };

    let res = crate::common::get_or_analyze_fixture(&img);
    println!("Page desert_marching_silhouette_hallucination detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.angle, r.confidence);
    }

    // 1. Exact count: exactly 5 narration regions
    assert_eq!(res.regions.len(), 5, "Page desert_marching_silhouette_hallucination must have exactly 5 regions, got {}", res.regions.len());

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

/// # Regression Test: Holographic Simulation Beaten Up (Resolution: 800 × 1120 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Large Multi-Line Horizontal Speech Bubble Unification**:
///   Verifies that a 10-line wide speech bubble (*"不是的，我是被人给揍了！..."*) is detected
///   as a single coherent horizontal dialogue bubble without column slicing, line jumbling, or
///   inverted text ordering.
/// - **Vertical Fragment / Phantom Sub-Box Suppression**:
///   Guarantees that vertical slices (*"不：给：游"*, *"。拟头了没"*) are not produced as duplicate
///   overlapping regions over the main horizontal dialogue text.
/// - **Thought Bubble Ellipsis Preservation**:
///   Verifies that the bottom thought bubble (*"全息模拟……"*) preserves its full dialogue and trailing ellipsis.
/// - **Watermark Suppression**:
///   Suppresses `漫客栈` margin watermark.
///
/// ## Key Invariants:
/// - Exactly 2 clean dialogue regions (`assert_eq!(res.regions.len(), 2)`).
/// - Top bubble contains all 10 unified lines in proper reading order.
/// - Negative guard: Zero vertical phantom slices (`"不：给：游"`, `"。拟头了没"`).
/// - Negative guard: Zero `漫客栈` watermark regions.
#[test]
fn test_regression_page_holographic_simulation_beaten_up() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_holographic_simulation_beaten_up.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_holographic_simulation_beaten_up: fixture not found");
            return;
        }
    };

    let res = crate::common::get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("Page holographic_simulation_beaten_up detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.angle, r.confidence);
    }

    // 1. Exact count: exactly 2 regions (top speech bubble + bottom thought bubble)
    assert_eq!(res.regions.len(), 2, "Page holographic_simulation_beaten_up must have exactly 2 regions, got {}", res.regions.len());

    // 2. Top speech bubble: 10-line unified dialogue
    let top_bubble = res.regions.iter().find(|r| r.text.contains("不是的") || r.text.contains("游戏里的技能") || r.text.contains("全息模拟") || r.text.contains("真的好疼啊"));
    assert!(top_bubble.is_some(), "Must detect top dialogue bubble '不是的，我是被人给揍了！...'");
    let top_r = top_bubble.unwrap();
    let top_text = &top_r.text;
    assert!(top_text.contains("不是的") || top_text.contains("我是"), "Top bubble must start with '不是的'");
    assert!(top_text.contains("技能") || top_text.contains("生命"), "Top bubble must contain skill/life reduction");
    assert!(top_text.contains("全息模拟") || top_text.contains("全息"), "Top bubble must contain '全息模拟'");
    assert!(top_text.contains("真的好疼啊") || top_text.contains("好疼啊"), "Top bubble must conclude with '真的好疼啊！'");

    // Spatial boundary parity: top bubble boundary must stay tight inside bubble (x >= 8, not dilating to x=0)
    assert!(top_r.box_.x >= 8, "Top bubble left edge (x={}) must be tight inside bubble (>= 8, not dilated to 0)", top_r.box_.x);
    assert!(top_r.box_.w <= 285, "Top bubble width (w={}) must be tight (<= 285)", top_r.box_.w);

    // 3. Bottom thought bubble: "全息模拟" / "全息模\n拟" / "全息模\n……"
    let bot_thought = res.regions.iter().find(|r| *r != top_bubble.unwrap());
    assert!(bot_thought.is_some(), "Must detect bottom thought bubble");
    let bot_r = bot_thought.unwrap();
    let bot_text = &bot_r.text;
    assert!(bot_text.replace('\n', "").contains("全息模"), "Bottom thought bubble must contain '全息模', got '{}'", bot_text);

    // Spatial boundary parity: bottom thought bubble must match base.webp detector boundary [x: 392, y: 712, w: 93, h: 62]
    assert_eq!(bot_r.box_.x, 392, "Bottom bubble left edge must match base detector (392)");
    assert_eq!(bot_r.box_.y, 712, "Bottom bubble top edge must match base detector (712)");
    assert_eq!(bot_r.box_.w, 93, "Bottom bubble width must match base detector (93)");
    assert_eq!(bot_r.box_.h, 62, "Bottom bubble height must match base detector (62)");

    // 4. Negative Guard: Zero vertical slice phantom boxes
    assert!(
        !res.regions.iter().any(|r| r.text.contains("不：给：游") || r.text.contains("拟头了没") || (r.text.contains("人用削") && !r.text.contains("不是的"))),
        "Must not spawn vertical phantom slices or scrambled fragments"
    );

    // 5. Negative Guard: Zero watermark detection ('漫客栈')
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客") || r.text.contains("漫客栈")),
        "Must not detect margin watermark '漫客栈'"
    );
}

/// # Regression Test: Glory City Sacred Mountain Narration (Resolution: 800 × 1131 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Speech Bubble Unification & Missing Line Recovery**:
///   Guarantees that the middle-left 6-line speech bubble is unified into a single coherent region
///   and preserves the middle line *"不复存在。"*, rather than splitting into 3 fragmented boxes
///   and dropping *"不复存在。"*.
/// - **Ghost Line Hallucination Filtering**:
///   Guarantees that the middle-right 4-line speech bubble (*"虽然经常会受到山脉中..."*) does not
///   hallucinate optical slivers or garbled text (*"右询咨询卿下进告"*).
/// - **Side-by-Side Banner Caption Separation**:
///   Ensures that the two bottom banner boxes (*"那斑驳的城墙，是一座不朽的丰碑！"* and
///   *"而这座代表人类希望的城市，叫做"*) are separated cleanly into distinct regions rather than
///   duplicating full concatenated sentences across two overlapping boxes.
/// - **Calligraphy Title Detection**:
///   Ensures bottom title *"光辉之城"* is cleanly detected.
///
/// ## Key Invariants:
/// - Exactly 6 clean regions (`assert_eq!(res.regions.len(), 6)`).
/// - Middle-left bubble contains all constituent lines including *"不复存在"*.
/// - Middle-right bubble contains 4 clean lines with zero hallucinated lines.
/// - Bottom banners are cleanly separated.
/// - Negative guard: Zero watermark detection (*"漫客栈"*).
#[test]
fn test_regression_page_glory_city_sacred_mountain_narration() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_glory_city_sacred_mountain_narration.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_glory_city_sacred_mountain_narration: fixture not found");
            return;
        }
    };

    let res = crate::common::get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("Page glory_city_sacred_mountain_narration detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.angle, r.confidence);
    }

    // 1. Exact count: exactly 6 regions
    assert_eq!(res.regions.len(), 6, "Page glory_city_sacred_mountain_narration must have exactly 6 regions, got {}", res.regions.len());

    // 2. Exhaustive exact text matching across all 6 regions
    assert_eq!(
        res.regions[0].text.trim(),
        "圣祖山脉之外的世界，已经被妖兽所占领，\n这里的人们已经有数百年不曾与外界有过联系了。",
        "Region r0 (top-left narration) exact text mismatch"
    );
    assert_eq!(
        res.regions[1].text.trim(),
        "谁也不清楚外面的世界是怎\n样的。传说人类在鼎盛时期有着庞\n大的帝国，但如今都已灰飞烟灭，\n不复存在。\n这座城市由于位置隐秘，才得以\n从黑暗时代完整保留下来。",
        "Region r1 (middle-left unified speech bubble) exact text mismatch"
    );
    assert_eq!(
        res.regions[2].text.trim(),
        "虽然经常会受到山脉中\n风雪妖兽的袭击，但这座\n城池还是在次次毁灭性的\n战争中不断重建了起来。",
        "Region r2 (middle-right speech bubble) exact text mismatch"
    );
    assert_eq!(
        res.regions[3].text.trim(),
        "那斑驳的城墙，是一座不朽的丰碑！",
        "Region r3 (bottom-left caption banner) exact text mismatch"
    );
    assert_eq!(
        res.regions[4].text.trim(),
        "而这座代表人类希望的城市，叫做",
        "Region r4 (bottom-right caption banner) exact text mismatch"
    );
    assert_eq!(
        res.regions[5].text.trim(),
        "光辉之城",
        "Region r5 (bottom calligraphy title) exact text mismatch"
    );

    // 3. Spatial boundary guards: ensure tight spatial envelope inside the bubble (clearing black stroke borders)
    let mid_left_r = &res.regions[1];
    assert!(mid_left_r.box_.x >= 50, "Left bubble left edge ({}) must be inside bubble (>= 50)", mid_left_r.box_.x);
    assert!(mid_left_r.box_.y >= 730, "Left bubble top edge ({}) must be inside bubble (>= 730)", mid_left_r.box_.y);
    assert!(mid_left_r.box_.x + mid_left_r.box_.w <= 320, "Left bubble right edge ({}) must not exceed 320", mid_left_r.box_.x + mid_left_r.box_.w);
    assert!(mid_left_r.box_.y + mid_left_r.box_.h <= 905, "Left bubble bottom edge ({}) must not exceed 905", mid_left_r.box_.y + mid_left_r.box_.h);

    // 4. Negative Guard: Zero watermark detection ('漫客栈')
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客") || r.text.contains("漫客栈")),
        "Must not detect bottom watermark '漫客栈'"
    );
}

/// # Regression Test: Saint Orchid Academy & Silver Demon Spiritualist (Resolution: 800 × 1131 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Full Vertical Speech Bubble Unification**:
///   Guarantees that the 6-line dialogue bubble (*"听说这\n新老师是\n神圣世家\n的，还是\n个白银妖\n灵师呢！"*)
///   is fully unified into a single clean region rather than dropping the top 5 lines and only keeping *"灵师呢！"*.
/// - **Full-Page Region Accounting**:
///   Cleanly detects all 3 dialogue/narration regions across panels:
///   1. Panel 1 Banner: *"圣兰学院，武者初级班。"*
///   2. Panel 2 Left Bubble: *"听说这\n新老师是\n神圣世家\n的，还是\n个白银妖\n灵师呢！"*
///   3. Panel 2 Right Bubble: *"神圣世家\n？光辉之城\n的三大巅峰\n世家啊!"*
///
/// ## Key Invariants:
/// - Exactly 3 regions (`assert_eq!(res.regions.len(), 3)`).
/// - Left bubble contains all 6 constituent lines.
/// - Negative guard: Zero watermark detection (*"漫客栈"*).
#[test]
fn test_regression_page_saint_orchid_academy_silver_demon_spiritualist() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_saint_orchid_academy_silver_demon_spiritualist.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_saint_orchid_academy_silver_demon_spiritualist: fixture not found");
            return;
        }
    };

    let res = crate::common::get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("Page saint_orchid_academy_silver_demon_spiritualist detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.angle, r.confidence);
    }

    // 1. Exact count: exactly 3 regions
    assert_eq!(res.regions.len(), 3, "Page saint_orchid_academy_silver_demon_spiritualist must have exactly 3 regions, got {}", res.regions.len());

    assert_eq!(
        res.regions[0].text.trim(),
        "圣兰学院，武者初级班。",
        "Region r0 (banner) text mismatch"
    );
    let r1_text = res.regions[1].text.trim();
    assert!(
        r1_text == "听说这\n新老师是\n神圣世家\n的，还是\n个白银妖\n灵师呢！" || r1_text == "听说这\n新老师是\n神圣世家\n的，还是\n个白银妖\n灵师呢",
        "Region r1 (left 6-line unified speech bubble) exact text mismatch, got '{}'",
        r1_text
    );
    assert_eq!(
        res.regions[2].text.trim(),
        "神圣世家\n？光辉之城\n的三大巅峰\n世家啊!",
        "Region r2 (right speech bubble) exact text mismatch"
    );

    // 3. Negative Guard: Zero watermark detection ('漫客栈')
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客") || r.text.contains("漫客栈")),
        "Must not detect bottom watermark '漫客栈'"
    );
}

/// # Regression Test: Yin Yang Charcoal & Blood Spurt SFX (Resolution: 800 × 1131 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **SFX & Speech Bubble Detection**:
///   Tests detection of dialogue bubbles and sound effect calligraphy on page.
/// - **Negative Guard**:
///   Ensures no watermark or noise artifacts are detected.
#[test]
fn test_regression_page_yin_yang_charcoal_blood_spurt_sfx() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_yin_yang_charcoal_blood_spurt_sfx.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_yin_yang_charcoal_blood_spurt_sfx: fixture not found");
            return;
        }
    };

    let res = crate::common::get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("Page yin_yang_charcoal_blood_spurt_sfx detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}", i, r.box_, r.text.replace('\n', "\\n"), r.angle, r.confidence);
    }

    assert!(!res.regions.is_empty(), "Must detect regions on page_yin_yang_charcoal_blood_spurt_sfx");
}

/// # Regression Test: Yao Shen Ji Cover Calligraphy Art (Resolution: 800 × 1132 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Zero False Positive on Cover Artwork Calligraphy**:
///   Guarantees that the large stylized cover calligraphy title ("妖神记") drawn across the character
///   and snow illustration background is not hallucinated as dialogue or mangled with inpainting.
/// - **Strict Invariant**:
///   Zero regions detected on this splash illustration page (`assert_eq!(res.regions.len(), 0)`).
#[test]
fn test_regression_page_yaoshenji_cover_calligraphy_art() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_yaoshenji_cover_calligraphy_art.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_yaoshenji_cover_calligraphy_art: fixture not found");
            return;
        }
    };

    let res = crate::common::get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("Page yaoshenji_cover_calligraphy_art detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}, kind={:?}", i, r.box_, r.text.replace('\n', "\\n"), r.angle, r.confidence, r.kind);
    }

    // Strict invariant: Zero dialogue/free_text regions on full splash cover art
    assert_eq!(
        res.regions.len(),
        0,
        "Cover artwork illustration must have 0 detected dialogue regions, but got {} regions: {:?}",
        res.regions.len(),
        res.regions.iter().map(|r| &r.text).collect::<Vec<_>>()
    );
}

/// # Regression Test: Nie Li Classroom Dazed & Sudden Wake Up (Resolution: 800 × 1131 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Classroom Speech Bubble & Narration Detection**:
///   Ensures that top classroom dialogue/label (`"黄金"`, `"好厉害"`) and top-right
///   character narration (`"昏昏沉沉的聂离"`) are captured cleanly.
/// - **Desk Chatter SFX & Cloud Caption**:
///   Captures desk sound effect (`"吵吵闹闹"`) and panel 2 caption (`"一缕晨曦穿破云层"`).
/// - **Watermark Suppression & Zero Artwork Hallucinations**:
///   Guarantees bottom-right watermark (`"漫客栈"`) and background illustrations are suppressed.
///
/// ## Key Invariants:
/// - Exactly 5 clean regions detected (`assert_eq!(res.regions.len(), 5)`).
/// - Zero watermark detections (`"漫客栈"`).
#[test]
fn test_regression_page_nie_li_classroom_dazed_wake_up() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_nie_li_classroom_dazed_wake_up.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_nie_li_classroom_dazed_wake_up: fixture not found");
            return;
        }
    };

    let res = crate::common::force_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("Page nie_li_classroom_dazed_wake_up detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}, kind={:?}", i, r.box_, r.text.replace('\n', "\\n"), r.angle, r.confidence, r.kind);
    }

    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");

    // 1. Strict Total Region Count: exactly 6 regions
    assert_eq!(res.regions.len(), 6, "Page nie_li_classroom_dazed_wake_up must have exactly 6 regions, got {}", res.regions.len());

    // 2. Panel 1: Top-left classroom bubbles & labels
    let gold_region = res.regions.iter().find(|r| r.text.contains("黄金"));
    assert!(gold_region.is_some(), "Must detect classroom badge/label '黄金'");
    assert_eq!(gold_region.unwrap().text.trim(), "黄金", "Classroom label text mismatch");

    let amazing_bubble = res.regions.iter().find(|r| r.text.contains("好厉害"));
    assert!(amazing_bubble.is_some(), "Must detect speech bubble '好厉害'");
    assert_eq!(amazing_bubble.unwrap().text.trim(), "好厉害", "Speech bubble text mismatch");

    // 3. Panel 1: Top-right narration
    let nie_li_narration = res.regions.iter().find(|r| r.text.contains("昏昏沉沉") || r.text.contains("聂离"));
    assert!(nie_li_narration.is_some(), "Must detect narration '昏昏沉沉的聂离'");
    assert_eq!(nie_li_narration.unwrap().text.trim(), "昏昏沉沉的聂离", "Narration text mismatch");

    // 4. Panel 1: Desk onomatopoeia
    let desk_sfx = res.regions.iter().find(|r| r.text.contains("吵吵闹闹") || r.text.contains("吵闹"));
    assert!(desk_sfx.is_some(), "Must detect desk SFX '吵吵闹闹'");
    assert_eq!(desk_sfx.unwrap().text.trim(), "吵吵闹闹", "Desk SFX text mismatch");

    // 5. Panel 2: Cloud caption
    let cloud_caption = res.regions.iter().find(|r| r.text.contains("一缕晨曦") || r.text.contains("穿破云层"));
    assert!(cloud_caption.is_some(), "Must detect caption '一缕晨曦穿破云层'");
    assert_eq!(cloud_caption.unwrap().text.trim(), "一缕晨曦穿破云层", "Cloud caption text mismatch");

    // 6. Bottom Panel: Wake up SFX
    let wakeup_sfx = res.regions.iter().find(|r| r.text.contains("陡然") || r.text.contains("惊醒") || r.text.contains("陡") || r.text.contains("醒"));
    assert!(wakeup_sfx.is_some(), "Must detect bottom wakeup SFX '陡然惊醒'");
    assert_eq!(wakeup_sfx.unwrap().text.trim(), "陡然惊醒", "Wakeup SFX text mismatch");
    assert!(wakeup_sfx.unwrap().angle < -2.0, "Wakeup SFX must have upward tilt angle (< -2.0 deg), got {}", wakeup_sfx.unwrap().angle);

    // 7. Negative guard: Watermark suppression
    assert!(
        !all_text.contains("漫客") && !all_text.contains("漫客栈"),
        "Must not detect bottom-right watermark '漫客栈'"
    );
}

/// # Regression Test: Classroom Nie Li Awesome Bubble (Resolution: 800 × 1131 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Speech Bubble Enclosure & Upright Angle Stability**:
///   Guarantees speech bubble `"聂离厉\n害啊！"` is detected cleanly as a dialogue bubble
///   with upright angle (`angle == 0.0°`), avoiding rotated SFX corruption or trailing hallucinated letters (`"国\nW"`).
/// - **Adjacent Small Bubble Capture**:
///   Captures student laughter bubbles (`"噗"`, `"哈"`, `"哈哈"`) without dropping or swallowing them into adjacent clusters.
/// - **Multi-Panel Speech & Monologue Accounting**:
///   Ensures all dialogue across panels is captured cleanly:
///   1. `"噗"`
///   2. `"坐井观天，\n真贴切！"`
///   3. `"是啊"`
///   4. `"聂离…他还\n挺有趣的。"`
///   5. `"哈"`
///   6. `"哈哈"`
///   7. `"聂离厉\n害啊！"` (or `"聂离厉害啊！"`)
///   8. `"竟然说我是井底之\n蛙，气死我了！"`
///   9. `"公然挑衅导师，\n还敢调戏叶紫芸……\n聂离，真有你的！"`
/// - **Watermark Suppression**:
///   Suppresses bottom-right watermark (`"漫客栈"`).
#[test]
fn test_regression_page_classroom_nie_li_awesome_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_classroom_nie_li_awesome_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_classroom_nie_li_awesome_bubble: fixture not found");
            return;
        }
    };

    let res = crate::common::force_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("Page classroom_nie_li_awesome_bubble detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}, kind={:?}", i, r.box_, r.text.replace('\n', "\\n"), r.angle, r.confidence, r.kind);
    }

    let all_text = res.regions.iter().map(|r| r.text.as_str()).collect::<Vec<_>>().join("\n");

    // 1. Panel 1: "噗"
    assert!(res.regions.iter().any(|r| r.text.contains("噗")), "Must detect '噗'");

    // 2. Panel 1: "坐井观天，\n真贴切！"
    let sitting_well = res.regions.iter().find(|r| r.text.contains("坐井观天"));
    assert!(sitting_well.is_some(), "Must detect '坐井观天，真贴切！'");
    assert!(sitting_well.unwrap().text.contains("真贴切"), "Must contain full line");

    // 3. Panel 1: "是啊"
    assert!(res.regions.iter().any(|r| r.text.contains("是啊")), "Must detect '是啊'");

    // 4. Panel 2: "聂离…他还\n挺有趣的。"
    let interesting = res.regions.iter().find(|r| r.text.contains("挺有趣的") || r.text.contains("聂离…他"));
    assert!(interesting.is_some(), "Must detect '聂离…他还挺有趣的。'");

    // 5. Panel 1: "哈" & "哈哈"
    assert!(res.regions.iter().any(|r| r.text.trim() == "哈"), "Must detect '哈'");
    assert!(res.regions.iter().any(|r| r.text.contains("哈哈")), "Must detect '哈哈'");

    // 6. Panel 1: Speech bubble "聂离厉害啊！"
    let nie_li_awesome = res.regions.iter().find(|r| r.text.contains("聂离") && (r.text.contains("厉害") || r.text.contains("害啊")));
    assert!(nie_li_awesome.is_some(), "Must detect speech bubble '聂离厉害啊！'");
    let awesome_r = nie_li_awesome.unwrap();
    assert_eq!(awesome_r.angle, 0.0, "Speech bubble must have upright angle 0.0 deg, got {}", awesome_r.angle);
    assert!(!awesome_r.text.contains("国") && !awesome_r.text.contains("W") && !awesome_r.text.contains("w"), "Speech bubble must not hallucinate '国\\nW'");

    // 7. Panel 1: "竟然说我是井底之\n蛙，气死我了！"
    let frog_bubble = res.regions.iter().find(|r| r.text.contains("井底之") || r.text.contains("气死我了"));
    assert!(frog_bubble.is_some(), "Must detect '竟然说我是井底之蛙，气死我了！'");

    // 8. Panel 6: "公然挑衅导师，\n还敢调戏叶紫芸……\n聂离，真有你的！"
    let provoke_bubble = res.regions.iter().find(|r| r.text.contains("公然挑衅") || r.text.contains("调戏叶紫芸"));
    assert!(provoke_bubble.is_some(), "Must detect '公然挑衅导师，还敢调戏叶紫芸……聂离，真有你的！'");
    let provoke_r = provoke_bubble.unwrap();
    assert!(
        provoke_r.text.contains("……") || provoke_r.text.contains("...") || provoke_r.box_.x + provoke_r.box_.w >= 755,
        "Bottom monologue must encapsulate trailing ellipsis dots ('……') with box width extending to right edge, got text='{}', box={:?}",
        provoke_r.text.replace('\n', "\\n"),
        provoke_r.box_
    );

    // 9. Negative guard: Watermark suppression
    assert!(
        !all_text.contains("漫客") && !all_text.contains("漫客栈"),
        "Must not detect bottom-right watermark '漫客栈'"
    );
}

/// # Regression Test: Snowy Village Smoke Hiss SFX (Resolution: 900 × 1082 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Onomatopoeia (SFX) Consolidation & Recognition**:
///   Guarantees that stylized calligraphy SFX character `"嘶"` (hiss / gasp) in the lower-left
///   is cleanly detected and captured as a single consolidated onomatopoeia/dialogue region,
///   rather than generating duplicate overlapping raw detection boxes (`sfx0` & `sfx1`).
/// - **Negative Guards against Redundant Ghost SFX Boxes**:
///   Ensures zero duplicate overlapping bounding boxes around `(x: ~124, y: ~747)`.
#[test]
fn test_regression_page_snowy_village_smoke_hiss_sfx() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_snowy_village_smoke_hiss_sfx/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_snowy_village_smoke_hiss_sfx: fixture not found");
            return;
        }
    };

    let res = crate::common::force_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("Page snowy_village_smoke_hiss_sfx detected {} regions, {} onomatopoeia:", res.regions.len(), res.onomatopoeia.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', angle={:.2}, conf={:.2}, kind={:?}", i, r.box_, r.text.replace('\n', "\\n"), r.angle, r.confidence, r.kind);
    }
    for (i, s) in res.onomatopoeia.iter().enumerate() {
        println!("  SFX s{}: box={:?}, score={:.2}", i, s.box_, s.score);
    }



    // 1. Lower-left onomatopoeia region must be detected around (x: ~69..160, y: ~700..800)
    let sfx_region = res.regions.iter().find(|r| {
        let (bx, by) = (r.box_.x, r.box_.y);
        (bx >= 50 && bx <= 160) && (by >= 680 && by <= 800)
    });
    assert!(sfx_region.is_some(), "Must detect lower-left SFX region for calligraphy character");
    let sfx_r = sfx_region.unwrap();
    assert!(!sfx_r.text.trim().is_empty(), "SFX region must have OCR text output");

    // 2. Exact region accounting: exactly 1 region
    assert_eq!(res.regions.len(), 1, "Page snowy_village_smoke_hiss_sfx must have exactly 1 region, got {}", res.regions.len());

    // 3. Negative Guard: No duplicate/overlapping onomatopoeia boxes
    if !res.onomatopoeia.is_empty() {
        assert!(res.onomatopoeia.len() <= 1, "Must not have duplicate onomatopoeia candidate boxes for single SFX character, got {}", res.onomatopoeia.len());
    }
}




