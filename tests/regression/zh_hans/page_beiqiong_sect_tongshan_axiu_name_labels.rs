// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_beiqiong_sect_tongshan_axiu_name_labels` (RESOLUTION: 827 × 1981)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 3 SHORT FLOATING NAME LABELS**: MUST DETECT 2-CHARACTER NAMES:
///   `"铜山"` AND `"阿秀"`
///   MUST NOT BE DROPPED AS NOISE OR WATERMARKS.
/// - **EXACT COUNTS**: 12 REGIONS TOTAL.
#[test]
fn test_regression_page_beiqiong_sect_tongshan_axiu_name_labels() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_beiqiong_sect_tongshan_axiu_name_labels/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_beiqiong_sect_tongshan_axiu_name_labels, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Beiqiong Sect Names Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. MUST DETECT THE TWO 2-CHARACTER NAMES IN PANEL 3
    let tong_shan = res.regions.iter().find(|r| r.text.contains("铜山"));
    assert!(tong_shan.is_some(), "Must detect 铜山 (Tong Shan) floating name label");

    let a_xiu = res.regions.iter().find(|r| r.text.contains("阿秀"));
    assert!(a_xiu.is_some(), "Must detect 阿秀 (A Xiu) floating name label");

    // 2. OTHER CHARACTER NAMES
    assert!(res.regions.iter().any(|r| r.text.contains("华云峰")), "Must detect 华云峰");
    assert!(res.regions.iter().any(|r| r.text.contains("程丹青")), "Must detect 程丹青");
    assert!(res.regions.iter().any(|r| r.text.contains("雪代沙")), "Must detect 雪代沙");
    assert!(res.regions.iter().any(|r| r.text.contains("周静怡")), "Must detect 周静怡");
    assert!(res.regions.iter().any(|r| r.text.contains("余文静")), "Must detect 余文静");
    assert!(res.regions.iter().any(|r| r.text.contains("港岛")), "Must detect 港岛真人 label");
    assert!(res.regions.iter().any(|r| r.text.contains("黑巫教")), "Must detect 黑巫教真人 label");

    // 3. TOP NARRATION BOXES
    assert!(res.regions.iter().any(|r| r.text.contains("北琼派的建立")), "Must detect panel 1 left narration");
    assert!(res.regions.iter().any(|r| r.text.contains("她在陈凡消失后")), "Must detect panel 1 right narration");
    assert!(res.regions.iter().any(|r| r.text.contains("另一边")), "Must detect panel 2 narration");

    // 4. EXACT TOTAL REGION COUNT: 12
    assert_eq!(res.regions.len(), 12, "Must detect exactly 12 regions");
}
