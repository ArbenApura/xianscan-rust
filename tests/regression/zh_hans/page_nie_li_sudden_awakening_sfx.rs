// -- INTERNAL IMPORTS -- //
use crate::common::{get_or_analyze_fixture_with_lang, get_or_analyze_fixture_with_opts};
use xianscan_rust::ml::schemas::AnalyzeOptions;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_nie_li_sudden_awakening_sfx_enabled` (RESOLUTION: 800 × 1950)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1-3 DIALOGUE BUBBLES**: 3 dialogue bubbles (`"烈焰妖狐"`, `"烈焰妖狐属于黄金级的妖兽..."`, `"妖灵附体之后..."`).
/// - **PANEL 3 FREE TEXT / NARRATIONS / REACTION SPEECH**:
///   - 6 free texts: `"黄金"`, `"哇"`, `"昏昏沉沉的聂离"`, `"好厉害"`, `"啊"`, `"一缕晨曦穿破云层"`.
///   - Reaction dialogues (`"哇"`, `"啊"`) are strictly locked as FreeText.
/// - **SOUND EFFECTS (SFX ENABLED)**:
///   - Desk chatter: `"吵吵闹闹"` (SoundEffect, upright)
///   - Bottom stylized calligraphy: `"陡然惊醒"` (SoundEffect, slanted angle ≈ -12.39°)
/// - **EXACT COUNTS**: Exactly 11 regions (3 dialogue bubbles, 2 sound effects, 6 free text).
#[test]
fn test_regression_page_nie_li_sudden_awakening_sfx_enabled() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_nie_li_sudden_awakening_sfx_enabled.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_nie_li_sudden_awakening_sfx_enabled: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Nie Li Awakening (SFX ON) detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  [SFX ON] Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}'", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"));
    }

    // 1. EXACT ELEMENT COUNTS: 11 REGIONS (3 DIALOGUE BUBBLES, 2 SOUND EFFECTS, 6 FREE TEXT)
    crate::assert_element_counts!(res, 11, 3, 2, 6);

    // 2. DIALOGUE BUBBLE 1: '烈焰妖狐'
    let b1 = res.regions.iter().find(|r| r.text.contains("烈焰妖狐") && r.box_.y < 300);
    assert!(b1.is_some(), "Must detect bubble 1 '烈焰妖狐'");
    let b1 = b1.unwrap();
    crate::assert_region_bounds!(b1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 29, 81, 150, 46, 8);
    crate::assert_bubble_bounds!(b1, 21, 21, 179, 192, 8);

    // 3. DIALOGUE BUBBLE 2: '烈焰妖狐属于黄金级的妖兽...'
    let b2 = res.regions.iter().find(|r| r.text.contains("烈焰妖狐属于黄金级的妖兽") || r.text.contains("黄金妖灵师"));
    assert!(b2.is_some(), "Must detect bubble 2 '烈焰妖狐属于黄金级的妖兽...'");
    let b2 = b2.unwrap();
    crate::assert_region_bounds!(b2, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 429, 458, 287, 113, 8);
    crate::assert_bubble_bounds!(b2, 420, 450, 317, 151, 8);

    // 4. DIALOGUE BUBBLE 3: '妖灵附体\n之后...'
    let b3 = res.regions.iter().find(|r| r.text.contains("妖灵附体"));
    assert!(b3.is_some(), "Must detect bubble 3 '妖灵附体...'");
    let b3 = b3.unwrap();
    crate::assert_region_bounds!(b3, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 7, 658, 118, 145, 8);
    crate::assert_bubble_bounds!(b3, 5, 653, 135, 155, 8);

    // 5. FREE TEXT 1: '黄金'
    let ft1 = res.regions.iter().find(|r| r.text.contains("黄金") && r.box_.y > 800 && r.box_.y < 860 && r.box_.x < 100);
    assert!(ft1.is_some(), "Must detect free text 1 '黄金'");
    let ft1 = ft1.unwrap();
    crate::assert_region_bounds!(ft1, xianscan_rust::ml::schemas::RegionKind::FreeText, 23, 823, 45, 28, 8);

    // 6. FREE TEXT 2: '哇' (Student reaction dialogue)
    let ft_wa = res.regions.iter().find(|r| r.text.trim() == "哇");
    assert!(ft_wa.is_some(), "Must detect free text '哇'");
    let ft_wa = ft_wa.unwrap();
    crate::assert_region_bounds!(ft_wa, xianscan_rust::ml::schemas::RegionKind::FreeText, 153, 831, 13, 12, 8);

    // 7. FREE TEXT 3: '昏昏沉沉的聂离'
    let ft2 = res.regions.iter().find(|r| r.text.contains("昏昏沉沉"));
    assert!(ft2.is_some(), "Must detect free text 3 '昏昏沉沉的聂离'");
    let ft2 = ft2.unwrap();
    crate::assert_region_bounds!(ft2, xianscan_rust::ml::schemas::RegionKind::FreeText, 648, 835, 128, 27, 8);

    // 8. FREE TEXT 4: '好厉害'
    let ft3 = res.regions.iter().find(|r| r.text.contains("好厉害"));
    assert!(ft3.is_some(), "Must detect free text 4 '好厉害'");
    let ft3 = ft3.unwrap();
    crate::assert_region_bounds!(ft3, xianscan_rust::ml::schemas::RegionKind::FreeText, 253, 883, 44, 18, 8);

    // 9. FREE TEXT 5: '啊' (Student reaction dialogue)
    let ft_a = res.regions.iter().find(|r| r.text.trim() == "啊");
    assert!(ft_a.is_some(), "Must detect free text '啊'");
    let ft_a = ft_a.unwrap();
    crate::assert_region_bounds!(ft_a, xianscan_rust::ml::schemas::RegionKind::FreeText, 172, 969, 17, 16, 8);

    // 10. SFX 1: '吵吵闹闹'
    let sfx1 = res.regions.iter().find(|r| r.text.contains("吵吵闹闹") || (r.kind == xianscan_rust::ml::schemas::RegionKind::SoundEffect && r.box_.y > 1000 && r.box_.y < 1200));
    assert!(sfx1.is_some(), "Must detect SFX 1 '吵吵闹闹'");
    let sfx1 = sfx1.unwrap();
    crate::assert_region_bounds!(sfx1, xianscan_rust::ml::schemas::RegionKind::SoundEffect, 124, 1067, 221, 82, 8);

    // 11. FREE TEXT 6: '一缕晨曦穿破云层'
    let ft4 = res.regions.iter().find(|r| r.text.contains("一缕晨曦"));
    assert!(ft4.is_some(), "Must detect free text 6 '一缕晨曦穿破云层'");
    let ft4 = ft4.unwrap();
    crate::assert_region_bounds!(ft4, xianscan_rust::ml::schemas::RegionKind::FreeText, 41, 1159, 139, 27, 8);

    // 12. SFX 2: '陡然惊醒'
    let sfx2 = res.regions.iter().find(|r| r.text.contains("惊醒") || (r.kind == xianscan_rust::ml::schemas::RegionKind::SoundEffect && r.box_.y > 1500));
    assert!(sfx2.is_some(), "Must detect SFX 2 '陡然惊醒'");
    let sfx2 = sfx2.unwrap();
    crate::assert_region_bounds!(sfx2, xianscan_rust::ml::schemas::RegionKind::SoundEffect, 0, 1616, 413, 227, 10);
    crate::assert_region_angle!(sfx2, -12.39, 3.0);
}

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_nie_li_sudden_awakening_sfx_disabled` (RESOLUTION: 800 × 1950)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **SFX SUPPRESSION (SFX DISABLED)**:
///   - When `enable_sfx = false`, all sound effects (including `"吵吵闹闹"` and slanted `"陡然惊醒"`) must be suppressed.
///   - Reaction dialogues (`"哇"`, `"啊"`) and all 6 free texts must be fully preserved.
///   - Slanted SFX calligraphy must NOT fall back into `free_text`.
/// - **EXACT COUNTS**: Exactly 9 regions (3 dialogue bubbles, 0 sound effects, 6 free text).
#[test]
fn test_regression_page_nie_li_sudden_awakening_sfx_disabled() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_nie_li_sudden_awakening_sfx_disabled.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_nie_li_sudden_awakening_sfx_disabled: fixture not found");
            return;
        }
    };

    let opts_sfx_off = AnalyzeOptions {
        source_lang: Some("zh_hans".to_string()),
        target_lang: Some("en".to_string()),
        enable_sfx: Some(false),
        enable_watermark_inpaint: Some(false),
        inpaint_padding_pct: Some(0.06),
        typeset_padding_pct: Some(0.12),
        ..Default::default()
    };
    let res = get_or_analyze_fixture_with_opts(&img, &opts_sfx_off);
    println!("ZH-Hans Nie Li Awakening (SFX OFF) detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  [SFX OFF] Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}'", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"));
    }

    // 1. EXACT ELEMENT COUNTS: 9 REGIONS (3 DIALOGUE BUBBLES, 0 SOUND EFFECTS, 6 FREE TEXT)
    crate::assert_element_counts!(res, 9, 3, 0, 6);

    // 2. DIALOGUE BUBBLE 1: '烈焰妖狐'
    let b1 = res.regions.iter().find(|r| r.text.contains("烈焰妖狐") && r.box_.y < 300);
    assert!(b1.is_some(), "Must detect bubble 1 '烈焰妖狐'");
    let b1 = b1.unwrap();
    crate::assert_region_bounds!(b1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 29, 81, 150, 46, 8);
    crate::assert_bubble_bounds!(b1, 21, 21, 179, 192, 8);

    // 3. DIALOGUE BUBBLE 2: '烈焰妖狐属于黄金级的妖兽...'
    let b2 = res.regions.iter().find(|r| r.text.contains("烈焰妖狐属于黄金级的妖兽") || r.text.contains("黄金妖灵师"));
    assert!(b2.is_some(), "Must detect bubble 2 '烈焰妖狐属于黄金级的妖兽...'");
    let b2 = b2.unwrap();
    crate::assert_region_bounds!(b2, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 429, 458, 287, 113, 8);
    crate::assert_bubble_bounds!(b2, 420, 450, 317, 151, 8);

    // 4. DIALOGUE BUBBLE 3: '妖灵附体\n之后...'
    let b3 = res.regions.iter().find(|r| r.text.contains("妖灵附体"));
    assert!(b3.is_some(), "Must detect bubble 3 '妖灵附体...'");
    let b3 = b3.unwrap();
    crate::assert_region_bounds!(b3, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 7, 658, 118, 145, 8);
    crate::assert_bubble_bounds!(b3, 5, 653, 135, 155, 8);

    // 5. FREE TEXT 1: '黄金'
    let ft1 = res.regions.iter().find(|r| r.text.contains("黄金") && r.box_.y > 800 && r.box_.y < 860 && r.box_.x < 100);
    assert!(ft1.is_some(), "Must detect free text 1 '黄金'");
    let ft1 = ft1.unwrap();
    crate::assert_region_bounds!(ft1, xianscan_rust::ml::schemas::RegionKind::FreeText, 23, 823, 45, 28, 8);

    // 6. FREE TEXT 2: '哇' (Student reaction dialogue)
    let ft_wa = res.regions.iter().find(|r| r.text.trim() == "哇");
    assert!(ft_wa.is_some(), "Must detect free text '哇'");
    let ft_wa = ft_wa.unwrap();
    crate::assert_region_bounds!(ft_wa, xianscan_rust::ml::schemas::RegionKind::FreeText, 153, 831, 13, 12, 8);

    // 7. FREE TEXT 3: '昏昏沉沉的聂离'
    let ft2 = res.regions.iter().find(|r| r.text.contains("昏昏沉沉"));
    assert!(ft2.is_some(), "Must detect free text 3 '昏昏沉沉的聂离'");
    let ft2 = ft2.unwrap();
    crate::assert_region_bounds!(ft2, xianscan_rust::ml::schemas::RegionKind::FreeText, 648, 835, 128, 27, 8);

    // 8. FREE TEXT 4: '好厉害'
    let ft3 = res.regions.iter().find(|r| r.text.contains("好厉害"));
    assert!(ft3.is_some(), "Must detect free text 4 '好厉害'");
    let ft3 = ft3.unwrap();
    crate::assert_region_bounds!(ft3, xianscan_rust::ml::schemas::RegionKind::FreeText, 253, 883, 44, 18, 8);

    // 9. FREE TEXT 5: '啊' (Student reaction dialogue)
    let ft_a = res.regions.iter().find(|r| r.text.trim() == "啊");
    assert!(ft_a.is_some(), "Must detect free text '啊'");
    let ft_a = ft_a.unwrap();
    crate::assert_region_bounds!(ft_a, xianscan_rust::ml::schemas::RegionKind::FreeText, 172, 969, 17, 16, 8);

    // 10. FREE TEXT 6: '一缕晨曦穿破云层'
    let ft4 = res.regions.iter().find(|r| r.text.contains("一缕晨曦"));
    assert!(ft4.is_some(), "Must detect free text 6 '一缕晨曦穿破云层'");
    let ft4 = ft4.unwrap();
    crate::assert_region_bounds!(ft4, xianscan_rust::ml::schemas::RegionKind::FreeText, 41, 1159, 139, 27, 8);

    // 11. EXPLICIT NEGATIVE GUARDS: ACTUAL SFX MUST NOT BE PRESENT NOR CONVERTED TO FREE TEXT
    assert!(!res.regions.iter().any(|r| r.text.contains("吵吵闹闹")), "'吵吵闹闹' SFX must be suppressed when enable_sfx=false");
    assert!(!res.regions.iter().any(|r| r.text.contains("惊醒")), "'陡然惊醒' SFX must be suppressed when enable_sfx=false");
}
