// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_sage_reincarnation_class_change` (RESOLUTION: 960 × 1903 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **GHOST FURIGANA / SUB-BOX ECHO DEDUPLICATION (`いち どしょくぎょう / やいい`)**:
///   PREVENTS A SPURIOUS DUPLICATE GHOST SUB-BOX FROM SPAWNING INSIDE THE TOP-LEFT DIALOGUE BOX
///   (`そしてどのような方法で...`) DUE TO OVERLAPPING OCR LINES ON VERTICAL FURIGANA.
/// - **COMPOSITE / MULTI-UTTERANCE DIALOGUE AND NARRATION INTEGRITY**:
///   ENSURES ALL 11 DIALOGUE BUBBLES AND 7 FREE-TEXT NARRATION REGIONS (INCLUDING STEPPED TABS,
///   SHARED BUBBLES, AND RUNNING HEADERS) ARE CLEANLY ISOLATED WITHOUT GHOST FRAGMENTS.
/// - **STRICT 18-REGION STRUCTURAL ACCOUNTING**:
///   EXACTLY 11 DIALOGUE BUBBLES, 0 SFX, AND 7 FREE TEXT.
#[test]
fn test_regression_page_sage_reincarnation_class_change() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_sage_reincarnation_class_change/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_sage_reincarnation_class_change: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 960x1903 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. NEGATIVE GUARDS AGAINST GHOST SUB-BOX FRAGMENTS
    assert!(
        !res.regions.iter().any(|r| {
            let t = r.text.trim();
            (t == "いち どしょくぎょう" || t == "やいい" || (t.contains("しょくぎょう") && r.box_.w < 70)) && r.box_.y > 150 && r.box_.y < 350 && r.box_.x > 300 && r.box_.x < 400
        }),
        "Must eliminate duplicate ghost sub-box ('いち どしょくぎょう' / 'やいい') inside top-left dialogue"
    );

    // 1. TOP-RIGHT FREE TEXT NARRATION: 'この転職方法は\n『BBO』にもあった'
    let top_right_free = res.regions.iter().find(|r| r.text.contains("転職方法") && r.text.contains("BBO") && r.box_.y < 300);
    assert!(top_right_free.is_some(), "Must detect top-right free text narration 'この転職方法は...BBO'");
    let top_right_free = top_right_free.unwrap();
    crate::assert_region_bounds!(top_right_free, xianscan_rust::ml::schemas::RegionKind::FreeText, 859, 70, 69, 196, 15);

    // 2. TOP-MIDDLE FREE TEXT NARRATION: 'とても手軽なのだが\n致命的な欠点がある'
    let top_mid_free = res.regions.iter().find(|r| r.text.contains("手軽") || r.text.contains("致命的") || r.text.contains("欠点"));
    assert!(top_mid_free.is_some(), "Must detect top-middle free text narration 'とても手軽なのだが...欠点がある'");
    let top_mid_free = top_mid_free.unwrap();
    crate::assert_region_bounds!(top_mid_free, xianscan_rust::ml::schemas::RegionKind::FreeText, 546, 100, 69, 198, 15);

    // 3. TOP-LEFT UPPER DIALOGUE BUBBLE: 'そしてどのような方法で\n職業を得ようと一度職業を\n決めたら最後'
    let top_left_upper = res.regions.iter().find(|r| r.text.contains("どのような方法") || (r.text.contains("職業を") && r.text.contains("決めたら最後")));
    assert!(top_left_upper.is_some(), "Must detect top-left upper dialogue 'そしてどのような方法で...決めたら最後'");
    let top_left_upper = top_left_upper.unwrap();
    crate::assert_region_bounds!(top_left_upper, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 284, 92, 130, 311, 15);

    // 4. TOP-RIGHT DIALOGUE BUBBLE: '職業を自分で\n選ぶことができず'
    let top_right_bubble = res.regions.iter().find(|r| r.text.contains("自分で") || r.text.contains("選ぶことが"));
    assert!(top_right_bubble.is_some(), "Must detect top-right dialogue '職業を自分で 選ぶことができず'");
    let top_right_bubble = top_right_bubble.unwrap();
    crate::assert_region_bounds!(top_right_bubble, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 834, 323, 94, 212, 15);

    // 5. TOP-MIDDLE TAB BUBBLE: 'しかも'
    let shika_mo = res.regions.iter().find(|r| r.text.trim() == "しかも");
    assert!(shika_mo.is_some(), "Must detect top-middle tab 'しかも'");
    let shika_mo = shika_mo.unwrap();
    crate::assert_region_bounds!(shika_mo, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 668, 348, 33, 75, 15);

    // 6. TOP-MIDDLE MAIN BUBBLE: '得られる職業の\nほとんどが性能の低い\n「基本職」なのだ'
    let basic_class_narration = res.regions.iter().find(|r| r.text.contains("基本職") && r.text.contains("ほとんど") && r.box_.y < 650);
    assert!(basic_class_narration.is_some(), "Must detect top-middle main bubble '得られる職業のほとんどが...'");
    let basic_class_narration = basic_class_narration.unwrap();
    crate::assert_region_bounds!(basic_class_narration, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 537, 397, 101, 221, 15);

    // 7. TOP-LEFT LOWER DIALOGUE BUBBLE: '二度と\n転職はできない'
    let top_left_lower = res.regions.iter().find(|r| (r.text.contains("二度と") || r.text.contains("一度と") || r.text.contains("にと")) && r.text.contains("転職はできない"));
    assert!(top_left_lower.is_some(), "Must detect top-left lower dialogue '二度と 転職はできない'");
    let top_left_lower = top_left_lower.unwrap();
    crate::assert_region_bounds!(top_left_lower, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 167, 380, 85, 183, 15);

    // 8. MIDDLE-RIGHT FREE TEXT NARRATION: 'そのため\n「BBO」では\nもうひとつの方法が\n基本中の基本と\nされていた'
    let mid_right_bbo = res.regions.iter().find(|r| r.text.contains("基本中の基本") || (r.text.contains("そのため") && r.text.contains("BBO")));
    assert!(mid_right_bbo.is_some(), "Must detect middle-right free text 'そのため「BBO」では...'");
    let mid_right_bbo = mid_right_bbo.unwrap();
    crate::assert_region_bounds!(mid_right_bbo, xianscan_rust::ml::schemas::RegionKind::FreeText, 714, 678, 181, 237, 15);

    // 9. MIDDLE-LEFT FREE TEXT NARRATION: 'それが\n王都大教会で\n転職する方法だ'
    let mid_left_church = res.regions.iter().find(|r| (r.text.contains("大教会") || r.text.contains("教会")) && r.box_.y < 900);
    assert!(mid_left_church.is_some(), "Must detect middle-left free text 'それが王都大教会で転職する方法だ'");
    let mid_left_church = mid_left_church.unwrap();
    crate::assert_region_bounds!(mid_left_church, xianscan_rust::ml::schemas::RegionKind::FreeText, 231, 700, 110, 187, 15);

    // 10. LOWER-MIDDLE RIGHT DIALOGUE BUBBLE: '王都の大教会なら\n基本職とは\n比べものにならない\n性能を誇る'
    let lower_mid_church = res.regions.iter().find(|r| (r.text.contains("大教会なら") || r.text.contains("比べものにならない")) && r.box_.y > 900);
    assert!(lower_mid_church.is_some(), "Must detect lower-middle right dialogue '王都の大教会なら...'");
    let lower_mid_church = lower_mid_church.unwrap();
    crate::assert_region_bounds!(lower_mid_church, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 789, 994, 134, 208, 15);

    // 11. LOWER-MIDDLE LEFT DIALOGUE BUBBLE: '「上位職」を\n得ることが\nできる'
    let high_class = res.regions.iter().find(|r| r.text.contains("上位職") || r.text.contains("得ることが"));
    assert!(high_class.is_some(), "Must detect lower-middle left dialogue '「上位職」を得ることができる'");
    let high_class = high_class.unwrap();
    crate::assert_region_bounds!(high_class, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 338, 1043, 138, 206, 15);

    // 12. BOTTOM-RIGHT NARRATION STEM: 'だから俺は'
    let dakara_ore = res.regions.iter().find(|r| r.text.contains("だから俺は") || r.text.contains("だから"));
    assert!(dakara_ore.is_some(), "Must detect bottom-right narration 'だから俺は'");
    let dakara_ore = dakara_ore.unwrap();
    crate::assert_region_bounds!(dakara_ore, xianscan_rust::ml::schemas::RegionKind::FreeText, 832, 1403, 36, 120, 15);

    // 13. BOTTOM RUNNING TITLE (HEADER): '異世界賢者の転生無双 1'
    let header_title = res.regions.iter().find(|r| r.text.contains("異世界賢者") || r.text.contains("転生無双"));
    assert!(header_title.is_some(), "Must detect bottom running title '異世界賢者の転生無双 1'");
    let header_title = header_title.unwrap();
    crate::assert_region_bounds!(header_title, xianscan_rust::ml::schemas::RegionKind::FreeText, 55, 1399, 323, 46, 15);

    // 14. BOTTOM-RIGHT VERTICAL NARRATION: '絶対に「成人の儀式」を\n受けずにこの村を\n出なければならない'
    let adult_ceremony = res.regions.iter().find(|r| r.text.contains("成人の儀式") || r.text.contains("出なければならない"));
    assert!(adult_ceremony.is_some(), "Must detect bottom-right vertical narration '絶対に成人の儀式を...'");
    let adult_ceremony = adult_ceremony.unwrap();
    crate::assert_region_bounds!(adult_ceremony, xianscan_rust::ml::schemas::RegionKind::FreeText, 683, 1655, 101, 224, 15);

    // 15. BOTTOM-LEFT BUBBLE 1 UPPER UTTERANCE: '儀式は受けない」'
    let bubble1_upper = res.regions.iter().find(|r| r.text.contains("儀式は受けない") || r.text.contains("受けない"));
    assert!(bubble1_upper.is_some(), "Must detect bottom-left bubble 1 upper utterance '儀式は受けない'");
    let bubble1_upper = bubble1_upper.unwrap();
    crate::assert_region_bounds!(bubble1_upper, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 587, 1465, 46, 180, 15);

    // 16. BOTTOM-LEFT BUBBLE 1 LOWER UTTERANCE: 'それを聞いたら\n父さんは喜ぶかも\nしれないけど…'
    let bubble1_lower = res.regions.iter().find(|r| r.text.contains("父さん") || r.text.contains("喜ぶかも"));
    assert!(bubble1_lower.is_some(), "Must detect bottom-left bubble 1 lower utterance 'それを聞いたら 父さんは喜ぶかも...'");
    let bubble1_lower = bubble1_lower.unwrap();
    crate::assert_region_bounds!(bubble1_lower, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 484, 1625, 88, 160, 15);

    // 17. BOTTOM-LEFT BUBBLE 2 UPPER UTTERANCE: '…本当にそれで\nいいのかい？'
    let bubble2_upper = res.regions.iter().find(|r| r.text.contains("本当にそれで") || r.text.contains("いいのかい"));
    assert!(bubble2_upper.is_some(), "Must detect bottom-left bubble 2 upper utterance '…本当にそれで いいのかい？'");
    let bubble2_upper = bubble2_upper.unwrap();
    crate::assert_region_bounds!(bubble2_upper, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 180, 1508, 66, 157, 15);

    // 18. BOTTOM-LEFT BUBBLE 2 LOWER UTTERANCE: '一生ノービスで過ごす\nことになるんだよ？'
    let bubble2_lower = res.regions.iter().find(|r| r.text.contains("ノービス") || r.text.contains("過ごすことになる"));
    assert!(bubble2_lower.is_some(), "Must detect bottom-left bubble 2 lower utterance '一生ノービスで過ごすことになるんだよ？'");
    let bubble2_lower = bubble2_lower.unwrap();
    crate::assert_region_bounds!(bubble2_lower, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 89, 1656, 76, 220, 15);

    // 19. STRICT 18-REGION ACCOUNTING (11 DIALOGUE BUBBLES, 0 SFX, 7 FREE TEXT)
    crate::assert_element_counts!(res, 18, 11, 0, 7);
}
