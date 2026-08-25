// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_choze_chosen_bloodline_vs_charanko` (RESOLUTION: NATIVE 1373 × 1079 WEBP)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **FULL DOUBLE-SPREAD JAPANESE MANGA PAGE ANALYSIS**:
///   1. MATCH CARDS / INTRODUCTIONS:
///      - `執拗に相手選手の人体破壊を楽しんで勝ち上がってきた`
///      - `選民血脈格闘術 チョゼ選手`
///      - `対` (MIDDLE MATCH SEPARATOR)
///      - `バクザンの三連覇を阻み全試合一撃で勝ち上がってきた`
///      - `“水球炭酸拳” チャランコ選手` (MUST BE UPRIGHT, ZERO ROTATION ANGLE)
///   2. DIALOGUES & BUBBLES ACROSS ALL PANELS:
///      - TOP-LEFT: `初手で仕留めることなど容易い`, `だが私はお前達とは別格だということをわからせるため…`
///      - MIDDLE-LEFT: `私の一族は先祖代々 優秀な遺伝子のみをかけ合わせて作られてきた`, `中でも私は過去最高傑作`, `もはや愚民どもとは全く異なる 新しい種族だ`, `この大会を皮切りに 我が一族の絶大な力を愚民どもに見せつけ ゆくゆくは…`
///      - BOTTOM-LEFT: `世界を支配する`
///      - BOTTOM-RIGHT: `全試合一擊…？`, `くくくっ…`, `スイリューもお前も… 愚民どもはその程度で得意げか`
/// - **ZERO ROTATION ANGLE ON MATCH CARDS**:
///   VERIFIES THAT UPRIGHT MATCH CARD INTRODUCTION BUBBLE `チャランコ選手` DOES NOT HAVE AN ERRONEOUS ROTATION ANGLE (`angle.abs() < 1.5` OR `angle == 0.0`).
/// - **STRICT REGION ACCOUNTING**:
///   ASSERTS EXACT REGIONS COUNT (18 REGIONS INCLUDING SFX / 15 DIALOGUE BUBBLES).
#[test]
fn test_regression_page_choze_chosen_bloodline_vs_charanko() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_choze_chosen_bloodline_vs_charanko/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_choze_chosen_bloodline_vs_charanko: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Double Page Choze vs Charanko Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}, angle={:.2}, kind={:?}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical, r.angle, r.kind);
    }

    // 0. STRICT 18-REGION ACCOUNTING: 15 DIALOGUEBUBBLES, 3 SOUNDEFFECTS, 0 FREETEXT
    crate::assert_element_counts!(res, 18, 15, 3, 0);

    // 1. MATCH CARD 1: CHARANKO ("水球炭酸拳" チャランコ選手)
    let charanko = res.regions.iter().find(|r| r.text.contains("チャランコ") || r.text.contains("水球炭酸拳"));
    assert!(charanko.is_some(), "Must detect Charanko match card '“水球炭酸拳” チャランコ選手'");
    let ch_region = charanko.unwrap();
    crate::assert_region_angle!(ch_region, 0.0, 1.5);
    crate::assert_region_bounds!(ch_region, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 762, 573, 63, 137, 8);
    crate::assert_bubble_bounds!(ch_region, 735, 537, 112, 205, 10);

    // 2. MATCH CARD 2: CHOSEN BLOODLINE CHIYOZE (選民血脈格闘術 チョゼ選手)
    let choze = res.regions.iter().find(|r| r.text.contains("選民") || r.text.contains("チョゼ") || r.text.contains("チヨゼ"));
    assert!(choze.is_some(), "Must detect Choze match card '選民血脈格闘術 チョゼ選手'");
    let cz_region = choze.unwrap();
    crate::assert_region_bounds!(cz_region, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 1135, 547, 61, 145, 8);
    crate::assert_bubble_bounds!(cz_region, 1113, 519, 108, 204, 10);

    // 3. MATCH CARD 3: VS (対)
    let vs = res.regions.iter().find(|r| r.text.trim() == "対" || r.text.contains("対"));
    assert!(vs.is_some(), "Must detect middle match card '対'");
    let vs_region = vs.unwrap();
    crate::assert_region_bounds!(vs_region, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 1019, 572, 53, 39, 8);
    crate::assert_bubble_bounds!(vs_region, 1014, 542, 58, 103, 10);

    // 4. MATCH CARD 4: BAKUZAN THREE-PEAT
    let bakuzan = res.regions.iter().find(|r| r.text.contains("バクザン") || r.text.contains("三連覇") || r.text.contains("一撃"));
    assert!(bakuzan.is_some(), "Must detect Bakuzan match card");
    let bk_region = bakuzan.unwrap();
    crate::assert_region_bounds!(bk_region, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 889, 524, 74, 142, 8);
    crate::assert_bubble_bounds!(bk_region, 871, 491, 101, 204, 10);

    // 5. MATCH CARD 5: OPPONENTS BODY DESTRUCTION
    let body_destroy = res.regions.iter().find(|r| r.text.contains("相手選手") || r.text.contains("人体破壊"));
    assert!(body_destroy.is_some(), "Must detect body destruction match card");
    let bd_region = body_destroy.unwrap();
    crate::assert_region_bounds!(bd_region, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 1263, 538, 73, 141, 8);
    crate::assert_bubble_bounds!(bd_region, 1245, 496, 108, 207, 10);

    // 6. TOP-LEFT: EASY FIRST MOVE
    let first_move = res.regions.iter().find(|r| r.text.contains("初手で") || r.text.contains("仕留める") || r.text.contains("容易い"));
    assert!(first_move.is_some(), "Must detect '初手で仕留めることなど容易い' bubble");
    let fm_region = first_move.unwrap();
    crate::assert_region_bounds!(fm_region, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 538, 141, 67, 148, 8);
    crate::assert_bubble_bounds!(fm_region, 505, 82, 124, 263, 10);

    // 7. TOP-LEFT: DIFFERENT LEVEL EXECUTION
    let diff_level = res.regions.iter().find(|r| r.text.contains("別格") || r.text.contains("わからせる") || r.text.contains("処刑する"));
    assert!(diff_level.is_some(), "Must detect 'だが私はお前達とは別格だということをわからせるため…' bubble");
    let dl_region = diff_level.unwrap();
    crate::assert_region_bounds!(dl_region, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 29, 200, 127, 158, 8);
    crate::assert_bubble_bounds!(dl_region, 15, 134, 154, 273, 10);

    // 8. MID-LEFT: ANCESTRAL GENES
    let genes = res.regions.iter().find(|r| r.text.contains("先祖代々") || r.text.contains("遺伝子") || r.text.contains("優秀な"));
    assert!(genes.is_some(), "Must detect ancestral genes bubble");
    let gn_region = genes.unwrap();
    crate::assert_region_bounds!(gn_region, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 555, 461, 90, 133, 8);
    crate::assert_bubble_bounds!(gn_region, 549, 440, 100, 181, 10);

    // 9. MID-LEFT: GREATEST MASTERPIECE
    let masterpiece = res.regions.iter().find(|r| r.text.contains("最高傑作") || r.text.contains("中でも私は"));
    assert!(masterpiece.is_some(), "Must detect masterpiece bubble");
    let mp_region = masterpiece.unwrap();
    crate::assert_region_bounds!(mp_region, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 414, 576, 56, 108, 8);
    crate::assert_bubble_bounds!(mp_region, 399, 538, 89, 165, 10);

    // 10. MID-LEFT: NEW SPECIES
    let new_species = res.regions.iter().find(|r| r.text.contains("愚民") && (r.text.contains("新しい種族") || r.text.contains("異なる") || r.text.contains("種族")));
    assert!(new_species.is_some(), "Must detect new species bubble");
    let ns_region = new_species.unwrap();
    crate::assert_region_bounds!(ns_region, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 302, 472, 83, 157, 8);
    crate::assert_bubble_bounds!(ns_region, 282, 439, 108, 222, 10);

    // 11. MID-LEFT: START OF TOURNAMENT
    let tournament_start = res.regions.iter().find(|r| r.text.contains("大会を皮切りに") || r.text.contains("絶大な力") || r.text.contains("見せつけ"));
    assert!(tournament_start.is_some(), "Must detect tournament start bubble");
    let ts_region = tournament_start.unwrap();
    crate::assert_region_bounds!(ts_region, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 28, 623, 103, 174, 8);
    crate::assert_bubble_bounds!(ts_region, 5, 589, 142, 215, 10);

    // 12. BOTTOM-LEFT: RULE THE WORLD
    let rule_world = res.regions.iter().find(|r| r.text.contains("世界を") || r.text.contains("支配する"));
    assert!(rule_world.is_some(), "Must detect '世界を支配する' bubble");
    let rw_region = rule_world.unwrap();
    crate::assert_region_bounds!(rw_region, xianscan_rust::ml::schemas::RegionKind::DialogueBubble, 460, 854, 101, 145, 8);
    crate::assert_bubble_bounds!(rw_region, 428, 836, 165, 189, 10);

    // 13. BOTTOM-RIGHT: ALL MATCHES ONE BLOW?
    let one_blow_q = res.regions.iter().find(|r| (r.text.contains("全試合") || r.text.contains("ぜんしあい")) && r.box_.y > 700);
    assert!(one_blow_q.is_some(), "Must detect '全試合' in bottom right bubble");
    let ob_region = one_blow_q.unwrap();
    crate::assert_bubble_bounds!(ob_region, 1170, 768, 150, 206, 10);

    // 14. BOTTOM-RIGHT: KUKUKU WHISPER
    let kukuku = res.regions.iter().find(|r| r.text.contains("くくく") || r.text.contains("くっ") || (r.box_.x >= 1190 && r.box_.x <= 1220 && r.box_.y > 800));
    assert!(kukuku.is_some(), "Must detect 'くくくっ…' whisper bubble");
    let kk_region = kukuku.unwrap();
    crate::assert_bubble_bounds!(kk_region, 1170, 768, 150, 206, 10);

    // 15. BOTTOM-RIGHT: SUIRYU AND YOU TOO (MUST SPAN FULL BUBBLE INTERIOR X: 724..851)
    let suiryu = res.regions.iter().find(|r| r.text.contains("スイリュ") || r.text.contains("スイリュー") || r.text.contains("得意げ"));
    assert!(suiryu.is_some(), "Must detect Suiryu reaction bubble");
    let sy_region = suiryu.unwrap();
    // Verify that the left edge of the bounding box is properly expanded to the left side of the bubble (x <= 730)
    assert!(sy_region.box_.x <= 732, "Suiryu bubble box left coordinate must expand to left edge of bubble (<= 732), got {}", sy_region.box_.x);
    crate::assert_bubble_bounds!(sy_region, 724, 771, 137, 180, 10);

    // 16. SOUND EFFECTS: 3 ACTION ONOMATOPOEIA
    let sfx_count = res.regions.iter().filter(|r| r.kind == xianscan_rust::ml::schemas::RegionKind::SoundEffect).count();
    assert_eq!(sfx_count, 3, "Must detect exactly 3 SFX regions");
}
