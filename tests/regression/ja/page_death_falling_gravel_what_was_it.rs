// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_death_falling_gravel_what_was_it` (RESOLUTION: 836 × 1227 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **MISSED DIALOGUE BUBBLE DETECTION (`何だっけ`)**:
///   IN THE LOWER NARROW PANEL (SECOND FROM RIGHT), AN UPPER OVAL SPEECH BUBBLE CONTAINS `何だっけ`.
///   DETECTION MUST NOT MISS THIS BUBBLE ENTIRELY.
/// - **SHORT ONOMATOPOEIC DIALOGUE OCR FIDELITY (`ざり？`)**:
///   IN THE LOWER RIGHTMOST PANEL, THE UPPER BUBBLE CONTAINS `ざり？` (SOUND OF TOUCHING GRAVEL).
///   OCR MUST NOT PRODUCE GARBLED PSEUDO-LATIN TEXT LIKE `v心nt`.
/// - **EXHAUSTIVE REGION ACCOUNTING (AT LEAST 10 REGIONS)**:
///   VERIFIES ALL NARRATION BOXES AND SENSORY DIALOGUE BUBBLES ACROSS THE DEATH/TRANSITION SEQUENCE.
#[test]
fn test_regression_page_death_falling_gravel_what_was_it() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_death_falling_gravel_what_was_it.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_death_falling_gravel_what_was_it: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 836x1227 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, box={:?}, bubble_box={:?}, text='{}', conf={:.2}, vert={}",
            i, r.kind, r.box_, r.bubble_box, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. MUST DETECT AT LEAST 10 REGIONS (PREVIOUSLY 9 DUE TO MISSED '何だっけ')
    assert!(res.regions.len() >= 10, "Must detect at least 10 regions on page, found {}", res.regions.len());

    // 1. PANEL 1 TOP-RIGHT NARRATION BOX: '闘病生活の末 十八歳での死は残念ではあったけど'
    let illness_box = res.regions.iter().find(|r| r.text.contains("闘病生活") || r.text.contains("十八歳"));
    assert!(illness_box.is_some(), "Must detect panel 1 top-right illness narration box");

    // 2. PANEL 1 TOP-LEFT NARRATION BOX: '不思議と穏やかに受け入れられた'
    let accept_box = res.regions.iter().find(|r| r.text.contains("不思議と") || r.text.contains("穏やかに"));
    assert!(accept_box.is_some(), "Must detect panel 1 top-left peace acceptance box");

    // 3. PANEL 2 NARRATION BOX: '意識と五感が闇に落ちる'
    let sense_box = res.regions.iter().find(|r| r.text.contains("五感") || r.text.contains("闇に落ちる"));
    assert!(sense_box.is_some(), "Must detect panel 2 sense darkness box");

    // 4. PANEL 2 CENTER NARRATION BOX: 'ああ これが死―'
    let death_box = res.regions.iter().find(|r| r.text.contains("これが死") || r.text.contains("ああ"));
    assert!(death_box.is_some(), "Must detect panel 2 'ああ これが死' box");

    // 5. BOTTOM ROW PANEL 2 (FROM RIGHT): '何だっけ' BUBBLE
    // THIS BUBBLE WAS PREVIOUSLY MISSED ENTIRELY
    let what_was_it = res.regions.iter().find(|r| r.text.contains("何だっけ") || (r.box_.x >= 350 && r.box_.x <= 500 && r.box_.y >= 750 && r.box_.y <= 900));
    assert!(what_was_it.is_some(), "Must detect bottom row '何だっけ' speech bubble");
    let what_was_it = what_was_it.unwrap();
    assert!(what_was_it.text.contains("何だ") || what_was_it.text.contains("何"), "Text should contain '何だっけ', text='{}'", what_was_it.text);

    // 6. BOTTOM ROW RIGHTMOST UPPER BUBBLE: 'ざり？'
    // MUST NOT HALLUCINATE 'v心nt'
    let zari_bubble = res.regions.iter().find(|r| r.box_.x >= 650 && r.box_.y >= 800 && r.box_.y <= 930);
    assert!(zari_bubble.is_some(), "Must detect bottom rightmost upper bubble 'ざり？'");
    let zari_bubble = zari_bubble.unwrap();
    assert!(!zari_bubble.text.contains("v心nt") && !zari_bubble.text.contains("v心"), "Must not misrecognize 'ざり？' as 'v心nt', text='{}'", zari_bubble.text);

    // 7. BOTTOM ROW SENSORY BUBBLES: '草のにおい', '何か指に', '石？', '明るくなって'
    assert!(res.regions.iter().any(|r| r.text.contains("草のにおい")), "Must detect '草のにおい' bubble");
    assert!(res.regions.iter().any(|r| r.text.contains("指に")), "Must detect '何か指に' bubble");
    assert!(res.regions.iter().any(|r| r.text.contains("石")), "Must detect '石？' bubble");
    assert!(res.regions.iter().any(|r| r.text.contains("明るく")), "Must detect '明るくなって' bubble");
}
