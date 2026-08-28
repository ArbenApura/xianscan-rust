// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_inn_couplets_college_virgin_dialogue` (RESOLUTION: 800 x 1344)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 TOP-LEFT DIALOGUE BUBBLE**: `"哦哦！你说那姑娘啊……天一黑就出去了～还没回来…"`
/// - **PANEL 2 LEFT DIALOGUE BUBBLE**: `"！我说～牛啊，\n听说你在城里上大\n学！"`
/// - **PANEL 2 RIGHT DIALOGUE BUBBLE**: `"啊～怎么的？"`
/// - **PANEL 3 LEFT DIALOGUE BUBBLE**: `"没弄个女大学生什么的？"`
/// - **PANEL 3 MIDDLE SPIKY BUBBLE**: `"弄你大爷～一边呆着去！"`
/// - **PANEL 3 BOTTOM LEFT BUBBLE**: `"我天~这么多年～你不会还是童蛋子吧！"`
/// - **PANEL 3 BOTTOM RIGHT BUBBLE**: `"哥我儿子都多大了！"`
/// - **SUPPRESSION GUARD**: Background store signboards / door couplets (`"笑接四海财"`, `"喜迎九州宝"`, `"住宿"`, `"招"`, `"住"`) must be filtered.
/// - **STRICT COUNTS**: Exactly 7 regions (7 DialogueBubble, 0 SoundEffect, 0 FreeText).
#[test]
fn test_regression_page_inn_couplets_college_virgin_dialogue() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_inn_couplets_college_virgin_dialogue/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_inn_couplets_college_virgin_dialogue: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!("Inn Couplets Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 7 REGIONS (7 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 0 FREETEXT)
    crate::assert_element_counts!(res, 7, 7, 0, 0);

    // 2. NEGATIVE GUARDS: NO BACKGROUND COUPLETS OR STORE SIGNBOARDS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("四海财") || r.text.contains("九州宝") || r.text.contains("住宿") || r.text.trim() == "住" || r.text.trim() == "招"),
        "Must NOT detect background door couplets or store signboards on building artwork"
    );

    // 3. VERIFY ALL 7 SPEECH BUBBLES WITH STRICT BOUNDS
    // r0: Top-left bubble [X: ~62, Y: ~43, W: ~249, H: ~202]
    let r0 = &res.regions[0];
    assert_eq!(r0.kind, RegionKind::DialogueBubble);
    assert!(r0.text.contains("你说那姑") && r0.text.contains("还没回"), "Top-left bubble must contain dialogue");
    crate::assert_region_bounds!(r0, RegionKind::DialogueBubble, 62, 43, 249, 202, 10);

    // r1: Panel 2 left bubble [X: ~50, Y: ~308, W: ~256, H: ~99]
    let r1 = &res.regions[1];
    assert_eq!(r1.kind, RegionKind::DialogueBubble);
    assert!(r1.text.contains("牛啊") && r1.text.contains("学"), "Panel 2 left bubble must contain dialogue");
    crate::assert_region_bounds!(r1, RegionKind::DialogueBubble, 50, 308, 256, 99, 10);

    // r2: Panel 2 right bubble [X: ~569, Y: ~378, W: ~172, H: ~128]
    let r2 = &res.regions[2];
    assert_eq!(r2.kind, RegionKind::DialogueBubble);
    assert!(r2.text.contains("怎么的"), "Panel 2 right bubble must contain dialogue");
    crate::assert_region_bounds!(r2, RegionKind::DialogueBubble, 569, 378, 172, 128, 10);

    // r3: Panel 3 left bubble [X: ~55, Y: ~699, W: ~185, H: ~72]
    let r3 = &res.regions[3];
    assert_eq!(r3.kind, RegionKind::DialogueBubble);
    assert!(r3.text.contains("女大学"), "Panel 3 left bubble must contain dialogue");
    crate::assert_region_bounds!(r3, RegionKind::DialogueBubble, 55, 699, 185, 72, 10);

    // r4: Panel 3 middle spiky bubble [X: ~267, Y: ~670, W: ~222, H: ~124]
    let r4 = &res.regions[4];
    assert_eq!(r4.kind, RegionKind::DialogueBubble);
    assert!(r4.text.contains("弄你大爷") && r4.text.contains("一边呆着去"), "Panel 3 spiky bubble must contain dialogue");
    crate::assert_region_bounds!(r4, RegionKind::DialogueBubble, 267, 670, 222, 124, 10);

    // r5: Panel 3 bottom-left bubble [X: ~261, Y: ~955, W: ~189, H: ~138]
    let r5 = &res.regions[5];
    assert_eq!(r5.kind, RegionKind::DialogueBubble);
    assert!(r5.text.contains("童蛋子") || r5.text.contains("这么多年"), "Panel 3 bottom-left bubble must contain dialogue");
    crate::assert_region_bounds!(r5, RegionKind::DialogueBubble, 261, 955, 189, 138, 10);

    // r6: Panel 3 bottom-right bubble [X: ~575, Y: ~975, W: ~174, H: ~82]
    let r6 = &res.regions[6];
    assert_eq!(r6.kind, RegionKind::DialogueBubble);
    assert!(r6.text.contains("哥我儿子都"), "Panel 3 bottom-right bubble must contain dialogue");
    crate::assert_region_bounds!(r6, RegionKind::DialogueBubble, 575, 975, 174, 82, 10);
}