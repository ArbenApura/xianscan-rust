// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # JAPANESE LOW-RES REGRESSION: `page_faster_more_basilisk_dragon_lowres_parity` (RESOLUTION: 1024 × 809 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **3-COLUMN VERTICAL JAPANESE NARRATION RECOVERY**:
///   VERIFIES THAT ALL 3 VERTICAL COLUMNS OF THE TOP NARRATION (`もっと速く…\nもっとだ…\nもっと──!!`)
///   ARE DETECTED AND UNIFIED INTO A SINGLE FREETEXT REGION IN PROPER TBRL (RIGHT-TO-LEFT) ORDER.
/// - **MULTI-COLUMN SPIKY SPEECH BUBBLE UNIFICATION**:
///   VERIFIES THAT THE ENTIRE SPIKY SPEECH BUBBLE ON THE RIGHT IS CAPTURED AS A SINGLE DIALOGUE UTTERANCE:
///   `目の前の\nバシリスク\nドラゴンを!!\nコピーして\n具現化\nすることだ!!`
/// - **BOTTOM-LEFT SPEECH BUBBLE**:
///   PRESERVES `いけーっ!!`.
#[test]
fn test_regression_page_faster_more_basilisk_dragon_lowres_parity() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_faster_more_basilisk_dragon_lowres_parity/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_faster_more_basilisk_dragon_lowres_parity: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Low-Res Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, box={:?}, text='{}', conf={:.2}, vert={}", i, r.kind, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. STRICT 4-REGION ACCOUNTING (3 DIALOGUE BUBBLES, 0 SOUND EFFECTS, 1 FREE TEXT)
    crate::assert_element_counts!(res, 4, 3, 0, 1);

    // 1. TOP 3-COLUMN NARRATION: 'もっと速く…\nもっとだ…\nもっと──!!'
    let narration = res.regions.iter().find(|r| r.text.contains("もっと速く") || r.text.contains("もっとだ"));
    assert!(narration.is_some(), "Must detect top narration 'もっと速く…\\nもっとだ…\\nもっと──!!'");
    let narration = narration.unwrap();
    assert_eq!(narration.kind, RegionKind::FreeText);
    assert!(narration.text.contains("もっと速く"), "Must contain column 1 'もっと速く'");
    assert!(narration.text.contains("もっとだ"), "Must contain column 2 'もっとだ'");
    assert!(narration.text.contains("もっと"), "Must contain column 3 'もっと──!!'");

    // 2. SPIKY BUBBLE UPPER COLUMN: '目の前の\nバシリスク\nドラゴンを!!'
    let upper_spiky = res.regions.iter().find(|r| r.text.contains("目の前") || r.text.contains("バシリスク"));
    assert!(upper_spiky.is_some(), "Must detect upper spiky bubble column");
    let upper_spiky = upper_spiky.unwrap();
    assert_eq!(upper_spiky.kind, RegionKind::DialogueBubble);
    assert!(upper_spiky.text.contains("目の前"), "Must contain '目の前'");
    assert!(upper_spiky.text.contains("バシリスク"), "Must contain 'バシリスク'");

    // 3. SPIKY BUBBLE LOWER COLUMN: 'コピーして\n具現化\nすることだ!!'
    let lower_spiky = res.regions.iter().find(|r| r.text.contains("コピーして") || r.text.contains("具現化") || r.text.contains("することだ"));
    assert!(lower_spiky.is_some(), "Must detect lower spiky bubble column");
    let lower_spiky = lower_spiky.unwrap();
    assert_eq!(lower_spiky.kind, RegionKind::DialogueBubble);

    // 4. BOTTOM-LEFT SHOUT BUBBLE: 'いけーっ!!'
    let shout_bubble = res.regions.iter().find(|r| r.text.contains("いけ"));
    assert!(shout_bubble.is_some(), "Must detect bottom-left shout bubble");
    let shout_bubble = shout_bubble.unwrap();
    assert_eq!(shout_bubble.kind, RegionKind::DialogueBubble);
}
