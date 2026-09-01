// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_pochita_body_double_lobe_split.webp` (RESOLUTION: 870 × 1676 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **TWO-LOBE CONNECTED DOUBLE BUBBLE SEPARATION**:
///   DENJI'S STAGGERED DOUBLE-LOBE BALLOON MUST STAY TWO INDEPENDENT UTTERANCE REGIONS:
///   `ポチタに それが できるん だったら` (RIGHT LOBE) AND `俺の体を ポチタに あげてー んだ…`
///   (LEFT LOBE). THREE CHAINED DEFECTS FORMERLY MERGED THEM INTO ONE CROSS-LOBE MONOLITH:
///   (1) THE DETECTOR BOX HUGGING ONE LOBE ORPHANED THE OUTERMOST `んだ…` COLUMN, (2) THE
///   WHOLE-BALLOON CROP REFINEMENT CROSS-CONTAMINATED THE SPLIT CLUSTERS, AND (3) THE
///   CONTAINER-BOUNDARY EXPANSION OVERLAPPED THE SIBLINGS SO THE SPATIAL DEDUP DROPPED THE
///   SECOND UTTERANCE AS "CONTAINED".
/// - **RESOLUTION-EQUIVARIANT OCR DETECTION**:
///   THE NATIVE-RESOLUTION PIPELINE RESULT MUST MATCH THE VERIFIED LOW-RES RESULT
///   (9 REGIONS) INSTEAD OF THE MERGED 8-REGION OUTPUT.
/// - **ADJACENT SMALL BUBBLE ISOLATION**:
///   THE TINY `そんで` BUBBLE AND THE `うん……` BUBBLE SITTING LEFT OF THE TOWN PANEL'S
///   LARGE CLOUD BUBBLE MUST REMAIN ISOLATED, AND THE LARGE CLOUD BUBBLE'S TWO COLUMNS
///   (`墓入った 後だったら ヤクザも 追ってこない だろ` RIGHT / `そんで この町を 出て…` LEFT)
///   MUST SPLIT INTO TWO REGIONS WITHOUT CROSS-ABSORBING THE SMALL BUBBLE'S LINE.
/// - **STRICT 9-REGION ACCOUNTING**:
///   ALL 9 SPEECH BUBBLES ACROSS 4 PANELS DETECTED WITH EXACT TEXT INVARIANTS.
#[test]
fn test_regression_page_pochita_body_double_lobe_split() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_pochita_body_double_lobe_split.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_pochita_body_double_lobe_split: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 870x1676 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. STRICT 9-REGION ACCOUNTING (9 DIALOGUEBUBBLES, 0 SOUNDEFFECTS, 0 FREETEXT)
    crate::assert_element_counts!(res, 9, 9, 0, 0);

    // 1. TOP PANEL TREE BUBBLE: '悪魔には… 死んだ人の 体を乗っ取れる ヤツも いるらしい'
    // TEXT BOUNDS: [X: 159, Y: 112, W: 228, H: 216] | BUBBLE BOUNDS: [X: 109, Y: 48, W: 327, H: 321]
    let devil_body = res.regions.iter().find(|r| r.text.contains("悪魔") && r.text.contains("乗っ取れる"));
    assert!(devil_body.is_some(), "Must detect top tree bubble '悪魔には… 死んだ人の 体を乗っ取れる ヤツも いるらしい'");
    let devil_body = devil_body.unwrap();
    crate::assert_region_bounds!(devil_body, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 159, 112, 228, 216, 10);
    crate::assert_bubble_bounds!(devil_body, 109, 48, 327, 321, 12);

    // 2. DOUBLE-LOBE UPPER SEGMENT (RIGHT LOBE): 'ポチタに それが できるん だったら'
    // TEXT BOUNDS: [X: 200, Y: 471, W: 146, H: 114] | BUBBLE BOUNDS: [X: 93, Y: 429, W: 295, H: 332]
    let pochita_if = res.regions.iter().find(|r| r.text.contains("できるん") || r.text.contains("だったら"));
    assert!(pochita_if.is_some(), "Must detect double-lobe upper segment 'ポチタに それが できるん だったら'");
    let pochita_if = pochita_if.unwrap();
    assert!(!pochita_if.text.contains("俺の体"), "Upper segment must not absorb the left lobe");
    crate::assert_region_bounds!(pochita_if, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 185, 471, 160, 114, 10);
    crate::assert_bubble_bounds!(pochita_if, 93, 429, 295, 332, 12);

    // 3. DOUBLE-LOBE LOWER SEGMENT (LEFT LOBE): '俺の体を ポチタに あげてー んだ…'
    // TEXT BOUNDS: [X: 145, Y: 621, W: 176, H: 113] | BUBBLE BOUNDS: [X: 93, Y: 429, W: 295, H: 332]
    let give_body = res.regions.iter().find(|r| r.text.contains("俺の体") || r.text.contains("あげて"));
    assert!(give_body.is_some(), "Must detect double-lobe lower segment '俺の体を ポチタに あげてー んだ…'");
    let give_body = give_body.unwrap();
    assert!(give_body.text.contains("んだ"), "Lower segment must retain the trailing 'んだ…' column");
    crate::assert_region_bounds!(give_body, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 145, 621, 176, 113, 10);
    crate::assert_bubble_bounds!(give_body, 93, 429, 295, 332, 12);

    // NEGATIVE GUARD: THE TWO LOBES MUST NEVER RE-MERGE INTO ONE CROSS-LOBE MONOLITH.
    assert!(
        !res.regions.iter().any(|r| r.text.contains("できるん") && r.text.contains("あげてー")),
        "Double-lobe balloon must stay two independent utterance regions"
    );

    // 4. TOWN SMALL BUBBLE: 'うん……' (OCR MAY GARBLE THE DOTTED TRAIL; REGION MUST EXIST)
    // TEXT BOUNDS: [X: 177, Y: 1021, W: 63, H: 86] | BUBBLE BOUNDS: [X: 140, Y: 996, W: 114, H: 125]
    let un_ellipsis = res.regions.iter().find(|r| r.box_.x > 130 && r.box_.x < 260 && r.box_.y > 980 && r.box_.y < 1120);
    assert!(un_ellipsis.is_some(), "Must detect town small 'うん……' bubble");
    let un_ellipsis = un_ellipsis.unwrap();
    crate::assert_bubble_bounds!(un_ellipsis, 140, 996, 114, 125, 12);

    // 5. TOWN TINY BUBBLE: 'そんで'
    // TEXT BOUNDS: [X: 341, Y: 998, W: 60, H: 86] | BUBBLE BOUNDS: [X: 311, Y: 979, W: 111, H: 122]
    let sode_small = res.regions.iter().find(|r| r.text.contains("そんで") && r.box_.w < 90);
    assert!(sode_small.is_some(), "Must detect town small standalone bubble 'そんで'");
    let sode_small = sode_small.unwrap();
    crate::assert_region_bounds!(sode_small, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 341, 998, 60, 86, 10);
    crate::assert_bubble_bounds!(sode_small, 311, 979, 111, 122, 12);

    // 6. TOWN LARGE BUBBLE LEFT COLUMN: 'そんで この町を 出て…'
    // TEXT BOUNDS: [X: 507, Y: 987, W: 95, H: 93] | BUBBLE BOUNDS: [X: 481, Y: 873, W: 316, H: 234]
    let leave_town = res.regions.iter().find(|r| r.text.contains("この町") && r.text.contains("出て"));
    assert!(leave_town.is_some(), "Must detect town large bubble left column 'そんで この町を 出て…'");
    let leave_town = leave_town.unwrap();
    crate::assert_region_bounds!(leave_town, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 507, 987, 95, 93, 10);
    crate::assert_bubble_bounds!(leave_town, 481, 873, 316, 234, 12);

    // 7. TOWN LARGE BUBBLE RIGHT COLUMN: '墓入った 後だったら ヤクザも 追ってこない だろ'
    // TEXT BOUNDS: [X: 602, Y: 898, W: 156, H: 135] | BUBBLE BOUNDS: [X: 481, Y: 873, W: 316, H: 234]
    let grave_yakuza = res.regions.iter().find(|r| r.text.contains("ヤクザ") && r.text.contains("追ってこない"));
    assert!(grave_yakuza.is_some(), "Must detect town large bubble right column '墓入った 後だったら ヤクザも 追ってこない だろ'");
    let grave_yakuza = grave_yakuza.unwrap();
    crate::assert_region_bounds!(grave_yakuza, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 602, 898, 156, 135, 10);
    crate::assert_bubble_bounds!(grave_yakuza, 481, 873, 316, 234, 12);

    // 8. BOTTOM-LEFT POCHITA BUBBLE: '普通の 死に方を してほしい'
    // TEXT BOUNDS: [X: 184, Y: 1441, W: 132, H: 146] | BUBBLE BOUNDS: [X: 142, Y: 1409, W: 209, H: 206]
    let normal_death = res.regions.iter().find(|r| r.text.contains("死に方") || r.text.contains("してほしい"));
    assert!(normal_death.is_some(), "Must detect bottom-left Pochita bubble '普通の 死に方を してほしい'");
    let normal_death = normal_death.unwrap();
    crate::assert_region_bounds!(normal_death, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 184, 1441, 132, 146, 10);
    crate::assert_bubble_bounds!(normal_death, 142, 1409, 209, 206, 10);

    // 9. BOTTOM-RIGHT POCHITA BUBBLE: '普通の 暮らしを して'
    // TEXT BOUNDS: [X: 578, Y: 1450, W: 134, H: 132] | BUBBLE BOUNDS: [X: 542, Y: 1409, W: 202, H: 207]
    let normal_life = res.regions.iter().find(|r| r.text.contains("暮らし"));
    assert!(normal_life.is_some(), "Must detect bottom-right Pochita bubble '普通の 暮らしを して'");
    let normal_life = normal_life.unwrap();
    crate::assert_region_bounds!(normal_life, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 578, 1450, 134, 132, 10);
    crate::assert_bubble_bounds!(normal_life, 542, 1409, 202, 207, 10);
}
