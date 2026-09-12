// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_atmosphere_getting_bad_king` (RESOLUTION: 836 × 1218 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **MISSED FREE-TEXT EXTRACTION (`うん`)**:
///   PANEL 2 RIGHT SIDE HAS SHORT VERTICAL TEXT `うん` ("YEAH"). DETECTION MUST NOT MISS IT.
/// - **MISSED DIAMOND BUBBLE RECOVERY (`んん？`)**:
///   PANEL 3 RIGHT SIDE HAS A DIAMOND-SHAPED SPEECH BALLOON `んん？` ("HMM?"). DETECTION MUST NOT MISS IT.
/// - **MULTI-LOBE SPEECH BUBBLE (`はい` / `我が王よ`)**:
///   PANEL 3 LEFT SIDE HAS A CONNECTED FIGURE-8 BUBBLE COVERING `はい` AND `我が王よ`.
#[test]
fn test_regression_page_atmosphere_getting_bad_king() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_atmosphere_getting_bad_king.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_atmosphere_getting_bad_king: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 836x1218 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, box={:?}, bubble_box={:?}, text='{}', conf={:.2}, vert={}",
            i, r.kind, r.box_, r.bubble_box, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. MUST DETECT AT LEAST 6-7 REGIONS (PREVIOUSLY ONLY 5 DUE TO MISSED 'うん' AND 'んん？')
    assert!(res.regions.len() >= 6, "Must detect at least 6 regions on page, found {}", res.regions.len());

    // 1. PANEL 2 LEFT MONOLOGUE: 'なんだかすごく 良くない 雰囲気だ！'
    let bad_atm = res.regions.iter().find(|r| r.text.contains("雰囲気") || r.text.contains("良くない"));
    assert!(bad_atm.is_some(), "Must detect panel 2 'なんだかすごく良くない雰囲気だ！' monologue");

    // 2. PANEL 2 RIGHT TEXT: 'うん'
    let un_text = res.regions.iter().find(|r| r.text.trim() == "うん" && r.box_.y < 600);
    assert!(un_text.is_some(), "Must detect panel 2 right text 'うん'");

    // 3. PANEL 3 RIGHT BUBBLE: 'このまま任せる わけには いかないな'
    let leave_bubble = res.regions.iter().find(|r| r.text.contains("このまま") || r.text.contains("いかないな"));
    assert!(leave_bubble.is_some(), "Must detect panel 3 right dialogue bubble");

    // 4. PANEL 3 RIGHT DIAMOND BUBBLE: 'んん？'
    let hmm_diamond = res.regions.iter().find(|r| (r.text.contains("ん") || r.text.contains("?")) && r.box_.y >= 550 && r.box_.y <= 750 && r.box_.x >= 550 && r.box_.x <= 700);
    assert!(hmm_diamond.is_some(), "Must detect panel 3 diamond bubble 'んん？'");

    // 5. PANEL 3 LEFT BUBBLE: 'はい' & '我が王よ'
    assert!(res.regions.iter().any(|r| r.text.contains("はい")), "Must detect 'はい'");
    assert!(res.regions.iter().any(|r| r.text.contains("我が王よ")), "Must detect '我が王よ'");

    // 6. PANEL 4 BOTTOM BUBBLE: 'アトウ…'
    let atou_bubble = res.regions.iter().find(|r| r.text.contains("アトウ"));
    assert!(atou_bubble.is_some(), "Must detect bottom panel 'アトウ…' bubble");
}
