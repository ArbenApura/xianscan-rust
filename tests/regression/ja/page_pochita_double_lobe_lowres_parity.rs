// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE LOW-RES PARITY REGRESSION: `page_pochita_double_lobe_lowres_parity.webp` (RESOLUTION: 640 × 1233 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **CROSS-RESOLUTION EQUIVARIANCE**:
///   THE SAME PHYSICAL PAGE AS `page_pochita_body_double_lobe_split` EXPORTED AS A 640 PX
///   JPEG THUMBNAIL (BROWSER "SAVE IMAGE AS" ON THE COMPARE VIEW) AND RE-IMPORTED. BOTH
///   INGESTIONS MUST PRODUCE THE SAME SEMANTIC RESULT: 9 DIALOGUE REGIONS WITH THE
///   DOUBLE-LOBE BALLOON SPLIT INTO ITS TWO STAGGERED UTTERANCES.
/// - **TOWN CLOUD BUBBLE COLUMN SPLIT**:
///   THE LARGE CLOUD BALLOON'S RIGHT COLUMN (`墓入った 後だったら ヤクザも 追ってこない だろ`)
///   AND LEFT COLUMN (`そんで この町を 出て…`) STAY TWO REGIONS, WITH THE TINY `そんで`
///   BUBBLE AND THE `うん……` BUBBLE ISOLATED BETWEEN THEM.
/// - **FURIGANA JUNK TOLERANCE**:
///   LOW-RES SOURCE SCANS PRODUCE MILD FURIGANA JUNK PREFIXES (`r环`, `品13`); THE TEST
///   ASSERTS THE KEY DIALOGUE STEMS AND STRICT STRUCTURE WHILE TOLERATING THOSE.
#[test]
fn test_regression_page_pochita_double_lobe_lowres_parity() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_pochita_double_lobe_lowres_parity.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_pochita_double_lobe_lowres_parity: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Low-Res 640x1233 Parity Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. STRICT 9-REGION ACCOUNTING (9 DIALOGUEBUBBLES, 0 SOUNDEFFECTS, 0 FREETEXT)
    crate::assert_element_counts!(res, 9, 9, 0, 0);

    // 1. TOP PANEL TREE BUBBLE: '悪魔には… 死んだ人の 体を乗っ取れる ヤツも いるらしい'
    let devil_body = res.regions.iter().find(|r| r.text.contains("悪魔") && r.text.contains("乗っ取れる"));
    assert!(devil_body.is_some(), "Must detect top tree bubble '悪魔には… 死んだ人の 体を乗っ取れる ヤツも いるらしい'");
    let devil_body = devil_body.unwrap();
    crate::assert_region_bounds!(devil_body, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 117, 82, 168, 159, 10);

    // 2. DOUBLE-LOBE UPPER SEGMENT (RIGHT COLUMN): 'ポチタに それが できるん だったら'
    let pochita_if = res.regions.iter().find(|r| r.text.contains("できるん") || r.text.contains("だったら"));
    assert!(pochita_if.is_some(), "Must detect double-lobe upper segment 'ポチタに それが できるん だったら'");
    let pochita_if = pochita_if.unwrap();
    crate::assert_region_bounds!(pochita_if, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 136, 347, 118, 84, 10);
    crate::assert_bubble_bounds!(pochita_if, 65, 323, 221, 236, 12);

    // 3. DOUBLE-LOBE LOWER SEGMENT (LEFT COLUMN): '俺の体を ポチタに あげてー んだ…'
    let give_body = res.regions.iter().find(|r| r.text.contains("俺の体") || r.text.contains("あげて"));
    assert!(give_body.is_some(), "Must detect double-lobe lower segment '俺の体を ポチタに あげてー んだ…'");
    let give_body = give_body.unwrap();
    assert!(give_body.text.contains("んだ"), "Lower segment must retain the trailing 'んだ…' column");
    crate::assert_region_bounds!(give_body, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 105, 457, 132, 83, 10);
    crate::assert_bubble_bounds!(give_body, 65, 323, 221, 236, 12);

    // NEGATIVE GUARD: THE TWO LOBES MUST NEVER RE-MERGE INTO ONE CROSS-LOBE MONOLITH.
    assert!(
        !res.regions.iter().any(|r| r.text.contains("できるん") && r.text.contains("あげてー")),
        "Double-lobe balloon must stay two independent utterance regions"
    );

    // 4. TOWN SMALL BUBBLE: 'うん……' (OCR MAY GARBLE THE DOTTED TRAIL; REGION MUST EXIST)
    let un_ellipsis = res.regions.iter().find(|r| r.text.contains("うん") || r.text.trim().chars().all(|c| c == '…' || c == '.' || c == '。'));
    assert!(un_ellipsis.is_some(), "Must detect town small 'うん……' bubble");

    // 5. TOWN TINY BUBBLE: 'そんで'
    let sode_small = res.regions.iter().find(|r| r.text.contains("そんで") && r.box_.w < 80);
    assert!(sode_small.is_some(), "Must detect town small standalone bubble 'そんで'");
    let sode_small = sode_small.unwrap();
    crate::assert_region_bounds!(sode_small, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 247, 735, 48, 62, 8);
    crate::assert_bubble_bounds!(sode_small, 229, 721, 81, 89, 8);

    // 6. TOWN LARGE BUBBLE LEFT COLUMN: 'そんで この町を 出て…'
    let leave_town = res.regions.iter().find(|r| r.text.contains("この町") && r.text.contains("出て"));
    assert!(leave_town.is_some(), "Must detect town large bubble left column 'そんで この町を 出て…'");

    // 7. TOWN LARGE BUBBLE RIGHT COLUMN: '墓入った 後だったら ヤクザも 追ってこない だろ'
    let grave_yakuza = res.regions.iter().find(|r| r.text.contains("ヤクザ") && r.text.contains("追ってこない"));
    assert!(grave_yakuza.is_some(), "Must detect town large bubble right column '墓入った 後だったら ヤクザも 追ってこない だろ'");

    // 8. BOTTOM-LEFT POCHITA BUBBLE: '普通の 死に方を してほしい'
    let normal_death = res.regions.iter().find(|r| r.text.contains("死に方") || r.text.contains("してほしい"));
    assert!(normal_death.is_some(), "Must detect bottom-left Pochita bubble '普通の 死に方を してほしい'");
    let normal_death = normal_death.unwrap();
    crate::assert_region_bounds!(normal_death, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 138, 1059, 96, 108, 10);
    crate::assert_bubble_bounds!(normal_death, 105, 1036, 153, 152, 10);

    // 9. BOTTOM-RIGHT POCHITA BUBBLE: '普通の 暮らしを して'
    let normal_life = res.regions.iter().find(|r| r.text.contains("暮らし"));
    assert!(normal_life.is_some(), "Must detect bottom-right Pochita bubble '普通の 暮らしを して'");
    let normal_life = normal_life.unwrap();
    crate::assert_region_bounds!(normal_life, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 424, 1066, 100, 98, 10);
    crate::assert_bubble_bounds!(normal_life, 399, 1036, 149, 152, 10);
}
