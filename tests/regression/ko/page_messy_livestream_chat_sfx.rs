// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # KOREAN REAL-PAGE REGRESSION: `page_messy_livestream_chat_sfx` (RESOLUTION: 362 × 1024)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL TOP LIVE STREAM CHAT**:
///   `"키보드 1시간 압수"` (Primary detected chat line from top banner)
/// - **BOTTOM VIEWER COUNT TICK PROGRESSION (4 DISTINCT ROWS)**:
///   - Tick 1: `"[현재 접속중시청자,371별]"`
///   - Tick 2: `"[현재 접속중시청자: 4,762법]"`
///   - Tick 3: `"[현재 접속 중 시청자: 6,388법]"`
///   - Tick 4: `"[현재 접속 중 시청자:7,588명]"`
/// - **CLEAN PARTITIONING**: Ticks must never be lumped into a giant multi-line blob or produce duplicate sub-boxes.
#[test]
fn test_regression_page_messy_livestream_chat_sfx() {
    let img = match crate::common::load_fixture_or_skip("ko", "page_messy_livestream_chat_sfx/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_messy_livestream_chat_sfx: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ko"));
    println!("Korean Messy Livestream Chat Page detected {} regions:", res.regions.len());
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

    // 1. TOP CHAT: Must contain detected line "키보드 1시간 압수"
    let top_chat = res
        .regions
        .iter()
        .find(|r| r.text.contains("키보드") && r.box_.y <= 120);
    assert!(top_chat.is_some(), "Must detect top livestream chat line");
    let top_chat = top_chat.unwrap();
    assert!(
        top_chat.text.contains("키보드") && (top_chat.text.contains("압수") || top_chat.text.contains("1시간")),
        "Top chat must contain '키보드 1시간 압수', got: {:?}",
        top_chat.text
    );
    crate::assert_region_bounds!(
        top_chat,
        xianscan_rust::ml::schemas::RegionKind::FreeText,
        0,
        3,
        362,
        61,
        15
    );

    // 2. BOTTOM 4 VIEWER COUNT TICKS: Each must exist as a distinct, cleanly separated region
    let tick1 = res
        .regions
        .iter()
        .find(|r| r.text.contains("시청자") && (r.text.contains("371") || (r.box_.y >= 600 && r.box_.y <= 655)));
    assert!(tick1.is_some(), "Must detect viewer tick 1 (~2,371)");
    let tick1 = tick1.unwrap();
    crate::assert_region_bounds!(
        tick1,
        xianscan_rust::ml::schemas::RegionKind::FreeText,
        52,
        616,
        247,
        32,
        15
    );

    let tick2 = res
        .regions
        .iter()
        .find(|r| r.text.contains("시청자") && (r.text.contains("4,762") || r.text.contains("762") || (r.box_.y >= 660 && r.box_.y <= 715)));
    assert!(tick2.is_some(), "Must detect viewer tick 2 (~4,752)");
    let tick2 = tick2.unwrap();
    crate::assert_region_bounds!(
        tick2,
        xianscan_rust::ml::schemas::RegionKind::FreeText,
        28,
        674,
        297,
        28,
        15
    );

    let tick3 = res
        .regions
        .iter()
        .find(|r| r.text.contains("시청자") && (r.text.contains("6,388") || r.text.contains("388") || (r.box_.y >= 720 && r.box_.y <= 775)));
    assert!(tick3.is_some(), "Must detect viewer tick 3 (~6,388)");
    let tick3 = tick3.unwrap();
    crate::assert_region_bounds!(
        tick3,
        xianscan_rust::ml::schemas::RegionKind::FreeText,
        28,
        737,
        297,
        30,
        15
    );

    let tick4 = res
        .regions
        .iter()
        .find(|r| r.text.contains("시청자") && (r.text.contains("7,588") || r.text.contains("588") || (r.box_.y >= 785 && r.box_.y <= 845)));
    assert!(tick4.is_some(), "Must detect viewer tick 4 (7,588)");
    let tick4 = tick4.unwrap();
    crate::assert_region_bounds!(
        tick4,
        xianscan_rust::ml::schemas::RegionKind::FreeText,
        15,
        799,
        324,
        32,
        15
    );

    // Ensure tick 1, 2, 3, 4 are not all merged into a single giant multi-line blob
    let giant_blob = res.regions.iter().find(|r| {
        let lines_count = r.text.lines().count();
        lines_count >= 3 && r.text.contains("시청자") && r.box_.h >= 90
    });
    assert!(giant_blob.is_none(), "Viewer count ticks must NOT be lumped into a single giant multi-line blob");
}
