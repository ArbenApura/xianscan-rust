// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_patient_greeting_doctor_exclamation` (RESOLUTION: 690 × 1751)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP SPEECH BUBBLE UNIFICATION**:
///   `"자~"` (line 1) and `"안녕하십니까."` (line 2) belong to the same speech bubble container
///   and must be unified into a single 2-line dialogue region: `"자~\n안녕하십니까."`.
/// - **STANDALONE SYMBOL / REACTION BUBBLE SUPPRESSION**:
///   Isolated non-word reaction symbols (`"!"`, hallucinated as `"i"`) must not be extracted.
/// - **EXACT COUNTS**: Exactly 1 dialogue bubble (1 bubble, 0 SFX, 0 free text).
#[test]
fn test_regression_page_patient_greeting_doctor_exclamation() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_patient_greeting_doctor_exclamation/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_patient_greeting_doctor_exclamation: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Doctor Greeting Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 1 REGION (1 DIALOGUEBUBBLE, 0 SOUNDEFFECT, 0 FREETEXT)
    crate::assert_element_counts!(res, 1, 1, 0, 0);

    // 2. UNIFIED TOP SPEECH BUBBLE (DOCTOR): [X: 371, Y: 340, W: 244, H: 148]
    let doctor_bubble = &res.regions[0];
    assert_eq!(
        doctor_bubble.kind,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        "Must be classified as DialogueBubble"
    );
    assert!(
        doctor_bubble.text.contains("자") && doctor_bubble.text.contains("안녕하십니까"),
        "Must unify both lines into '자~\\n안녕하십니까.', got: '{}'",
        doctor_bubble.text
    );
    crate::assert_region_bounds!(
        doctor_bubble,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        371,
        340,
        244,
        148,
        15
    );
    crate::assert_bubble_bounds!(doctor_bubble, 355, 324, 279, 208, 15);
    crate::assert_region_angle!(doctor_bubble, 0.0, 1.5);

    // 3. EXPLICIT NEGATIVE GUARD: STANDALONE SYMBOL / REACTION BUBBLE SUPPRESSION
    assert!(
        !res.regions.iter().any(|r| {
            let t = r.text.trim();
            t == "i" || t == "!" || t == "l" || t == "1" || t == "|"
        }),
        "Isolated exclamation reaction symbol must be suppressed"
    );
}
