// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_god_slaying_spear_radiating_spikes` (RESOLUTION: 827 x 1490)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 SPEECH BUBBLE**: `"仅依靠五行神雷终究不是事，提升自己的修为才是根本。"` (DialogueBubble)
/// - **PANEL 2 SPEECH BUBBLE**: `"我若有先天之境，直接御气万里，这世界所有国家加起来也不是我对手"` (DialogueBubble)
/// - **PANEL 3 SPEECH BUBBLE**: `"这次回家过年后，我就遨游地球，积攒资源，一举冲入先天。"` (DialogueBubble)
/// - **PANEL 4 RADIATING SPIKES BUBBLE**: `"这个弑神之矛看起来不像法宝神器，不知道能不能操控？"` (DialogueBubble, radiating spikes, no left tail cut)
/// - **EXACT COUNTS**: Exactly 4 dialogue bubble regions.
#[test]
fn test_regression_page_god_slaying_spear_radiating_spikes() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_god_slaying_spear_radiating_spikes.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_god_slaying_spear_radiating_spikes: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans God-Slaying Spear Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, bubble={:?}, carrier={:?}, typeset={:?}, text='{}'",
            i, r.kind, r.angle, r.box_, r.bubble_box, r.carrier_box, r.typeset_box, r.text);
    }

    // 1. EXACT ELEMENT COUNTS
    crate::assert_element_counts!(res, 4, 4, 0);

    // 2. PANEL 4 BUBBLE: "这个弑神之矛看起来不像法宝神器，不知道能不能操控？"
    let spear_bubble = res.regions.iter().find(|r| r.text.contains("弑神") && r.text.contains("之矛"));
    assert!(spear_bubble.is_some(), "Must detect '这个弑神之矛看起来不像法宝神器' bubble");
    let spear_bubble = spear_bubble.unwrap();
    assert_eq!(spear_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    let bb = spear_bubble.bubble_box.as_ref().expect("Bubble box must exist");
    assert!(bb.w >= 180, "Bubble box width must span radiating spikes, got {}", bb.w);

    // MUST NOT PUBLISH A FALSE LEFT-SIDE TAIL-CUT CARRIER BOX
    assert_eq!(spear_bubble.carrier_box, None, "Radiating spikes bubble must not have left side cut off as a false tail");

    // 3. INPAINTING & SHRINKWRAP CLEANING: GENERATE inpainted.webp AND cleaned.webp
    let cleaned = crate::common::clean_fixture_with_cache(&img, &res);
    assert!(cleaned.is_some(), "Inpainting and cavity cleaning must produce cleaned result");
}
