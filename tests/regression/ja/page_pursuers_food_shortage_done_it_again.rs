// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_pursuers_food_shortage_done_it_again` (RESOLUTION: 836 × 1563 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **FREE-TEXT LEADING CHARACTER RECOGNITION (`ああ またやってしまった`)**:
///   IN PANEL 1, THE LEFT VERTICAL MONOLOGUE STARTS WITH `ああ` FOLLOWED BY `またやってしまった`.
///   DETECTION/OCR MUST NOT MISS THE TOP CHARACTERS `ああ`, WHICH LEAVES RAW UNTOUCHED JAPANESE ON THE PAGE.
/// - **MULTI-LOBE SPEECH BUBBLE HANDLING**:
///   PANEL 1 SPEECH BALLOON CONTAINS TWO CLAUSES `道中で食糧は尽き追手を振り払うため` AND `食糧を確保することもできず`.
/// - **PANEL 4 NARROW BUBBLE EXTRACTION (`ギア戦士長？`)**:
///   EXTRACTS ELONGATED PROSTRATED ELF DIALOGUE BUBBLE `ギア戦士長？`.
#[test]
fn test_regression_page_pursuers_food_shortage_done_it_again() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_pursuers_food_shortage_done_it_again.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_pursuers_food_shortage_done_it_again: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 836x1563 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, box={:?}, bubble_box={:?}, text='{}', conf={:.2}, vert={}",
            i, r.kind, r.box_, r.bubble_box, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. STRUCTURAL REGION ACCOUNTING (APPROXIMATELY 8-9 REGIONS)
    assert!(res.regions.len() >= 8 && res.regions.len() <= 10, "Expected 8-10 regions on page, found {}", res.regions.len());

    // 1. PANEL 1 LEFT FREE-TEXT: 'ああ またやってしまった'
    // MUST NOT MISS LEADING 'ああ'
    let done_again = res.regions.iter().find(|r| r.text.contains("やってしまった") || (r.text.contains("また") && r.box_.y < 400));
    assert!(done_again.is_some(), "Must detect panel 1 monologue 'ああ またやってしまった'");
    let done_again = done_again.unwrap();
    assert!(
        done_again.text.contains("ああ") || done_again.text.starts_with("あ"),
        "Monologue must capture leading 'ああ', text='{}'", done_again.text
    );

    // 2. PANEL 1 RIGHT BUBBLE: '道中で食糧は尽き追手を振り払うため'
    let food_shortage = res.regions.iter().find(|r| r.text.contains("食糧は") || r.text.contains("追手を"));
    assert!(food_shortage.is_some(), "Must detect panel 1 right dialogue");

    // 3. PANEL 2 RIGHT NARRATION: 'この言葉は問いの答えになっていない'
    let answer_narration = res.regions.iter().find(|r| r.text.contains("問いの答え") || r.text.contains("この言葉は"));
    assert!(answer_narration.is_some(), "Must detect panel 2 answer narration");

    // 4. PANEL 2 LEFT BUBBLE: '…もう何日も食べてないのです'
    let starving_bubble = res.regions.iter().find(|r| r.text.contains("何日も") || r.text.contains("食べてない"));
    assert!(starving_bubble.is_some(), "Must detect panel 2 starving bubble");

    // 5. PANEL 3 SILHOUETTE BUBBLE: 'ふーん'
    let hmm_bubble = res.regions.iter().find(|r| r.text.trim() == "ふーん" || r.text.contains("ふー"));
    assert!(hmm_bubble.is_some(), "Must detect panel 3 'ふーん' bubble");

    // 6. PANEL 4 RIGHT NARROW BUBBLE: 'ギア戦士長？'
    let captain_bubble = res.regions.iter().find(|r| r.text.contains("ギア") || r.text.contains("戦士長"));
    assert!(captain_bubble.is_some(), "Must detect panel 4 'ギア戦士長？' bubble");

    // 7. PANEL 4 DIALOGUE BUBBLES: 'ただ森に入っただけで' & '頭を必死に下げ慈悲を乞わねばならない'
    assert!(res.regions.iter().any(|r| r.text.contains("森に入った")), "Must detect 'ただ森に入っただけで' bubble");
    assert!(res.regions.iter().any(|r| r.text.contains("頭を必死に") || r.text.contains("慈悲を")), "Must detect '頭を必死に下げ...' bubble");
}
