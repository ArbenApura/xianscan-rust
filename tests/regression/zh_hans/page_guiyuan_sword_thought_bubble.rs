// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_guiyuan_sword_thought_bubble` (RESOLUTION: 880 × 1255)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 2 BOTTOM-LEFT THOUGHT BUBBLE**: MUST UNIFY 5 LINES INTO A SINGLE THOUGHT REGION:
///   `"炼化这归元剑后，\n确实比我自己出手\n上门省心，可惜不\n能炼化入体内，终\n究只是个剑胚。"`
///   MUST NOT SPLIT AFTER LINE 2 ("确实比我自己出手").
/// - **EXACT COUNTS**: EXACTLY 5 REGIONS (4 DIALOGUE BUBBLES, 1 FREE TEXT).
#[test]
fn test_regression_page_guiyuan_sword_thought_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_guiyuan_sword_thought_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_guiyuan_sword_thought_bubble, fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Guiyuan Sword Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 5 REGIONS (4 DIALOGUE BUBBLES, 1 FREE TEXT)
    crate::assert_element_counts!(res, 5, 4, 1);

    // 2. PANEL 1 TOP-LEFT JAGGED SHOUT BUBBLE
    let p1_left = res.regions.iter().find(|r| r.text.contains("陈北玄") && r.text.replace('\n', "").contains("回来了"));
    assert!(p1_left.is_some(), "Must detect panel 1 top-left shout bubble");
    let p1_left = p1_left.unwrap();
    assert_eq!(p1_left.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // Radiating spikes burst bubble must not have right side severed as a false tail
    assert_eq!(p1_left.carrier_box, None, "Burst shout bubble must not publish false tail-cut carrier box");
    let tb = p1_left.typeset_box.as_ref().expect("typeset box must exist");
    let bb = p1_left.bubble_box.as_ref().expect("bubble box must exist");
    let tb_cx = tb.x + tb.w / 2;
    let bb_cx = bb.x + bb.w / 2;
    assert!((tb_cx - bb_cx).abs() <= 2, "Typeset box X must be centered in shout bubble, got tb_cx={}, bb_cx={}", tb_cx, bb_cx);

    // 3. PANEL 1 TOP-RIGHT NARRATION BOX
    let p1_right = res.regions.iter().find(|r| r.text.contains("十六家") || r.text.contains("尸首分离"));
    assert!(p1_right.is_some(), "Must detect panel 1 top-right narration box");
    let p1_right = p1_right.unwrap();
    assert_eq!(p1_right.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 4. PANEL 2 BOTTOM-LEFT CIRCULAR THOUGHT BUBBLE: UNIFIED 5-LINE MONOLOGUE
    let thought = res.regions.iter().find(|r| r.text.contains("归元剑") || r.text.contains("剑胚"));
    assert!(thought.is_some(), "Must detect panel 2 thought bubble");
    let thought = thought.unwrap();
    assert_eq!(thought.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(thought.text.contains("归元剑"), "Must contain 归元剑");
    assert!(thought.text.contains("自己出手") || thought.text.contains("省心"), "Must contain 自己出手/省心");
    assert!(thought.text.contains("剑胚") || thought.text.contains("体内"), "Must contain 剑胚 within the same unified thought region");

    // NEGATIVE CHECK: ZERO SPLIT REGIONS CONTAINING ONLY FIRST HALF
    assert!(
        !res.regions.iter().any(|r| r.text.trim().ends_with("确实比我自己出手")),
        "Must NOT split after line 2"
    );

    // 5. PANEL 2 SPEECH BUBBLE
    let p2_speech = res.regions.iter().find(|r| r.text.replace('\n', "").contains("最后一家") || r.text.contains("就剩"));
    assert!(p2_speech.is_some(), "Must detect panel 2 speech bubble");
    let p2_speech = p2_speech.unwrap();
    assert_eq!(p2_speech.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);

    // 6. PANEL 2 MANOR SIGN FREE TEXT
    let sign = res.regions.iter().find(|r| r.text.contains("唐家庄园"));
    assert!(sign.is_some(), "Must detect 唐家庄园 manor sign");
    let sign = sign.unwrap();
    assert_eq!(sign.kind, xianscan_rust::ml::schemas::RegionKind::FreeText);
}
