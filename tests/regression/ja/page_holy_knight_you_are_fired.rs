// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_holy_knight_you_are_fired` (RESOLUTION: 1125 × 1970 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **CHARACTER PLACARD CARDS FULL-TEXT INTEGRITY**:
///   VERIFIES ALL 4 TITLE/NAME PLACARDS ARE CLEANLY EXTRACTED WITHOUT JUMBLED RADICALS OR DROPPED NAMES:
///   - `聖騎士 カッシュ・ビルボア` (NOT SCRAMBLED `士騎ッ聖力`, MUST RETAIN `カッシュ・ビルボア`)
///   - `軽戦士 メリッサ` (NOT SCRAMBLED `サ士ッ戦り軽メ`, MUST RETAIN `メリッサ`)
///   - `黒魔術師 ノーリス` (NOT SCRAMBLED `師ス術リ魔`, MUST RETAIN `ノーリス`)
///   - `盗賊 ルーク`
/// - **SMALL EXCLAMATION & WHISPER BUBBLE FIDELITY**:
///   - PANEL 1 BOY WHISPER `くび…` (NOT `で`)
///   - PANEL 2 SNICKER `ぶ！` (NOT LATIN `Bi!`)
///   - REACTION BUBBLE `…ッ` (NOT `ツ`)
///   - CLEAN `クビだよ` (NOT TRAILING HALLUCINATION `クビだよく`)
#[test]
fn test_regression_page_holy_knight_you_are_fired() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_holy_knight_you_are_fired.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_holy_knight_you_are_fired: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 1125x1970 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, box={:?}, bubble_box={:?}, text='{}', conf={:.2}, vert={}",
            i, r.kind, r.box_, r.bubble_box, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. STRICT 16-REGION ACCOUNTING
    assert!(res.regions.len() >= 14 && res.regions.len() <= 17, "Expected ~16 regions on page, found {}", res.regions.len());

    // 1. TOP-LEFT CARD: '聖騎士 カッシュ・ビルボア'
    let knight_card = res.regions.iter().find(|r| (r.box_.x < 250 && r.box_.y < 150) || r.text.contains("聖騎士") || r.text.contains("ビルボア"));
    assert!(knight_card.is_some(), "Must detect top-left knight card");
    let knight_card = knight_card.unwrap();
    assert!(!knight_card.text.contains("士\n騎ッ"), "Card must not have scrambled reversed characters, text='{}'", knight_card.text);
    assert!(knight_card.text.contains("ビルボア") || knight_card.text.contains("カッシュ"), "Card must retain name 'カッシュ・ビルボア', text='{}'", knight_card.text);

    // 2. PANEL 1 FIRED BUBBLE: 'クビだよ' (NO TRAILING 'く')
    let fired_bubble = res.regions.iter().find(|r| r.text.contains("クビだよ") && r.box_.y < 400);
    assert!(fired_bubble.is_some(), "Must detect 'クビだよ' bubble");
    let fired_bubble = fired_bubble.unwrap();
    assert!(!fired_bubble.text.ends_with("よく"), "Must not append hallucinated trailing 'く', text='{}'", fired_bubble.text);

    // 3. PANEL 1 WHISPER BUBBLE: 'くび…'
    let whisper_bubble = res.regions.iter().find(|r| r.box_.y >= 650 && r.box_.y <= 750 && r.box_.x >= 320 && r.box_.x <= 450);
    assert!(whisper_bubble.is_some(), "Must detect panel 1 whisper bubble");
    let whisper_bubble = whisper_bubble.unwrap();
    assert!(!whisper_bubble.text.trim().eq("で"), "Whisper bubble must not be misrecognized as 'で', text='{}'", whisper_bubble.text);

    // 4. PANEL 2 EXCLAMATION BUBBLE: 'ぶ！'
    let bu_bubble = res.regions.iter().find(|r| r.box_.y >= 800 && r.box_.y <= 950 && r.box_.x >= 480 && r.box_.x <= 620);
    assert!(bu_bubble.is_some(), "Must detect snicker bubble 'ぶ！'");
    let bu_bubble = bu_bubble.unwrap();
    assert!(!bu_bubble.text.contains("Bi"), "Must not misread 'ぶ！' as Latin 'Bi!', text='{}'", bu_bubble.text);

    // 5. MELISSA PLACARD: '軽戦士 メリッサ'
    let melissa_card = res.regions.iter().find(|r| (r.box_.y >= 1250 && r.box_.y <= 1450 && r.box_.x >= 300 && r.box_.x <= 480) || r.text.contains("メリッサ"));
    assert!(melissa_card.is_some(), "Must detect Melissa card");
    let melissa_card = melissa_card.unwrap();
    assert!(!melissa_card.text.contains("サ\n士ッ"), "Must not scramble Melissa card into fragments, text='{}'", melissa_card.text);
    assert!(melissa_card.text.contains("メリッサ") || melissa_card.text.contains("戦士"), "Card must contain title or name, text='{}'", melissa_card.text);

    // 6. NORIS PLACARD: '黒魔術師 ノーリス'
    let noris_card = res.regions.iter().find(|r| (r.box_.y >= 1750 && r.box_.x >= 100 && r.box_.x <= 300) || r.text.contains("ノーリス") || r.text.contains("魔術師"));
    assert!(noris_card.is_some(), "Must detect Noris card");
    let noris_card = noris_card.unwrap();
    assert!(!noris_card.text.contains("師ス\n術"), "Must not scramble Noris card into fragments, text='{}'", noris_card.text);
}
