// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_bar_shared_bubble_split` (RESOLUTION: 900 × 1856)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **SAME-BUBBLE MULTI-COLUMN MERGE**:
///   THE TOP-LEFT WIDE SPEECH BUBBLE CONTAINS TWO SIDE-BY-SIDE OCR TEXT COLUMNS:
///   - LEFT COLUMN: "哈哈哈，\n开玩笑，\n酒吧吧，\n就是!"
///   - RIGHT COLUMN: "钱总真会\n就去我的\n商场七楼"
///   BOTH COLUMNS SHARE THE SAME bubble_box AND MUST BE MERGED INTO ONE REGION.
/// - **EXACT COUNTS**: 4 REGIONS TOTAL (4 DIALOGUE BUBBLES).
#[test]
fn test_regression_page_bar_shared_bubble_split() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_bar_shared_bubble_split/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("Detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. TOTAL REGION COUNT: 4 DIALOGUE BUBBLES, NOT 5
    crate::assert_element_counts!(res, 4, 4, 0, 0);

    // 2. THE WIDE TOP-LEFT BUBBLE MUST CONTAIN TEXT FROM BOTH COLUMNS IN ONE REGION
    let r_top = res.regions.iter().find(|r| {
        (r.text.contains("哈哈哈") || r.text.contains("开玩笑") || r.text.contains("酒吧"))
            && (r.text.contains("钱总真会") || r.text.contains("商场七楼"))
    });
    assert!(r_top.is_some(), "The top-left wide bubble must unify both OCR columns into one region");
    let r_top = r_top.unwrap();
    assert_eq!(r_top.kind, RegionKind::DialogueBubble);

    // 3. THE TWO COLUMN TEXT FRAGMENTS MUST NOT APPEAR AS SEPARATE REGIONS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("哈哈哈") && !r.text.contains("钱总真会")),
        "Left column must not appear without right column"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.contains("钱总真会") && !r.text.contains("哈哈哈") && !r.text.contains("酒吧")),
        "Right column must not appear without left column"
    );

    // 4. REMAINING BUBBLES MUST BE DETECTED
    assert!(res.regions.iter().any(|r| r.text.contains("那可说好了") || r.text.contains("必须让钱总买单")), "Must detect middle bubble");
    assert!(res.regions.iter().any(|r| r.text.contains("那必须的")), "Must detect small bubble");
    assert!(res.regions.iter().any(|r| r.text.contains("高级酒吧") || r.text.contains("不会很贵")), "Must detect bottom bubble");
}
