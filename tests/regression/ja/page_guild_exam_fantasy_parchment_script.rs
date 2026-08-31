// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_guild_exam_fantasy_parchment_script` (RESOLUTION: 640 × 1262)
///
/// ## CONTEXT & PURPOSE:
/// - Source: Production page 109975 (seq 0), native 640 × 1262.
/// - Scene: Guild exam — 4-panel page where an exam parchment is covered in giant slanted decorative
///   in-world fantasy script, overlapped by 12 speech bubbles and one slanted exam-condition text.
/// - PRODUCTION FAILURE (v0.5.0-beta.1): The decorative fantasy script OCR'd as garbage fragments forming
///   two bogus regions (`"ル\nn5za\nの\n¬F2\nと\n、"` as FreeText and `"まキ\nかル\nの"` hijacking a real
///   bubble envelope) which were translated as "The" / "of" over the parchment.
/// - EXPECTED: Exactly 13 regions (12 DialogueBubbles + 1 slanted FreeText exam condition); the giant
///   fantasy script is fully suppressed; dominant bubble lines are never contaminated by script debris.
#[test]
fn test_regression_page_guild_exam_fantasy_parchment_script() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_guild_exam_fantasy_parchment_script/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_guild_exam_fantasy_parchment_script: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Guild Exam Fantasy Parchment Script Page ===");
    println!("Detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  [Region {}] id={}, kind={:?}, text=\"{}\", conf={:.3}, angle={:.2}, vertical={}, box={:?}, bubble_box={:?}",
            i,
            r.id,
            r.kind,
            r.text.replace('\n', "\\n"),
            r.confidence,
            r.angle,
            r.vertical,
            r.box_,
            r.bubble_box
        );
    }

    // 1. EXACT ELEMENT COUNTS: 12 DIALOGUE BUBBLES + 1 SLANTED EXAM-CONDITION FREE TEXT
    crate::assert_element_counts!(res, 13, 12, 0, 1);

    // 2. NEGATIVE GUARDS: NO DECORATIVE FANTASY-SCRIPT OCR GARBAGE FRAGMENTS
    for r in &res.regions {
        let t = r.text.replace('\n', "");
        assert!(
            !t.contains("n5za") && !t.contains("まキ") && !t.contains("かル") && !t.contains("P1744T0"),
            "Decorative fantasy-script garbage must not be extracted, got: '{}'",
            r.text.replace('\n', "\\n")
        );
    }

    // 3. THE REAL SLANTED EXAM CONDITION TEXT MUST SURVIVE AS FREE TEXT
    let exam_condition = res
        .regions
        .iter()
        .find(|r| r.text.contains("試験官") && r.text.contains("剣士"))
        .expect("Slanted exam condition text '「試験官」(剣士)との1対1での模擬戦に勝利する' must be detected");
    assert_eq!(
        exam_condition.kind,
        xianscan_rust::ml::schemas::RegionKind::FreeText,
        "Exam condition must be classified as FreeText"
    );
    assert!(
        exam_condition.text.contains("模擬戦に勝利する"),
        "Exam condition must capture the full requirement, got: '{}'",
        exam_condition.text.replace('\n', "\\n")
    );
    crate::assert_region_angle!(exam_condition, -20.22, 1.0);

    // 4. KEY CLEAN UTTERANCES (READING ORDER + EXACT TEXT)
    let stop_bubble = res
        .regions
        .iter()
        .find(|r| r.text.contains("止めないのか"))
        .expect("Top-right bubble '止めないのか？' must be detected");
    assert_eq!(stop_bubble.text.trim(), "止めないのか？", "Furigana/script debris must not contaminate clean bubbles");
    assert!(res.regions.iter().any(|r| r.text.contains("簡単ですよ")), "Bubble '簡単ですよ' must exist");
    assert!(
        res.regions.iter().any(|r| r.text.contains("なるほど") && r.text.contains("クリアできないな")),
        "'なるほど…使えるスキルのないノービスではクリアできないな' bubble must exist"
    );
}
