use std::path::Path;
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::detect::filter_text_by_source_lang;

/// # Japanese Manga Regression Test: Vertical Dialogue & Mixed Script Recognition
///
/// ## Purpose & Behavior Tested:
/// - **Language Routing (`ja`)**:
///   Verifies that `PipelineEngine` with `source_lang: Some("ja")` processes Japanese
///   comic pages, preserving Kanji, Hiragana, Katakana, and Japanese punctuation (`「」`, `…`, `ー`).
/// - **Vertical Reading & Script Integrity**:
///   Verifies that CJK character filtering retains full Japanese Unicode blocks
///   (`\u3040-\u309f` Hiragana, `\u30a0-\u30ff` Katakana, `\u4e00-\u9fff` Kanji).
/// - **Negative Foreign Script Filtering**:
///   Ensures that Cyrillic, Thai, or random non-Japanese noise is stripped.
#[test]
fn test_regression_japanese_script_handling() {
    let mixed_text = "魔王を討伐する！\nこれはテストです。";
    let filtered = filter_text_by_source_lang(mixed_text, Some("ja"));
    assert_eq!(filtered, "魔王を討伐する！\nこれはテストです。");

    let contaminated = "魔王を討伐する！ДПриветสวัสดี";
    let cleaned = filter_text_by_source_lang(contaminated, Some("ja"));
    assert_eq!(cleaned.trim(), "魔王を討伐する！");
}

/// # Japanese Real-Page Regression: `page_zhang_yude_chengdu_cemetery.webp` with `ja` Source Routing
#[test]
fn test_regression_page_with_japanese_source_routing() {
    let mut img_path = Path::new("tests/fixtures/ja/sample.webp"); if !img_path.exists() { img_path = Path::new("tests/fixtures/zh_hans/page_zhang_yude_chengdu_cemetery.webp"); };
    if !img_path.exists() {
        eprintln!("Fixture {:?} not found, skipping test", img_path);
        return;
    }

    let img = image::ImageReader::open(img_path)
        .expect("Failed to open fixture image")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    assert!(!res.regions.is_empty(), "Pipeline in Japanese mode must detect text regions");

    for r in &res.regions {
        assert!(!r.text.is_empty(), "Region text must not be empty");
        assert!(r.box_.w > 0 && r.box_.h > 0, "Region dimensions must be positive");
    }
}

/// # Japanese Real-Page Regression: `page_lucky_me_first_place_vertical.webp` (Resolution: 1129 × 1600 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Vertical Japanese Multi-Column Reading Order (Right-to-Left)**:
///   Guarantees that multi-column Japanese vertical dialogue is read Right-to-Left (TBRL).
///   E.g., Panel 2 Teacher bubble must read `お前ら\n秋田を\n見習え～` (not reversed `見習え～秋田をお前ら`).
/// - **Zero Duplicate Overlapping Bubble Regions**:
///   Prevents duplicate sub-box emissions on vertical bubbles (`末は博士か大臣か`).
/// - **Negative Furigana Echo Guard**:
///   Prevents ruby text (Furigana) from producing duplicate line echoes.
#[test]
fn test_regression_page_lucky_me_first_place_vertical() {
    let img_path = Path::new("tests/fixtures/ja/page_lucky_me_first_place_vertical.webp");
    if !img_path.exists() {
        eprintln!("Fixture {:?} not found, skipping test", img_path);
        return;
    }

    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_lucky_me_first_place_vertical.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 1129x1600 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. Strict 10-region accounting (Rule #12)
    assert_eq!(res.regions.len(), 10, "Must detect exactly 10 speech bubbles across the page");

    // 1. Top-Right Bubble: 'また１位！？'
    let top_right = res.regions.iter().find(|r| r.text.contains("また") && (r.text.contains("1位") || r.text.contains("１位")));
    assert!(top_right.is_some(), "Must detect top-right bubble 'また１位！？'");

    // 2. Top-Center Bubble: '入学以来 ずっと じゃない！' (TBRL Right-to-Left order)
    let entrance_bubble = res.regions.iter().find(|r| r.text.contains("入学以来"));
    assert!(entrance_bubble.is_some(), "Must detect top-center bubble '入学以来 ずっと じゃない！'");
    let eb_text = &entrance_bubble.unwrap().text;
    assert!(eb_text.contains("入学以来") && eb_text.contains("ずっと") && eb_text.contains("じゃない"), "Bubble must contain all 3 columns: {}", eb_text);

    // 3. Top-Center Small Circle: 'スゴすぎー'
    let sugoi_bubble = res.regions.iter().find(|r| r.text.contains("ス") && r.text.contains("ぎ"));
    assert!(sugoi_bubble.is_some(), "Must detect small circular bubble 'スゴすぎー'");

    // 4. Top-Left Bubble: 'いやあ… ラッキーだよ' (Right-to-Left column order)
    let lucky_bubble = res.regions.iter().find(|r| r.text.contains("ラッキー") || r.text.contains("ラッキ"));
    assert!(lucky_bubble.is_some(), "Must detect top-left bubble 'いやあ… ラッキーだよ'");

    // 5. Mid-Right Teacher Bubble: 'お前ら 秋田を 見習え～' (TBRL Right-to-Left order)
    let teacher_bubble = res.regions.iter().find(|r| r.text.contains("秋田") || r.text.contains("お前ら"));
    assert!(teacher_bubble.is_some(), "Must detect teacher bubble 'お前ら 秋田を 見習え～'");
    let t_text = &teacher_bubble.unwrap().text;
    assert!(!t_text.starts_with("見習え"), "Japanese vertical columns must read Right-to-Left ('お前ら...' first), got: {}", t_text);

    // 6. Mid-Center Teacher Continuation: 'そして アタシの評価を あげろ～'
    let eval_bubble = res.regions.iter().find(|r| r.text.contains("アタシの評価を") || r.text.contains("あげろ"));
    assert!(eval_bubble.is_some(), "Must detect teacher evaluation bubble");
    assert!(!eval_bubble.unwrap().text.contains("フクシ０語"), "Must not contain hallucinated prefix");

    // 7. Mid-Left Small Bubble: 'ハハ…'
    let haha_bubble = res.regions.iter().find(|r| r.text.contains("ハハ"));
    assert!(haha_bubble.is_some(), "Must detect 'ハハ…' bubble");

    // 8. Bottom-Left MC Hair: 'ありがとう みんな'
    let thanks_bubble = res.regions.iter().find(|r| r.text.contains("ありがとう") && r.text.contains("みんな"));
    assert!(thanks_bubble.is_some(), "Must detect bottom-left MC speech 'ありがとう みんな'");

    // 9. Bottom-Right Girl Bubble: '謙遜してるのも かっこい～'
    let modest_bubble = res.regions.iter().find(|r| r.text.contains("謙遜してるのも") || r.text.contains("かっこい"));
    assert!(modest_bubble.is_some(), "Must detect modest girl bubble");
    assert!(!modest_bubble.unwrap().text.contains("e t致"), "Must strip ruby slivers");

    // 10. Bottom-Center Boy Bubble: '末は 博士か 大臣か'
    let proverb_bubble = res.regions.iter().find(|r| r.text.contains("博士か") || r.text.contains("大臣か") || r.text.contains("末は"));
    assert!(proverb_bubble.is_some(), "Must detect proverb bubble '末は 博士か 大臣か'");
    let p_text = &proverb_bubble.unwrap().text;
    assert!(p_text.contains("末は") && (p_text.contains("博士か") || p_text.contains("大臣か")), "Proverb must contain vertical columns: {}", p_text);
}
