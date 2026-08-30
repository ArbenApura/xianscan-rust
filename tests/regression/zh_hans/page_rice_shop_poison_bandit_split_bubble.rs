// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_rice_shop_poison_bandit_split_bubble` (RESOLUTION: 640 × 1503)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **PANEL 1 DIALOGUE BUBBLE**: `"贵兄弟身体中毒应该\n与我米行无关"`
/// - **PANEL 2 UPPER DIALOGUE BUBBLE**: `"你说什——"`
/// - **PANEL 2 LOWER DIALOGUE BUBBLE**: `"不过纵然无关，既来我米\n行处，我何某也不能撒手不管，\n贵兄弟这般痛苦，叫人看得\n于心不忍，还是赶紧去寻\n医问诊为妙"`
/// - **PANEL 3 UPPER BANDIT LOBE**:
///   `"你这黑心老板，\n把我兄弟两人当成打\n家劫舍的绿林盗匪了？"` (DialogueBubble)
/// - **PANEL 3 LOWER BANDIT LOBE**:
///   `"真是岂有此理，我兄弟\n二人行的正坐的直，此生问\n心无愧，倒是你这黑心老板的，\n卖些毒米出来，良心何在？"` (DialogueBubble, strictly NO overlap with upper bandit lines)
/// - **PANEL 3 SHOPKEEPER OFFER BUBBLE**:
///   `"当然，若是两位手头\n紧的话，何某可以替两\n位垫付一下诊金"` (DialogueBubble)
/// - **PANEL 3 RIGHT THOUGHT/REMARK**:
///   `"就这副德行还行的\n正坐的真，此生问心无愧？"` (DialogueBubble)
/// - **PANEL 4 SHOPKEEPER BUBBLE**:
///   `"额，那你们\n想怎么办？"` (DialogueBubble)
/// - **EXACT COUNTS**: Exactly 8 dialogue regions (8 dialogue/thought bubbles, 0 free text).
#[test]
fn test_regression_page_rice_shop_poison_bandit_split_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_rice_shop_poison_bandit_split_bubble.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_rice_shop_poison_bandit_split_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("ZH-Hans Rice Shop Page detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT ELEMENT COUNTS: 8 DIALOGUE BUBBLES
    crate::assert_element_counts!(res, 8, 8, 0);

    // 2. PANEL 3 UPPER BANDIT LOBE (3 LINES)
    let upper_bandit = res.regions.iter().find(|r| r.text.contains("你这黑心老板"));
    assert!(upper_bandit.is_some(), "Must detect panel 3 upper bandit lobe");
    let upper_bandit = upper_bandit.unwrap();
    assert_eq!(upper_bandit.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!upper_bandit.text.contains("岂有此理"), "Upper bandit lobe must NOT contain lower lobe text");
    assert!(upper_bandit.text.contains("绿林盗匪"), "Upper bandit lobe must contain 绿林盗匪");
    crate::assert_region_bounds!(upper_bandit, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 418, 898, 207, 76, 8);
    crate::assert_bubble_bounds!(upper_bandit, 240, 870, 397, 231, 8);

    // 3. PANEL 3 LOWER BANDIT LOBE (4 LINES)
    let lower_bandit = res.regions.iter().find(|r| r.text.contains("岂有此理"));
    assert!(lower_bandit.is_some(), "Must detect panel 3 lower bandit lobe");
    let lower_bandit = lower_bandit.unwrap();
    assert_eq!(lower_bandit.kind, xianscan_rust::ml::schemas::RegionKind::DialogueBubble);
    assert!(!lower_bandit.text.contains("黑心老板，"), "Lower bandit lobe must NOT contain upper lobe start text");
    assert!(!lower_bandit.text.contains("绿林盗匪"), "Lower bandit lobe must NOT contain upper lobe end line '绿林盗匪'");
    assert!(lower_bandit.text.contains("良心何在"), "Lower bandit lobe must contain 良心何在");
    crate::assert_region_bounds!(lower_bandit, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 245, 984, 291, 105, 8);
    crate::assert_bubble_bounds!(lower_bandit, 240, 870, 397, 231, 8);

    // 4. BOUNDING BOX NON-OVERLAP INVARIANT BETWEEN THE TWO BANDIT LOBES
    assert!(
        upper_bandit.box_.y + upper_bandit.box_.h <= lower_bandit.box_.y + 10,
        "Upper bandit typeset box (bottom={}) must NOT vertically overlap lower bandit typeset box (top={})",
        upper_bandit.box_.y + upper_bandit.box_.h,
        lower_bandit.box_.y
    );
}
