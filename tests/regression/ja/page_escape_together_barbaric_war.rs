// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_escape_together_barbaric_war` (RESOLUTION: 836 × 1202 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **BOTTOM-LEFT FREE-TEXT MULTI-COLUMN RETENTION (`その時は`)**:
///   IN BOTTOM-LEFT PANEL, THE ELF SPEECH HAS 3 COLUMNS: `その時は`, `一緒に逃げましょう`, `戦争とか野蛮！`.
///   DETECTION/OCR MUST NOT DROP THE RIGHTMOST COLUMN `その時は`.
/// - **FULL VERTICAL HEIGHT COVERAGE (`そうだね 逃げるが勝ちだね`)**:
///   IN THE SAME PANEL, BOY MONOLOGUE `そうだね\n逃げるが勝ち\nだね` EXTENDS DOWNWARDS.
///   THE BOUNDING BOX HEIGHT MUST COVER THE LOWER CHARACTERS (`だね`) TO PREVENT UNCLEAN INPAINTING BLEED-THROUGH.
/// - **FREE-TEXT PROPER CLASSIFICATION (`慎重に行こう`)**:
///   IN PANEL 2, THE VERTICAL HANDWRITTEN TEXT `慎重に行こう` IS ARTWORK FREE TEXT.
///   IT MUST NOT FALSELY INHERIT THE ADJACENT SPEECH BALLOON'S BUBBLE_BOX, AND OCR MUST NOT MISTAKE `こ` FOR `ミ`.
#[test]
fn test_regression_page_escape_together_barbaric_war() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_escape_together_barbaric_war.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_escape_together_barbaric_war: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 836x1202 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, box={:?}, bubble_box={:?}, text='{}', conf={:.2}, vert={}",
            i, r.kind, r.box_, r.bubble_box, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. STRICT 10-REGION ACCOUNTING (8 DIALOGUEBUBBLES, 0 SOUNDEFFECTS, 2 FREETEXT - OR 7 BUBBLES, 3 FREETEXT IF '慎重に行こう' IS FREETEXT)
    assert!(res.regions.len() >= 9 && res.regions.len() <= 11, "Expected ~10 regions on page, found {}", res.regions.len());

    // 1. PANEL 1 TOP-RIGHT BUBBLE: 'さしあたって ファンタジー世界確定ってことだろうか'
    let fantasy_bubble = res.regions.iter().find(|r| r.text.contains("ファンタジー") || r.text.contains("さしあたって"));
    assert!(fantasy_bubble.is_some(), "Must detect panel 1 top-right fantasy world bubble");

    // 2. PANEL 1 LEFT BUBBLE: 'ダークエルフは 邪悪寄りの中立属性なので少し安心ですね'
    let dark_elf_bubble = res.regions.iter().find(|r| r.text.contains("ダークエルフ") || r.text.contains("中立属性"));
    assert!(dark_elf_bubble.is_some(), "Must detect panel 1 dark elf bubble");

    // 3. PANEL 2 ARTWORK FREE-TEXT: '慎重に行こう'
    let caution_text = res.regions.iter().find(|r| r.text.contains("慎重に"));
    assert!(caution_text.is_some(), "Must detect panel 2 '慎重に行こう' text");
    let caution_text = caution_text.unwrap();
    assert!(!caution_text.text.contains("行ミう"), "OCR must not confuse 'こ' with 'ミ', text='{}'", caution_text.text);
    // FREE-STANDING ARTWORK TEXT SHOULD NOT CLAIM A BUBBLE ENVELOPE SPANNING ACROSS THE ENTIRE NEIGHBORING BUBBLE
    if let Some(ref b) = caution_text.bubble_box {
        assert!(b.w < 200, "Caution text must not inherit neighboring large bubble box");
    }

    // 4. BOTTOM-LEFT ELF SPEECH: 'その時は 一緒に逃げましょう 戦争とか野蛮！'
    let elf_escape = res.regions.iter().find(|r| r.text.contains("逃げましょう") || r.text.contains("戦争"));
    assert!(elf_escape.is_some(), "Must detect bottom-left elf escape speech");
    let elf_escape = elf_escape.unwrap();
    assert!(
        elf_escape.text.contains("その時") || elf_escape.text.contains("そのときは"),
        "Elf speech must include leading column 'その時は', text='{}'", elf_escape.text
    );

    // 5. BOTTOM-LEFT BOY SPEECH: 'そうだね 逃げるが勝ちだね'
    let boy_escape = res.regions.iter().find(|r| r.text.contains("逃げるが") || (r.text.contains("そうだね") && r.box_.x < 200 && r.box_.y > 800));
    assert!(boy_escape.is_some(), "Must detect bottom-left boy escape speech");
    let boy_escape = boy_escape.unwrap();
    assert!(
        boy_escape.text.contains("勝ち") || boy_escape.text.contains("だね"),
        "Boy speech must not truncate lower characters '勝ち/だね', text='{}'", boy_escape.text
    );
    assert!(boy_escape.box_.h >= 90, "Bounding box height must cover full column down through 'だね', h={}", boy_escape.box_.h);
}
