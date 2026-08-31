// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # CHINESE LOW-RES PARITY REGRESSION: `page_pirate_flag_east_wind_lowres_parity` (RESOLUTION: 800 × 1419)
///
/// ## CONTEXT & PURPOSE:
/// - Source: Production page 109990 (seq 4), 800 × 1419 resolution variant (One Piece Chinese edition).
/// - Scene: 5 narration boxes + 4 speech bubbles; the black pirate flag panel carries a vertical caption
///   `"吹的是东风。"` to the right of the flag.
/// - PARITY EXPECTATION: All 9 regions must be cleanly detected as DialogueBubbles across both high ($960\times 1695$)
///   and mid/low ($800\times 1419$) resolutions without dropping the flag caption or picking up flag texture noise.
#[test]
fn test_regression_page_pirate_flag_east_wind_lowres_parity() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_pirate_flag_east_wind_lowres_parity/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_pirate_flag_east_wind_lowres_parity: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("=== Chinese Pirate Flag East Wind Low-Res Parity ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  [Region {}] id={}, kind={:?}, text=\"{}\", conf={:.3}, angle={:.2}, vertical={}, box={:?}, bubble_box={:?}",
            i,
            r.id,
            r.kind,
            r.text.replace('\n', "\\n"),
            r.confidence,
            r.angle,
            r.vertical,
            r.box_,
            r.bubble_box
        );
    }

    // 0. STRICT 9-REGION ACCOUNTING (9 DIALOGUE BUBBLES, 0 SOUNDEFFECTS, 0 FREETEXT)
    crate::assert_element_counts!(res, 9, 9, 0, 0);

    // 1. TOP-RIGHT NARRATION BOX: '大约一年 前左右，'
    let top_right = res.regions.iter().find(|r| r.text.contains("大约一年"));
    assert!(top_right.is_some(), "Must detect top-right narration '大约一年 前左右，'");

    // 2. TOP-LEFT NARRATION BOX: '港里来了 一艘海盗 船停泊 至今。'
    let top_left = res.regions.iter().find(|r| r.text.contains("港") && r.text.contains("海"));
    assert!(top_left.is_some(), "Must detect top-left narration '港里来了 一艘海盗 船停泊 至今。'");

    // 3. MIDDLE-LEFT BUBBLE: '哼！'
    let hmph = res.regions.iter().find(|r| r.text.contains("哼"));
    assert!(hmph.is_some(), "Must detect middle-left bubble '哼！'");

    // 4. MIDDLE-CENTER LUFFY BUBBLE: '喂！路飞，你想干什么？'
    let luffy_what = res.regions.iter().find(|r| (r.text.contains("路飞") || r.text.contains("干") || r.text.contains("想")) && r.box_.x > 300 && r.box_.x < 420 && r.box_.y > 400 && r.box_.y < 520);
    assert!(luffy_what.is_some(), "Must detect middle-center bubble '喂！路飞，你想干什么？'");
    let luffy_what = luffy_what.unwrap();
    assert_eq!(
        luffy_what.kind,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        "Luffy speech must be classified as DialogueBubble"
    );
    crate::assert_region_bounds!(luffy_what, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 359, 445, 108, 127, 12);
    crate::assert_bubble_bounds!(luffy_what, 338, 439, 140, 159, 12);

    // 5. FLAG-PANEL CAPTION: '吹的是东风。' (MUST BE DIALOGUEBUBBLE, ZERO TEXTURE NOISE)
    let caption = res.regions.iter().find(|r| r.text.contains("东风"));
    assert!(caption.is_some(), "Must detect flag panel caption '吹的是东风。'");
    let caption = caption.unwrap();
    assert_eq!(
        caption.kind,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        "Flag caption must be classified as DialogueBubble"
    );
    assert!(!caption.text.contains("PYoo"), "Flag caption must not include pirate flag noise strokes");
    crate::assert_region_angle!(caption, 0.0, 2.0);

    // 6. BOTTOM-LEFT TOWN NARRATION BOX: '小镇依然 很宁静。'
    let town_peace = res.regions.iter().find(|r| r.text.contains("小镇依然") || r.text.contains("宁静"));
    assert!(town_peace.is_some(), "Must detect bottom-left town narration '小镇依然 很宁静。'");

    // 7. BOTTOM LUFFY LEFT BUBBLE: '我要证明给 你们看！！'
    let prove_it = res.regions.iter().find(|r| r.text.contains("证明") && r.text.contains("你们看"));
    assert!(prove_it.is_some(), "Must detect bottom Luffy left bubble '我要证明给 你们看！！'");

    // 8. BOTTOM LUFFY RIGHT BUBBLE: '我可不是闹着玩 的！我可已经受 够了！'
    let had_enough = res.regions.iter().find(|r| r.text.contains("闹着玩") || r.text.contains("受够"));
    assert!(had_enough.is_some(), "Must detect bottom Luffy right bubble '我可不是闹着玩 的！我可已经受 够了！'");

    // 9. BOTTOM-RIGHT LUFFY TITLE CAPTION BOX: '小镇少年 蒙奇·D·路飞'
    let luffy_title = res.regions.iter().find(|r| r.text.contains("蒙奇") && r.text.contains("路飞"));
    assert!(luffy_title.is_some(), "Must detect bottom-right Luffy title caption '小镇少年 蒙奇·D·路飞'");
}
