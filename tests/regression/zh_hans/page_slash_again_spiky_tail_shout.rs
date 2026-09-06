// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_slash_again_spiky_tail_shout` (RESOLUTION: 900 × 1262)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 JAGGED SHOUT BUBBLE WITH UPWARD TAIL**: `[47, 387, 165, 184]` (`"再斩！"`).
///   The bubble has a 55px upward-pointing tail directed toward the swordsman at the top,
///   while the text cavity sits in the lower portion of the bubble (`y ≈ 488..525`).
///   Must detect the upward tail and establish a carrier box trimming the top tail so that
///   typeset centering centers the text inside the lower chamber cavity (`cy ≈ 505..515`),
///   rather than pulling text up into the top neck (`cy = 479`).
/// - **EXACT COUNTS**: EXACTLY 3 REGIONS (3 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT).
#[test]
fn test_regression_page_slash_again_spiky_tail_shout() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_slash_again_spiky_tail_shout/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_slash_again_spiky_tail_shout, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Slash Again Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, carrier={:?}, typeset={:?}, text='{}', conf={:.2}",
            i, r.kind, r.angle, r.box_, r.carrier_box, r.typeset_box, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 3 REGIONS (3 DIALOGUE BUBBLES, 0 SFX)
    crate::assert_element_counts!(res, 3, 3, 0);

    // 2. PANEL 1 TOP-LEFT JAGGED SHOUT BUBBLE WITH UPWARD TAIL ("再斩！")
    let slash = res.regions.iter().find(|r| r.text.contains("再斩"));
    assert!(slash.is_some(), "Must detect panel 1 shout bubble '再斩！'");
    let slash = slash.unwrap();
    assert_eq!(slash.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    let bb = slash.bubble_box.as_ref().expect("bubble box must exist");
    assert_eq!(bb.x, 47);
    assert_eq!(bb.y, 387);
    assert_eq!(bb.w, 165);
    assert_eq!(bb.h, 184);


    // Upward tail must be trimmed by carrier box
    let cb = slash.carrier_box.as_ref().expect("Upward tail must yield a carrier box");
    assert!(cb.y >= 425, "Carrier box must trim the upward tail starting at y=387, got y={}", cb.y);
    assert!(cb.h <= 145, "Carrier height must be bounded to the lower chamber, got h={}", cb.h);

    let tb = slash.typeset_box.as_ref().expect("typeset box must exist");
    let tb_cy = tb.y + tb.h / 2;
    let cb_cy = cb.y + cb.h / 2;
    assert!((tb_cy - cb_cy).abs() <= 2, "Typeset box must be centered inside carrier box: tb_cy={}, cb_cy={}", tb_cy, cb_cy);
    assert!(tb_cy >= 495, "Typeset center must reside in lower chamber cavity, got tb_cy={}", tb_cy);

    // 3. PANEL 2 RIGHT THOUGHT/SHOUT BUBBLE ("要死，我要死了！我要逃！！！")
    let panic = res.regions.iter().find(|r| r.text.contains("要死") || r.text.contains("我要逃"));
    assert!(panic.is_some(), "Must detect panel 2 thought bubble");
    let panic = panic.unwrap();
    assert_eq!(panic.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 4. PANEL 3 ESCAPE BUBBLE ("赶紧逃！！！")
    let escape = res.regions.iter().find(|r| r.text.contains("赶紧"));
    assert!(escape.is_some(), "Must detect panel 3 escape bubble '赶紧逃！！！'");
    let escape = escape.unwrap();
    assert_eq!(escape.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
}
