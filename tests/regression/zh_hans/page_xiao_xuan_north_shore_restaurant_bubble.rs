// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: page_xiao_xuan_north_shore_restaurant_bubble (RESOLUTION: 827 x 1884)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 SPEECH BUBBLE**: "没事儿，大家都有过。" (DialogueBubble)
/// - **PANEL 1 SPEECH BUBBLE**: "这不算什么，咱们继续吃！" (DialogueBubble)
/// - **PANEL 2 SPEECH BUBBLE**: "所以那人到底是是谁？" (DialogueBubble)
/// - **PANEL 3 CIRCULAR BUBBLE**: "是萧玄。" (DialogueBubble, downward tail severed, circular chamber preserved at h ~ 129 without false 40px cut, typeset box centered)
/// - **PANEL 3 SPEECH BUBBLE**: "萧玄？" (DialogueBubble)
/// - **PANEL 4 SPEECH BUBBLE**: "燕京老萧家的大少萧玄？" (DialogueBubble)
/// - **PANEL 4 SPEECH BUBBLE**: "萧玄可是堂堂萧家大少，燕京这一代的领军人物，他怎么会出现在北岸餐厅？" (DialogueBubble)
/// - **EXACT COUNTS**: Exactly 7 dialogue bubble regions.
#[test]
fn test_regression_page_xiao_xuan_north_shore_restaurant_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_xiao_xuan_north_shore_restaurant_bubble.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_xiao_xuan_north_shore_restaurant_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Xiao Xuan Restaurant Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}, box={:?}, bubble={:?}, carrier={:?}, typeset={:?}, text='{}'",
            i, r.kind, r.angle, r.box_, r.bubble_box, r.carrier_box, r.typeset_box, r.text.replace('\n', " ")
        );
    }

    // 1. EXACT ELEMENT COUNTS
    crate::assert_element_counts!(res, 7, 7, 0);

    // 2. REGION 3: "是萧玄。"
    // Circular speech bubble with downward tail pointing toward character:
    // Tail must be trimmed by carrier, but circular chamber must NOT be sliced by 40px.
    let xiao_bubble = res.regions.iter().find(|r| r.text.contains("萧玄") && !r.text.contains("堂堂") && !r.text.contains("大少") && !r.text.contains("？"));
    assert!(xiao_bubble.is_some(), "Must detect '是萧玄。' bubble");
    let xiao_bubble = xiao_bubble.unwrap();
    assert_eq!(xiao_bubble.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    let bb3 = xiao_bubble.bubble_box.as_ref().expect("bubble box must exist");
    crate::assert_bubble_bounds!(xiao_bubble, 36, 749, 124, 150, 15);

    // Carrier box must preserve circular chamber (height >= 122 and <= 136)
    let carrier3 = xiao_bubble.carrier_box.as_ref().expect("carrier box must be published");
    assert!(
        carrier3.h >= 122 && carrier3.h <= 136,
        "Carrier height must preserve circular body, got {} (bubble h={})",
        carrier3.h, bb3.h
    );

    // Typeset box must be centered vertically inside the circular chamber
    let tb3 = xiao_bubble.typeset_box.as_ref().expect("typeset box must exist");
    let c3_cx = carrier3.x + carrier3.w / 2;
    let c3_cy = carrier3.y + carrier3.h / 2;
    let tb3_cx = tb3.x + tb3.w / 2;
    let tb3_cy = tb3.y + tb3.h / 2;
    assert!(
        (tb3_cx - c3_cx).abs() <= 2,
        "Typeset box X must be centered in carrier chamber (got tb3_cx={}, c3_cx={})",
        tb3_cx, c3_cx
    );
    assert!(
        (tb3_cy - c3_cy).abs() <= 2,
        "Typeset box Y must be centered in carrier chamber (got tb3_cy={}, c3_cy={})",
        tb3_cy, c3_cy
    );

    // 3. INPAINTING & SHRINKWRAP CLEANING
    let cleaned = crate::common::clean_fixture_with_cache(&img, &res);
    assert!(cleaned.is_some(), "Inpainting and cavity cleaning must produce cleaned result");
}
