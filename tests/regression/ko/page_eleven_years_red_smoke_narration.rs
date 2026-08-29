// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_eleven_years_red_smoke_narration` (RESOLUTION: 690 × 2295)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL TOP RED EMPHASIS NARRATION TEXT**:
///   `"무려 11년이란 시간을\n바칠 정도로!"` (Floating red text on red smoke ribbon)
/// - **MIDDLE DIALOGUE BUBBLE**:
///   `"마지막 층까지\n클리어해버릴\n줄이야."`
/// - **BOTTOM DIALOGUE BUBBLE**:
///   `"방송이라도\n킬 걸 그랬나."` (Non-duplicated, clean reading order)
#[test]
fn test_regression_page_eleven_years_red_smoke_narration() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_eleven_years_red_smoke_narration/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_eleven_years_red_smoke_narration: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean 11 Years Red Smoke Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 3 REGIONS (2 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 1 FREETEXT)
    crate::assert_element_counts!(res, 3, 2, 0, 1);

    // 2. TOP RED EMPHASIS NARRATION: [X: 87, Y: 194, W: 519, H: 142]
    let top_red = res
        .regions
        .iter()
        .find(|r| r.text.contains("11년") || r.text.contains("시간을") || r.text.contains("바칠정도"));
    assert!(
        top_red.is_some(),
        "Must detect top red emphasis narration '무려 11년이란 시간을...'"
    );
    let top_red = top_red.unwrap();
    crate::assert_region_bounds!(
        top_red,
        xianscan_rust::ml::schemas::RegionKind::FreeText,
        87,
        194,
        519,
        142,
        15
    );
    crate::assert_region_angle!(top_red, 0.0, 1.5);

    // 3. MIDDLE DIALOGUE BUBBLE: [X: 348, Y: 978, W: 210, H: 156]
    let mid_bubble = res
        .regions
        .iter()
        .find(|r| r.text.contains("마지막층") || r.text.contains("클리어"));
    assert!(mid_bubble.is_some(), "Must detect middle dialogue bubble");
    let mid_bubble = mid_bubble.unwrap();
    crate::assert_region_bounds!(
        mid_bubble,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        348,
        978,
        210,
        156,
        15
    );
    crate::assert_bubble_bounds!(mid_bubble, 295, 930, 318, 307, 15);
    crate::assert_region_angle!(mid_bubble, 0.0, 1.5);

    // 4. BOTTOM DIALOGUE BUBBLE: [X: 352, Y: 2027, W: 192, H: 114]
    let bot_bubble = res
        .regions
        .iter()
        .find(|r| r.text.contains("방송이라도") || r.text.contains("킬걸"));
    assert!(bot_bubble.is_some(), "Must detect bottom dialogue bubble");
    let bot_bubble = bot_bubble.unwrap();
    let occurrences = bot_bubble.text.matches("킬").count();
    assert_eq!(
        occurrences, 1,
        "Bottom bubble must not duplicate '킬 걸 그랬나', got: {:?}",
        bot_bubble.text
    );
    crate::assert_region_bounds!(
        bot_bubble,
        xianscan_rust::ml::schemas::RegionKind::DialogueBubble,
        352,
        2027,
        192,
        114,
        15
    );
    crate::assert_bubble_bounds!(bot_bubble, 309, 1967, 282, 223, 15);
    crate::assert_region_angle!(bot_bubble, 0.0, 1.5);
}
