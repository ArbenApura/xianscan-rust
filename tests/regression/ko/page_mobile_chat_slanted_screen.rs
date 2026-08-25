// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_mobile_chat_slanted_screen` (RESOLUTION: 690 × 1720)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **SLANTED SMARTPHONE UI DECOMPOSITION**:
///   - Top navigation header: `"현성민"` (chevron `'<'` cleanly stripped).
///   - Date capsule: `"20XX년 X월 X일 토요일"`.
///   - Sender name above avatar: `"현성민"`.
///   - Chat message bubble body: `"민수야\n혹시 나 잘못되면\n컴퓨터 책상 위에 있는\n외장하드 꼭 부숴서\n버려줘라\np.s 절대 보지는 말고."` (unified multi-line dialogue body with intra-paragraph blank line before p.s).
///   - External message timestamp: `"오후08:07"`.
/// - **ROTATED FRAME $(u, v)$ GUTTER SEPARATION**:
///   - Sender name (`"현성민"`) must NOT be merged with the chat balloon body.
///   - External timestamp (`"오후08:07"`) must NOT be merged with the chat balloon body.
/// - **EXACT COUNTS**: Exactly 5 free-text regions (0 bubbles, 0 SFX, 5 free text).
#[test]
fn test_regression_page_mobile_chat_slanted_screen() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_mobile_chat_slanted_screen/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_mobile_chat_slanted_screen: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Mobile Chat Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 5 REGIONS (0 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 5 FREETEXT)
    crate::assert_element_counts!(res, 5, 0, 0, 5);

    // 2. TOP NAVIGATION HEADER: [X: 180, Y: 308, W: 176, H: 104] (ANGLE ~17.8°)
    let nav_header = res
        .regions
        .iter()
        .find(|r| r.box_.y <= 400 && r.text.trim() == "현성민");
    assert!(nav_header.is_some(), "Must detect top nav header '현성민'");
    let nav_header = nav_header.unwrap();
    crate::assert_region_bounds!(nav_header, RegionKind::FreeText, 180, 308, 176, 104, 8);
    crate::assert_region_angle!(nav_header, 17.78, 2.5);

    // 3. DATE CAPSULE PILL: [X: 400, Y: 486, W: 283, H: 124] (ANGLE ~18.2°)
    let date_pill = res
        .regions
        .iter()
        .find(|r| r.text.contains("20XX년") && r.text.contains("토요일"));
    assert!(date_pill.is_some(), "Must detect date capsule '20XX년 X월 X일 토요일'");
    let date_pill = date_pill.unwrap();
    crate::assert_region_bounds!(date_pill, RegionKind::FreeText, 400, 486, 283, 124, 8);
    crate::assert_region_angle!(date_pill, 18.15, 2.5);

    // 4. SENDER NAME ABOVE BUBBLE: [X: 200, Y: 548, W: 108, H: 76] (ANGLE ~19.3°)
    let sender_name = res
        .regions
        .iter()
        .find(|r| r.box_.y >= 500 && r.box_.y <= 600 && r.text.trim() == "현성민");
    assert!(sender_name.is_some(), "Must detect sender label '현성민'");
    let sender_name = sender_name.unwrap();
    crate::assert_region_bounds!(sender_name, RegionKind::FreeText, 200, 548, 108, 76, 8);
    crate::assert_region_angle!(sender_name, 19.26, 2.5);

    // 5. CHAT MESSAGE BALLOON BODY: [X: 104, Y: 631, W: 426, H: 413] (ANGLE ~18.2°)
    let chat_body = res
        .regions
        .iter()
        .find(|r| r.text.contains("민수야") && r.text.contains("외장하드") && r.text.contains("절대 보지는 말고"));
    assert!(chat_body.is_some(), "Must detect chat message balloon body");
    let chat_body = chat_body.unwrap();
    crate::assert_region_bounds!(chat_body, RegionKind::FreeText, 104, 631, 426, 413, 8);
    crate::assert_region_angle!(chat_body, 18.24, 2.5);

    // 6. EXTERNAL MESSAGE TIMESTAMP: [X: 449, Y: 1041, W: 112, H: 66] (ANGLE ~20.0°)
    let timestamp = res
        .regions
        .iter()
        .find(|r| r.text.contains("오후") && r.text.contains("08:07"));
    assert!(timestamp.is_some(), "Must detect message timestamp '오후08:07'");
    let timestamp = timestamp.unwrap();
    crate::assert_region_bounds!(timestamp, RegionKind::FreeText, 449, 1041, 112, 66, 8);
    crate::assert_region_angle!(timestamp, 20.03, 2.5);

    // 7. NEGATIVE ASSERTIONS AGAINST CONFLATION
    assert!(
        !chat_body.text.contains("오후"),
        "Timestamp must not be conflated into chat body text"
    );
    assert!(
        !chat_body.text.starts_with("현성민"),
        "Sender name must not be prepended to chat body text"
    );
    assert!(
        !nav_header.text.contains('<'),
        "Navigation chevron must be cleaned from header"
    );
}
