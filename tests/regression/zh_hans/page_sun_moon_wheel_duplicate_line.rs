// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # CHINESE REAL-PAGE REGRESSION: page_sun_moon_wheel_duplicate_line (RESOLUTION 827 x 1652)
///
/// ## PURPOSE AND BEHAVIOR TESTED
/// - **PANEL 1 TOP BUBBLE**: 不要说你这个半吊子\n还没晋升的神境，\n便是真正的神境在这里，\n我又何惧？
/// - **PANEL 2 MIDDLE BUBBLE**: 今天，就让我杀个神境，\n给天下人看看。
/// - **PANEL 3 BOTTOM SPIKY BUBBLE DEDUPLICATION**: Spiky bubble contains 3 lines:
///   真武三十六式\n，第十五式\n日月轮！
///   Must eliminate the phantom duplicate 4th line (日月轮!).
/// - **STRICT ELEMENT COUNTS**: Exactly 3 regions (3 DialogueBubble, 0 SoundEffect, 0 FreeText).
#[test]
fn test_regression_page_sun_moon_wheel_duplicate_line() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_sun_moon_wheel_duplicate_line/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_sun_moon_wheel_duplicate_line: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Sun Moon Wheel Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 3 REGIONS (3 DIALOGUE BUBBLES, 0 SFX, 0 FREE TEXT)
    crate::assert_element_counts!(res, 3, 3, 0, 0);

    // 2. PANEL 1 TOP BUBBLE: "不要说你这个半吊子..."
    let r0 = res.regions.iter().find(|r| r.text.contains("半吊子")).expect("Top bubble must exist");
    assert!(
        r0.text.contains("还没晋升") && r0.text.contains("我又何惧"),
        "Top bubble must contain full speech"
    );
    crate::assert_region_bounds!(r0, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 167, 54, 214, 144, 15);
    crate::assert_bubble_bounds!(r0, 136, 22, 277, 210, 15);

    // 3. PANEL 2 MIDDLE BUBBLE: "今天，就让我杀个神境..."
    let r1 = res.regions.iter().find(|r| r.text.contains("杀个神境")).expect("Middle bubble must exist");
    assert!(
        r1.text.contains("今天") && r1.text.contains("天下人看看"),
        "Middle bubble must contain full speech"
    );
    crate::assert_region_bounds!(r1, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 129, 565, 211, 78, 15);
    crate::assert_bubble_bounds!(r1, 96, 523, 267, 163, 15);

    // 4. PANEL 3 BOTTOM SPIKY BUBBLE: MUST NOT CONTAIN DUPLICATE "日月轮"
    let spiky = res.regions.iter().find(|r| r.text.contains("真武三十六式") || r.text.contains("日月轮")).expect("Bottom spiky bubble must exist");
    let matches_count = spiky.text.matches("日月轮").count();
    assert_eq!(
        matches_count, 1,
        "Bottom spiky bubble must contain '日月轮' exactly once, but found {} times in: '{}'",
        matches_count, spiky.text
    );
    crate::assert_region_bounds!(spiky, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 101, 909, 168, 108, 15);
    crate::assert_bubble_bounds!(spiky, 50, 893, 232, 231, 15);
}

