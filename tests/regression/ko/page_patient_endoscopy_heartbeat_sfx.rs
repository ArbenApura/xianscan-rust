// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_patient_endoscopy_heartbeat_sfx` (RESOLUTION: 690 × 1789)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TOP SPEECH BUBBLE**: `"자, 이게\n오늘 검사한\n부분인데요."` (Doctor explaining endoscopy screen)
/// - **MIDDLE SPEECH BUBBLE**: `"아, 네!"` (Patient response bubble)
/// - **BOTTOM SLANTED ONOMATOPOEIA / SFX**: `"두근두근"` (Heartbeat / throbbing SFX, slanted at approx -19.3°, classified as SoundEffect)
#[test]
fn test_regression_page_patient_endoscopy_heartbeat_sfx() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_patient_endoscopy_heartbeat_sfx/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_patient_endoscopy_heartbeat_sfx: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Endoscopy Patient Heartbeat SFX Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 2 REGIONS (2 DIALOGUEBUBBLES, 0 FREETEXT)
    crate::assert_element_counts!(res, 2, 2, 0);

    // 2. NEGATIVE GUARD: NO BOTTOM SLANTED SFX '두근두근' EXTRACTED AS FREETEXT
    assert!(!res.regions.iter().any(|r| r.text.contains("두근")), "Must NOT extract heartbeat SFX '두근두근'");

    // 3. TOP SPEECH BUBBLE: [X: ~28, Y: ~397, W: ~236, H: ~146]
    let top_bubble = res.regions.iter().find(|r| r.text.contains("검사한") || r.text.contains("부분"));
    assert!(top_bubble.is_some(), "Must detect top dialogue bubble about endoscopy exam");
    let top_bubble = top_bubble.unwrap();
    assert_eq!(top_bubble.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(top_bubble, RegionKind::DialogueBubble, 28, 397, 236, 146, 15);
    crate::assert_bubble_bounds!(top_bubble, 10, 369, 273, 271, 20);

    // 4. MIDDLE SPEECH BUBBLE: '아, 네!' -> [X: ~298, Y: ~953, W: ~152, H: ~100]
    let mid_bubble = res.regions.iter().find(|r| r.text.contains("아, 네") || r.text.contains("아,네"));
    assert!(mid_bubble.is_some(), "Must detect middle dialogue bubble '아, 네!'");
    let mid_bubble = mid_bubble.unwrap();
    assert_eq!(mid_bubble.kind, RegionKind::DialogueBubble);
    crate::assert_region_bounds!(mid_bubble, RegionKind::DialogueBubble, 298, 953, 152, 100, 15);
    crate::assert_bubble_bounds!(mid_bubble, 288, 943, 173, 134, 20);
}
