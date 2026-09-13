// -- CRATE / EXTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_mayor_ransom_makino_alert_split_bubble` (RESOLUTION: 800 x 1532)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **BOTTOM MIDDLE PANEL COMPOUND DOUBLE BUBBLE SPLIT**:
///   - Right lobe: `"出什么事了，\n卷乃？"` (DialogueBubble, ending with question mark).
///   - Left lobe: `"那么慌慌\n张张的。"` (DialogueBubble, ending with full stop).
///   - Must NOT be merged into a single composite region.
/// - **BOTTOM RIGHT PANEL MAKINO SHOUT**:
///   - `"镇长！！\n不好了！！"` (vertical shout tightly isolated to the right column, x >= 640, w <= 100).
///   - Must NOT merge door-slam SFX noise ("M!") or span across the entire 284px width.
/// - **EXPLICIT NEGATIVE GUARDS**:
///   - MUST NOT MERGE BOTH LOBES INTO A SINGLE DIALOGUE REGION.
///   - MUST NOT MERGE 'M!' INTO MAKINO'S DIALOGUE SHOUT.
///   - MUST NOT DILATE MAKINO'S BOUNDING BOX INTO SFX ARTWORK.
#[test]
fn test_regression_page_mayor_ransom_makino_alert_split_bubble() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_mayor_ransom_makino_alert_split_bubble/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!(
                "[INFO] Skipping test_regression_page_mayor_ransom_makino_alert_split_bubble: fixture not found"
            );
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Mayor Ransom Makino Alert Split Bubble Page detected {} regions:",
        res.regions.len()
    );
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

    // 1. VERIFY RIGHT LOBE OF DOUBLE BUBBLE
    let right_lobe = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && r.text.contains("出什么事了")
            && r.text.contains("卷乃")
    });
    assert!(
        right_lobe.is_some(),
        "Must isolate right lobe dialogue bubble"
    );
    let right_lobe = right_lobe.unwrap();
    assert!(
        !right_lobe.text.contains("张张"),
        "Right lobe must NOT contain text from the left lobe"
    );
    crate::assert_region_bounds!(right_lobe, RegionKind::DialogueBubble, 360, 1150, 75, 128, 20);

    // 2. VERIFY LEFT LOBE OF DOUBLE BUBBLE
    let left_lobe = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && r.text.contains("慌慌")
            && r.text.contains("张张")
    });
    assert!(
        left_lobe.is_some(),
        "Must isolate left lobe dialogue bubble"
    );
    let left_lobe = left_lobe.unwrap();
    assert!(
        !left_lobe.text.contains("出什么事了"),
        "Left lobe must NOT contain text from the right lobe"
    );
    crate::assert_region_bounds!(left_lobe, RegionKind::DialogueBubble, 290, 1150, 75, 128, 20);

    // 3. VERIFY MAKINO SHOUT ISOLATED TO RIGHT COLUMN
    let makino_shout = res.regions.iter().find(|r| {
        r.text.contains("镇长") && r.text.contains("不好了")
    });
    assert!(
        makino_shout.is_some(),
        "Must detect Makino shout"
    );
    let makino_shout = makino_shout.unwrap();
    assert!(
        !makino_shout.text.contains("M!"),
        "Makino shout must NOT merge door slam noise M!"
    );
    assert!(
        makino_shout.box_.x >= 640,
        "Makino shout box must be anchored on right column (x >= 640), got x={}",
        makino_shout.box_.x
    );
    assert!(
        makino_shout.box_.w <= 100,
        "Makino shout box must be tightly bounded (w <= 100), got w={}",
        makino_shout.box_.w
    );

    // 4. VERIFY TOP PANEL RANSOM DIALOGUE BUBBLE ISOLATED WITHOUT SFX
    let ransom_bubble = res.regions.iter().find(|r| {
        r.text.contains("不嫌弃") && r.text.contains("赎金")
    });
    assert!(
        ransom_bubble.is_some(),
        "Must detect top panel ransom dialogue bubble"
    );
    let ransom_bubble = ransom_bubble.unwrap();
    assert_eq!(
        ransom_bubble.kind,
        RegionKind::DialogueBubble,
        "Top panel ransom text must be DialogueBubble, not FreeText"
    );
    assert!(
        !ransom_bubble.text.contains("がばっ") && !ransom_bubble.text.contains("が"),
        "Top panel ransom bubble must NOT merge Japanese SFX"
    );
    assert!(
        ransom_bubble.box_.w <= 120,
        "Top panel ransom bubble must stay within bubble bounds (w <= 120), got w={}",
        ransom_bubble.box_.w
    );

    // 5. EXPLICIT NEGATIVE GUARDS
    assert!(
        !res.regions.iter().any(|r| r.text.contains("出什么事了") && r.text.contains("张张")),
        "Must NOT merge both lobes of double bubble into a single region"
    );
    assert!(
        !res.regions.iter().any(|r| r.box_.w > 200 && r.box_.y > 1100 && r.box_.x > 400),
        "Must NOT create giant 284px merged bounding box across Makino panel"
    );
}
