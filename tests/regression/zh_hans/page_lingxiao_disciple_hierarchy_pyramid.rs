// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # CHINESE REAL-PAGE REGRESSION: `page_lingxiao_disciple_hierarchy_pyramid` (RESOLUTION: 800 × 1913)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 (SPEECH BUBBLES)**:
///   1. `"试炼弟子杨开，\n淬体三层！"`
///   2. `"普通弟子周定军，\n淬体五层！"`
/// - **PANEL 2 (HIERARCHY PYRAMID - 5 DISTINCT TIER BLOCKS + 1 NARRATION)**:
///   3. `"核心弟子"`
///   4. `"精英弟子"` (separated from 座下弟子)
///   5. `"座下弟子"` (separated from 精英弟子)
///   6. `"普通弟子"`
///   7. `"试炼弟子"`
///   8. `"在凌霄阁，弟子也\n是分等级层次的"`
/// - **PANEL 3 (PROMOTION CHART 2 TIER BLOCKS + 1 NARRATION)**:
///   9. `"核心弟子"` (top promotion box)
///   10. `"精英弟子"` (bottom promotion box)
///   11. `"精英弟子，出类拔萃\n而核心弟子，则是凌\n霄阁未来的接班人"`
/// - **PANEL 4 (NARRATION CARD)**:
///   12. `"周定军说自己是普\n通弟子，也就是说他还\n未拜入宗中高手门下"`
/// - **EXACT COUNTS**: Exactly 12 regions (3 DialogueBubbles, 0 SoundEffect, 9 FreeText).
#[test]
fn test_regression_page_lingxiao_disciple_hierarchy_pyramid() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_lingxiao_disciple_hierarchy_pyramid/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_lingxiao_disciple_hierarchy_pyramid: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!("Chinese Lingxiao Pyramid Page detected {} regions:", res.regions.len());
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

    // 1. EXACT ELEMENT COUNTS: EXACTLY 12 REGIONS (3 DIALOGUEBUBBLES, 0 SOUNDEFFECT, 9 FREETEXT)
    crate::assert_element_counts!(res, 12, 3, 0, 9);

    // 2. PANEL 1 DIALOGUE BUBBLES
    assert!(res.regions.iter().any(|r| r.text.contains("杨开") && r.text.contains("淬体三层")));
    assert!(res.regions.iter().any(|r| r.text.contains("周定军") && r.text.contains("淬体五层")));

    // 3. PANEL 2 PYRAMID TIERS
    assert!(res.regions.iter().any(|r| r.text.trim() == "核心弟子" && r.box_.y < 800));
    assert!(res.regions.iter().any(|r| r.text.trim() == "精英弟子" && r.box_.y > 800 && r.box_.y < 860));
    assert!(res.regions.iter().any(|r| r.text.trim() == "座下弟子" && r.box_.y > 850 && r.box_.y < 920));
    assert!(res.regions.iter().any(|r| r.text.trim() == "普通弟子" && r.box_.y > 920 && r.box_.y < 1020));
    assert!(res.regions.iter().any(|r| r.text.trim() == "试炼弟子" && r.box_.y > 1020 && r.box_.y < 1100));
    assert!(res.regions.iter().any(|r| r.text.contains("凌霄阁") && r.text.contains("等级层次")));

    // 4. PANEL 3 PROMOTION TIERS & NARRATION
    let p3_hexin = res.regions.iter().find(|r| r.text.trim() == "核心弟子" && r.box_.y > 1150 && r.box_.y < 1300);
    assert!(p3_hexin.is_some(), "Must detect Panel 3 top promotion box '核心弟子'");

    let p3_jingying = res.regions.iter().find(|r| r.text.trim() == "精英弟子" && r.box_.y > 1250 && r.box_.y < 1380);
    assert!(p3_jingying.is_some(), "Must detect Panel 3 bottom promotion box '精英弟子'");

    let p3_narration = res.regions.iter().find(|r| r.text.contains("出类拔萃") && r.text.contains("接班人"));
    assert!(p3_narration.is_some(), "Must detect Panel 3 narration '精英弟子，出类拔萃...'");

    // 5. PANEL 4 NARRATION
    assert!(res.regions.iter().any(|r| r.text.contains("周定军说自己是普") && r.text.contains("高手门下")));
}
