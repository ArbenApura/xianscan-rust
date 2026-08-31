// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # CHINESE REAL-PAGE REGRESSION: `page_luffy_dagger_hmph_cheers` (RESOLUTION: 800 × 1952)
///
/// ## CONTEXT & PURPOSE:
/// - Source: Production page 109991 (seq 6), native 800 × 1952 uncompressed (One Piece Chinese edition).
/// - Scene: Luffy cutting his face with dagger; Shanks crew laughing & drinking; bar feast party.
/// - Defect: In panel 1, `"哼！"` in the left panel was grouped with `"的事了。"` from the adjacent
///   speech bubble in the right panel across the comic panel border, creating a corrupted free-text
///   region `"的事了。\n哼！"` and duplicating `"的事了。"`.
/// - EXPECTED: 21 clean regions with zero cross-panel bleed. `"哼！"` must be cleanly isolated,
///   and `"路飞又在\n做些有趣\n的事了。"` must remain intact without its left line bleeding into a neighbor.
#[test]
fn test_regression_page_luffy_dagger_hmph_cheers() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_luffy_dagger_hmph_cheers/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_luffy_dagger_hmph_cheers: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("=== Chinese Luffy Dagger Hmph Cheers (800x1952) ===");
    println!("Detected {} regions:", res.regions.len());
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

    // 1. TOTAL ELEMENT COUNTS: 21 REGIONS (20 DIALOGUE BUBBLES + 1 FREE/SHOUT TEXT, OR 21 BUBBLES)
    assert_eq!(
        res.regions.len(),
        21,
        "Expected exactly 21 regions on page 109991, got {}",
        res.regions.len()
    );

    // 2. NEGATIVE GUARD: ZERO CROSS-PANEL MERGING OF "的事了。" AND "哼！"
    assert!(
        !res.regions.iter().any(|r| r.text.contains("的事了") && r.text.contains("哼")),
        "Cross-panel contamination detected: '的事了。' and '哼！' must not be grouped together"
    );

    // 3. ISOLATED "哼！" SHOUT/DIALOGUE
    let hmph = res
        .regions
        .iter()
        .find(|r| r.text.contains("哼"))
        .expect("Luffy's '哼！' shout must be detected");
    assert!(
        hmph.text.trim() == "哼！" || hmph.text.trim() == "哼!" || hmph.text.trim() == "哼",
        "Hmph region text must be cleanly isolated without neighboring lines, got: '{}'",
        hmph.text.replace('\n', "\\n")
    );
    assert!(
        hmph.box_.x + hmph.box_.w <= 400,
        "'哼！' must remain strictly in the left panel (x + w <= 400), got: {:?}",
        hmph.box_
    );

    // 4. RIGHT-PANEL DIALOGUE BUBBLE "路飞又在\n做些有趣\n的事了。" MUST REMAIN COMPLETE & UNCORRUPTED
    let luffy_interesting = res
        .regions
        .iter()
        .find(|r| r.text.contains("路飞又在") || r.text.contains("做些有趣"))
        .expect("Dialogue bubble '路飞又在做些有趣的事了。' must be detected");
    assert!(
        luffy_interesting.text.contains("路飞又在")
            && luffy_interesting.text.contains("做些有趣")
            && luffy_interesting.text.contains("的事了"),
        "Bubble must contain all 3 vertical columns, got: '{}'",
        luffy_interesting.text.replace('\n', "\\n")
    );

    // 5. ALL OTHER KEY DIALOGUES PRESENT & UNCORRUPTED
    assert!(
        res.regions.iter().any(|r| r.text.contains("笑死人了")),
        "'笑死人了' bubble must exist"
    );
    assert!(
        res.regions.iter().any(|r| r.text.contains("想要干吗") || r.text.contains("想要干么")),
        "'真不知道你想要干吗？' bubble must exist"
    );
    assert!(
        res.regions.iter().any(|r| r.text.contains("傻") && r.text.contains("干吗")),
        "'傻……傻瓜你干吗啊？！' bubble must exist"
    );
    assert!(
        res.regions.iter().any(|r| r.text.contains("痛痛痛") || r.text.contains("好痛")),
        "'好痛痛痛' bubble must exist"
    );
    assert!(
        res.regions.iter().any(|r| r.text.contains("干杯")),
        "'弟兄们，干杯！' / '和我们伟大的旅程干杯！！' bubbles must exist"
    );
    assert!(
        res.regions.iter().any(|r| r.text.contains("当海盗")),
        "'我超级想当海盗！！！' bubble must exist"
    );
}
