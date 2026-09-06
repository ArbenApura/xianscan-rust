// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_an_yuqing_dont_talk_to_strangers_bubble` (RESOLUTION: 880 × 1239)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 2 LEFT SPEECH BUBBLE**: MUST UNIFY 3 LINES INTO A SINGLE DIALOGUE REGION:
///   `"小曦，别随便和\n陌生人说话，注\n意自己的身份。"`
///   MUST NOT SPLIT INTO 3 SEPARATE SINGLE-LINE REGIONS SHARING THE SAME BUBBLE BOX.
/// - **EXACT COUNTS**: 4 DIALOGUE REGIONS TOTAL (LEFT BUBBLE, RIGHT BUBBLE, AND 2 NAME TAGS).
#[test]
fn test_regression_page_an_yuqing_dont_talk_to_strangers_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_an_yuqing_dont_talk_to_strangers_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_an_yuqing_dont_talk_to_strangers_bubble, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans An Yuqing Dont Talk To Strangers detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 4 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 4, 4, 0);

    // 2. PANEL 2 LEFT SPEECH BUBBLE: UNIFIED 3-LINE DIALOGUE
    let p2_left = res.regions.iter().find(|r| r.text.contains("陌生人") || r.text.contains("身份") || r.text.contains("小曦"));
    assert!(p2_left.is_some(), "Must detect panel 2 left dialogue bubble");
    let p2_left = p2_left.unwrap();
    assert_eq!(p2_left.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(p2_left.text.contains("小曦") || p2_left.text.contains("别随便"), "Must contain line 1 (小曦，别随便和)");
    assert!(p2_left.text.contains("陌生人说话") || p2_left.text.contains("陌生人"), "Must contain line 2 (陌生人说话，注)");
    assert!(p2_left.text.contains("身份") || p2_left.text.contains("意自己的身份"), "Must contain line 3 (意自己的身份。)");

    // NEGATIVE CHECK: ZERO SPLIT REGIONS CONTAINING ONLY ONE LINE OF THIS BUBBLE
    assert!(
        !res.regions.iter().any(|r| r.text.trim() == "意自己的身份。" || r.text.trim() == "陌生人说话，注" || r.text.trim() == "小曦，别随便和"),
        "Must NOT split into individual single-line regions"
    );

    // 3. PANEL 2 RIGHT SPEECH BUBBLE: UNIFIED MULTI-LINE DIALOGUE
    let p2_right = res.regions.iter().find(|r| r.text.contains("可是姐姐") || r.text.contains("安雅姐"));
    assert!(p2_right.is_some(), "Must detect panel 2 right dialogue bubble");
    let p2_right = p2_right.unwrap();
    assert_eq!(p2_right.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(p2_right.text.contains("可是姐姐") || p2_right.text.contains("认识安"), "Must contain Sister Anya dialogue");

    // 4. NAME TAGS
    assert!(res.regions.iter().any(|r| r.text.contains("安若曦")), "Must detect 安若曦 name tag");
    assert!(res.regions.iter().any(|r| r.text.contains("安雨晴")), "Must detect 安雨晴 name tag");
}
