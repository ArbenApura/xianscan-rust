// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_grandmasters_damon_name_label` (RESOLUTION: 827 × 1341)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 2 FLOATING 2-CHARACTER NAME LABEL**: MUST DETECT `"达蒙"` (DAMON):
///   MUST NOT BE DROPPED AS NOISE OR WATERMARK.
/// - **EXACT COUNTS**: 11 REGIONS TOTAL.
#[test]
fn test_regression_page_grandmasters_damon_name_label() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_grandmasters_damon_name_label/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_grandmasters_damon_name_label, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Grandmasters Damon Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. MUST DETECT THE 2-CHARACTER NAME "达蒙"
    let damon = res.regions.iter().find(|r| r.text.contains("达蒙"));
    assert!(damon.is_some(), "Must detect 达蒙 (Damon) floating name label");

    // 2. OTHER CHARACTER NAMES IN TOP/MID PANELS
    assert!(res.regions.iter().any(|r| r.text.contains("姚道一")), "Must detect 姚道一");
    assert!(res.regions.iter().any(|r| r.text.contains("渡边") || r.text.contains("武夫")), "Must detect 渡边武夫");
    assert!(res.regions.iter().any(|r| r.text.contains("罗摩") || r.text.contains("上师")), "Must detect 罗摩上师");
    assert!(res.regions.iter().any(|r| r.text.contains("澹台") || r.text.contains("轻璇")), "Must detect 澹台轻璇");
    assert!(res.regions.iter().any(|r| r.text.contains("萨迦") || r.text.contains("法王")), "Must detect 萨迦法王");
    assert!(res.regions.iter().any(|r| r.text.contains("李长生")), "Must detect 李长生 label");
    assert!(res.regions.iter().any(|r| r.text.contains("贫道李长生") || r.text.contains("陈仙师")), "Must detect panel 2 right bubble");

    // 3. CAPTION & BOTTOM PANELS
    assert!(res.regions.iter().any(|r| r.text.contains("大战准备开始")), "Must detect caption");
    assert!(res.regions.iter().any(|r| r.text.contains("呵呵，长生") || r.text.contains("超脱不了")), "Must detect panel 3 left bubble");
    assert!(res.regions.iter().any(|r| r.text.contains("姚天师等三位") || r.text.contains("为仙师介绍")), "Must detect panel 3 right bubble");

    // 4. TOTAL REGION COUNT: 11
    assert_eq!(res.regions.len(), 11, "Must detect exactly 11 regions");
}
