// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_blood_god_avatar_enough_talk_kill_him` (RESOLUTION: 900 × 1634)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 2 SPEECH BUBBLE WITH LONG UPWARD TAIL**: `[632, 429, 185, 246]` (`"别废话，杀了他！"`).
///   Bubble has a long upward pointer tail extending up to y=429 (length ~85px).
///   The carrier chamber must sever the upward tail, anchoring the typeset container inside the main cavity
///   so translated text does not spill into the narrow upward tail.
#[test]
fn test_regression_page_blood_god_avatar_enough_talk_kill_him() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_blood_god_avatar_enough_talk_kill_him/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_blood_god_avatar_enough_talk_kill_him, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));

    println!("Detected {} regions on page_blood_god_avatar_enough_talk_kill_him:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, box={:?}, bubble={:?}, carrier={:?}, typeset={:?}, text='{}'",
            i, r.kind, r.box_, r.bubble_box, r.carrier_box, r.typeset_box, r.text.replace('\n', " ")
        );
    }

    assert_eq!(res.regions.len(), 6, "Expected exactly 6 regions on page_blood_god_avatar_enough_talk_kill_him");

    // REGION 2: PANEL 2 SPEECH BUBBLE WITH LONG UPWARD TAIL ("别废话，杀了他！")
    let r2 = &res.regions[2];
    assert!(r2.text.contains("别废话") || r2.text.contains("杀了他"), "Region 2 text must match '别废话，杀了他！'");
    assert!(r2.bubble_box.is_some(), "Region 2 must have a detected bubble box");
    let b2 = r2.bubble_box.as_ref().unwrap();
    assert!(b2.y <= 435, "Full bubble envelope must include the upward tail starting around y=429");

    // CARRIER MUST CLEANLY SEVER THE UPWARD POINTER TAIL
    assert!(
        r2.carrier_box.is_some(),
        "Region 2 must resolve a valid tail-cut carrier box to exclude the upward tail"
    );
    let carrier2 = r2.carrier_box.as_ref().unwrap();
    assert!(
        carrier2.y >= 485,
        "Carrier box y ({}) must sever the upward tail (y=429..485)",
        carrier2.y
    );
    assert!(
        carrier2.y - b2.y >= 50,
        "Carrier box must trim at least 50px from the upward tail (trimmed {}px)",
        carrier2.y - b2.y
    );

    // TYPESET BOX MUST CENTER WITHIN THE SEVERED CHAMBER, CLEAR OF THE UPWARD TAIL
    assert!(r2.typeset_box.is_some(), "Region 2 must have a typeset box");
    let tb2 = r2.typeset_box.as_ref().unwrap();
    assert!(
        tb2.y >= 515,
        "Typeset box y ({}) must sit cleanly below y=515 inside the main chamber",
        tb2.y
    );
}
