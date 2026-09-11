// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_friend_request_didi_rotation_angle` (RESOLUTION: 800 × 1452)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 DIALOGUE BUBBLE**:
///   `"你看我的名\n字！"` (DialogueBubble).
/// - **PANEL 2 NOTIFICATION SOUND EFFECT**:
///   `"嘀嘀——"` (FreeText / SoundEffect, slanted sound wave towards character).
///   - MUST preserve a non-zero rotation angle (|angle| ≥ 2.0°).
///   - MUST NOT snap to flat 0.0°.
/// - **PANEL 3 TILTED SYSTEM PROMPT CARD**:
///   `"火球申请添加你为好友\n确定取消"` (FreeText, rotation angle ~ 19.8°).
/// - **EXPLICIT NEGATIVE GUARDS**:
///   - SOUND EFFECT '嘀嘀——' MUST NOT HAVE ANGLE 0.0°.
///   - MUST NOT DETECT '漫客栈' PUBLISHER WATERMARK.
/// - **EXACT COUNTS**: EXACTLY 3 REGIONS TOTAL (1 DIALOGUE BUBBLE, 0 SFX, 2 FREE TEXT; OR 1 BUBBLE, 1 SFX, 1 FREE TEXT).
#[test]
fn test_regression_page_friend_request_didi_rotation_angle() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_friend_request_didi_rotation_angle/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_friend_request_didi_rotation_angle: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Friend Request DiDi Page detected {} regions:",
        res.regions.len()
    );
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}°, box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 3 REGIONS TOTAL (1 DIALOGUE BUBBLE)
    assert_eq!(
        res.regions.len(),
        3,
        "Expected exactly 3 regions total, got {}",
        res.regions.len()
    );
    let bubble_count = res
        .regions
        .iter()
        .filter(|r| r.kind == RegionKind::DialogueBubble)
        .count();
    assert_eq!(
        bubble_count, 1,
        "Expected exactly 1 dialogue bubble, got {}",
        bubble_count
    );

    // 2. PANEL 1 DIALOGUE BUBBLE: '你看我的名\n字！'
    let bubble = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble && r.text.replace('\n', "").contains("你看我的名字")
    });
    assert!(bubble.is_some(), "Must detect panel 1 dialogue bubble '你看我的名字！'");
    let bubble = bubble.unwrap();
    crate::assert_region_bounds!(bubble, RegionKind::DialogueBubble, 401, 65, 182, 79, 15);
    crate::assert_bubble_bounds!(bubble, 387, 58, 233, 125, 15);

    // 3. PANEL 2 NOTIFICATION SOUND EFFECT: '嘀嘀——' (MUST HAVE NON-ZERO ROTATION ANGLE)
    let sfx_didi = res.regions.iter().find(|r| r.text.contains("嘀嘀"));
    assert!(sfx_didi.is_some(), "Must detect panel 2 notification sound effect '嘀嘀——'");
    let sfx_didi = sfx_didi.unwrap();
    assert!(
        sfx_didi.angle.abs() >= 2.0,
        "Sound effect '嘀嘀——' must preserve non-zero rotation angle (expected |angle| >= 2.0°), got {:.2}°",
        sfx_didi.angle
    );
    crate::assert_region_bounds!(sfx_didi, sfx_didi.kind, 83, 739, 94, 64, 15);

    // 4. PANEL 3 TILTED PROMPT CARD: '火球申请添加你为好友\n确定取消'
    let card = res.regions.iter().find(|r| r.text.contains("添加你为好友"));
    assert!(card.is_some(), "Must detect panel 3 tilted prompt card");
    let card = card.unwrap();
    assert_eq!(card.kind, RegionKind::FreeText);
    assert!(
        card.text.contains("确定") || card.text.contains("取消"),
        "Card must contain action buttons '确定取消', got '{}'",
        card.text
    );
    crate::assert_region_bounds!(card, RegionKind::FreeText, 323, 1140, 311, 181, 20);
    crate::assert_region_angle!(card, 19.8, 3.0);

    // 5. EXPLICIT NEGATIVE GUARDS
    assert_ne!(
        sfx_didi.angle, 0.0,
        "Sound effect '嘀嘀——' must NOT snap to flat 0.0°"
    );
    assert!(
        !res.regions.iter().any(|r| r.text.contains("漫客栈")),
        "Must NOT detect publisher watermark '漫客栈'"
    );
}
