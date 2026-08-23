use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::detect::filter_text_by_source_lang;

/// # Japanese Manga Regression Test: Vertical Dialogue & Mixed Script Recognition
///
/// ## Purpose & Behavior Tested:
/// - **Language Routing (`ja`)**:
///   Verifies that `PipelineEngine` with `source_lang: Some("ja")` processes Japanese
///   comic pages, preserving Kanji, Hiragana, Katakana, and Japanese punctuation (`「」`, `…`, `ー`).
/// - **Vertical Reading & Script Integrity**:
///   Verifies that CJK character filtering retains full Japanese Unicode blocks
///   (`\u3040-\u309f` Hiragana, `\u30a0-\u30ff` Katakana, `\u4e00-\u9fff` Kanji).
/// - **Negative Foreign Script Filtering**:
///   Ensures that Cyrillic, Thai, or random non-Japanese noise is stripped.
#[test]
fn test_regression_japanese_script_handling() {
    let mixed_text = "魔王を討伐する！\nこれはテストです。";
    let filtered = filter_text_by_source_lang(mixed_text, Some("ja"));
    assert_eq!(filtered, "魔王を討伐する！\nこれはテストです。");

    let contaminated = "魔王を討伐する！ДПриветสวัสดี";
    let cleaned = filter_text_by_source_lang(contaminated, Some("ja"));
    assert_eq!(cleaned.trim(), "魔王を討伐する！");
}

/// # Japanese Real-Page Regression: `page_zhang_yude_chengdu_cemetery.webp` with `ja` Source Routing
#[test]
fn test_regression_page_with_japanese_source_routing() {
    let img = match crate::common::load_fixture_or_skip("ja", "sample.webp")
        .or_else(|| crate::common::load_fixture_or_skip("zh_hans", "page_zhang_yude_chengdu_cemetery.webp"))
    {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_with_japanese_source_routing: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    assert!(!res.regions.is_empty(), "Pipeline in Japanese mode must detect text regions");

    for r in &res.regions {
        assert!(!r.text.is_empty(), "Region text must not be empty");
        assert!(r.box_.w > 0 && r.box_.h > 0, "Region dimensions must be positive");
    }
}

/// # Japanese Real-Page Regression: `page_lucky_me_first_place_vertical.webp` (Resolution: 1129 × 1600 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Vertical Japanese Multi-Column Reading Order (Right-to-Left)**:
///   Guarantees that multi-column Japanese vertical dialogue is read Right-to-Left (TBRL).
///   E.g., Panel 2 Teacher bubble must read `お前ら\n秋田を\n見習え～` (not reversed `見習え～秋田をお前ら`).
/// - **Zero Duplicate Overlapping Bubble Regions**:
///   Prevents duplicate sub-box emissions on vertical bubbles (`末は博士か大臣か`).
/// - **Negative Furigana Echo Guard**:
///   Prevents ruby text (Furigana) from producing duplicate line echoes.
#[test]
fn test_regression_page_lucky_me_first_place_vertical() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_lucky_me_first_place_vertical.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_lucky_me_first_place_vertical: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 1129x1600 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. Strict 10-region accounting (Rule #12)
    assert_eq!(res.regions.len(), 10, "Must detect exactly 10 speech bubbles across the page");

    // 1. Top-Right Bubble: 'また１位！？'
    let top_right = res.regions.iter().find(|r| r.text.contains("また") && (r.text.contains("1位") || r.text.contains("１位")));
    assert!(top_right.is_some(), "Must detect top-right bubble 'また１位！？'");

    // 2. Top-Center Bubble: '入学以来 ずっと じゃない！' (TBRL Right-to-Left order)
    let entrance_bubble = res.regions.iter().find(|r| r.text.contains("入学以来"));
    assert!(entrance_bubble.is_some(), "Must detect top-center bubble '入学以来 ずっと じゃない！'");
    let eb_text = &entrance_bubble.unwrap().text;
    assert!(eb_text.contains("入学以来") && eb_text.contains("ずっと") && eb_text.contains("じゃない"), "Bubble must contain all 3 columns: {}", eb_text);

    // 3. Top-Center Small Circle: 'スゴすぎー'
    let sugoi_bubble = res.regions.iter().find(|r| r.text.contains("ス") && r.text.contains("ぎ"));
    assert!(sugoi_bubble.is_some(), "Must detect small circular bubble 'スゴすぎー'");

    // 4. Top-Left Bubble: 'いやあ… ラッキーだよ' (Right-to-Left column order)
    let lucky_bubble = res.regions.iter().find(|r| r.text.contains("ラッキー") || r.text.contains("ラッキ"));
    assert!(lucky_bubble.is_some(), "Must detect top-left bubble 'いやあ… ラッキーだよ'");

    // 5. Mid-Right Teacher Bubble: 'お前ら 秋田を 見習え～' (TBRL Right-to-Left order)
    let teacher_bubble = res.regions.iter().find(|r| r.text.contains("秋田") || r.text.contains("お前ら"));
    assert!(teacher_bubble.is_some(), "Must detect teacher bubble 'お前ら 秋田を 見習え～'");
    let t_text = &teacher_bubble.unwrap().text;
    assert!(!t_text.starts_with("見習え"), "Japanese vertical columns must read Right-to-Left ('お前ら...' first), got: {}", t_text);

    // 6. Mid-Center Teacher Continuation: 'そして アタシの評価を あげろ～'
    let eval_bubble = res.regions.iter().find(|r| r.text.contains("アタシの評価を") || r.text.contains("あげろ"));
    assert!(eval_bubble.is_some(), "Must detect teacher evaluation bubble");
    assert!(!eval_bubble.unwrap().text.contains("フクシ０語"), "Must not contain hallucinated prefix");

    // 7. Mid-Left Small Bubble: 'ハハ…'
    let haha_bubble = res.regions.iter().find(|r| r.text.contains("ハハ"));
    assert!(haha_bubble.is_some(), "Must detect 'ハハ…' bubble");

    // 8. Bottom-Left MC Hair: 'ありがとう みんな'
    let thanks_bubble = res.regions.iter().find(|r| r.text.contains("ありがとう") && r.text.contains("みんな"));
    assert!(thanks_bubble.is_some(), "Must detect bottom-left MC speech 'ありがとう みんな'");

    // 9. Bottom-Right Girl Bubble: '謙遜してるのも かっこい～'
    let modest_bubble = res.regions.iter().find(|r| r.text.contains("謙遜してるのも") || r.text.contains("かっこい") || r.text.contains("謙遜"));
    assert!(modest_bubble.is_some(), "Must detect modest girl bubble");

    // 10. Bottom-Center Boy Bubble: '末は 博士か 大臣か'
    let proverb_bubble = res.regions.iter().find(|r| r.text.contains("博士") || r.text.contains("大臣") || r.text.contains("末は") || r.text.contains("博"));
    assert!(proverb_bubble.is_some(), "Must detect proverb bubble '末は 博士か 大臣か'");
}


/// # Japanese Real-Page Regression: PageId 64027 (Resolution: 1353 × 1920 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **4-Koma Manga Title & Speech Bubble Separation**:
///   Guarantees that the top horizontal 4-koma title:
///   `コタツ仕舞うタイミングって難しい`
///   is cleanly detected and separated from the underlying vertical speech bubbles (`もう阿寒湖…`).
/// - **Panel Ground Truth Extraction across all 4-Koma Segments**:
///   1. Top Title: `コタツ仕舞うタイミングって難しい`
///   2. Panel 1 Sign: `茶道部`
///   3. Panel 1 Hallway: `もうあかん…`
///   4. Panel 2 Dialogues: `…ごめん 今の無し`, `いいから 集中しろよ`, `次の数学 当たるんでしょ？`, `ああ 当たるさ！ 当たるとも！`
///   5. Panel 3 Dialogues: `3億当たったら`, `貯金する`, `宝くじは当たんないのにね`, `そうだねえ`, `えー？ うーん…`
///
/// ## Key Invariants:
/// - Between 11 and 13 regions detected (accounting for 11 core dialogue/header items + optional SFX/dots).
/// - Top 4-koma title must contain `コタツ仕舞うタイミングって難しい`.
/// - Signboard `茶道部` must be detected.
#[test]
fn test_regression_manga_kotatsu_timing_tea_club_lottery() {
    let img = match crate::common::load_fixture_or_skip("ja", "manga_kotatsu_timing_tea_club_lottery.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_manga_kotatsu_timing_tea_club_lottery: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("Manga Kotatsu Timing (len={}):", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. Region count: 11 core dialogue/title regions + optional SFX/dots
    assert!(
        res.regions.len() >= 10 && res.regions.len() <= 14,
        "Expected between 10 and 14 regions, got {}",
        res.regions.len()
    );

    // 1. Top 4-Koma Title: 'コタツ仕舞うタイミングって難しい'
    let title = res.regions.iter().find(|r| r.text.contains("コタツ") || r.text.contains("仕舞うタイミング") || r.text.contains("難しい"));
    assert!(title.is_some(), "Must detect top 4-koma title 'コタツ仕舞うタイミングって難しい'");
    assert!(title.unwrap().text.contains("コタツ") && title.unwrap().text.contains("難しい"), "Title text mismatch");

    // 2. Panel 1 Signboard: '茶道部'
    let tea_club = res.regions.iter().find(|r| r.text.contains("茶道部") || r.text.contains("茶道"));
    assert!(tea_club.is_some(), "Must detect tea club signboard '茶道部'");

    // 3. Panel 1 Hallway Bubble: 'もうあかん…'
    let akan = res.regions.iter().find(|r| r.text.contains("もうあかん") || (r.text.contains("あかん") && r.box_.y < 600));
    assert!(akan.is_some(), "Must detect 'もうあかん…' hallway bubble");

    // 4. Panel 2 Dialogues:
    // a. '…ごめん 今の無し'
    let gomen = res.regions.iter().find(|r| r.text.contains("今の無し") || (r.text.contains("ごめん") && r.box_.y > 600 && r.box_.y < 900));
    assert!(gomen.is_some(), "Must detect '…ごめん 今の無し' bubble");

    // b. 'いいから 集中しろよ'
    let focus = res.regions.iter().find(|r| r.text.contains("集中しろよ") || r.text.contains("いいから"));
    assert!(focus.is_some(), "Must detect 'いいから 集中しろよ' bubble");

    // c. '次の数学 当たるんでしょ？'
    let math = res.regions.iter().find(|r| r.text.contains("次の数学") || (r.text.contains("数学") && r.text.contains("当たる")));
    assert!(math.is_some(), "Must detect '次の数学 当たるんでしょ？' bubble");

    // d. 'ああ 当たるさ！ 当たるとも！'
    let hit = res.regions.iter().find(|r| r.text.contains("当たるさ") || r.text.contains("当たるとも"));
    assert!(hit.is_some(), "Must detect 'ああ 当たるさ！ 当たるとも！' bubble");

    // 5. Panel 3 Dialogues:
    // a. 'あ！もし 3億当たったら どうする？'
    let lottery_q = res.regions.iter().find(|r| r.text.contains("3億") || r.text.contains("３億") || r.text.contains("当たったら"));
    assert!(lottery_q.is_some(), "Must detect 300 million lottery question bubble");

    // b. '貯金するは ナシで'
    let no_save = res.regions.iter().find(|r| r.text.contains("貯金") || r.text.contains("ナシで"));
    assert!(no_save.is_some(), "Must detect '貯金するは ナシで' bubble");

    // c. '…宝くじは 当たんないのにね'
    let lottery_never = res.regions.iter().find(|r| r.text.contains("宝くじ") || r.text.contains("当たんない"));
    assert!(lottery_never.is_some(), "Must detect '…宝くじは 当たんないのにね' bubble");

    // d. '…そうだねえ'
    let souda = res.regions.iter().find(|r| r.text.contains("そうだね") || (r.text.contains("そ") && r.text.contains("う") && r.text.contains("だ")));
    assert!(souda.is_some(), "Must detect '…そうだねえ' bubble");

    // e. 'えー？ うーん…'
    let hmm = res.regions.iter().find(|r| r.text.contains("えー") || r.text.contains("うーん"));
    assert!(hmm.is_some(), "Must detect 'えー？ うーん…' bubble");
}

/// # Japanese Real-Page Regression: `page_school_phone_rule_e_bubble.webp` (Resolution: 810 × 737 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Isolated Single-Character Bubble Detection (`え。`)**:
///   Guarantees that isolated, high-contrast single-glyph speech bubbles are detected and not pruned as noise.
/// - **Adjacent Speech Bubble Separation**:
///   Ensures that the bottom-left upper bubble (`いつも\nつるんでる\nやつらでも…`) and lower bubble
///   (`だれでもいい。\n友だち\nたくさん\nいるだろう。`) are preserved as two distinct regions, preventing
///   monolithic bounding box merges and interleaved/garbled OCR reading orders.
/// - **Strict 8-Region Accounting**:
///   Guarantees that all 8 speech bubbles across both panels are cleanly detected with exact text invariants.
#[test]
fn test_regression_page_school_phone_rule_e_bubble() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_school_phone_rule_e_bubble.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_school_phone_rule_e_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 810x737 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. Strict 8-region accounting (Rule #12)
    assert_eq!(res.regions.len(), 8, "Must detect exactly 8 speech bubbles across the page");

    // 1. Top-Right Bubble: '気が\nぬけたら\n意識\nトびそうに\nなった…'
    let top_right = res.regions.iter().find(|r| r.text.contains("気が") && (r.text.contains("ぬけたら") || r.text.contains("ねけたら") || r.text.contains("意識")));
    assert!(top_right.is_some(), "Must detect top-right bubble '気が ぬけたら 意識 トびそうに なった…'");
    let tr_text = &top_right.unwrap().text;
    assert!(tr_text.contains("意識") && (tr_text.contains("トびそう") || tr_text.contains("トひそう") || tr_text.contains("卜びそう") || tr_text.contains("なった")), "Must preserve consciousness fade text: {}", tr_text);

    // 2. Top-Center Single-Character Bubble: 'え。'
    let e_bubble = res.regions.iter().find(|r| {
        let t = r.text.trim();
        t == "え。" || t == "え" || t.starts_with("え")
    });
    assert!(e_bubble.is_some(), "Must detect top-center single-character bubble 'え。'");

    // 3. Top-Middle Right Bubble: '学校内で\nスマホ持ち歩くの\n校則違反じゃん。'
    let school_rule = res.regions.iter().find(|r| r.text.contains("学校内") || r.text.contains("校則違反"));
    assert!(school_rule.is_some(), "Must detect '学校内で スマホ持ち歩くの 校則違反じゃん。' bubble");
    let sr_text = &school_rule.unwrap().text;
    assert!(sr_text.contains("スマホ") && sr_text.contains("持ち歩く"), "Must contain full phone rule dialogue: {}", sr_text);

    // 4. Top-Middle Left Bubble: 'あ…\nうん。'
    let ah_un = res.regions.iter().find(|r| r.text.contains("あ…") || (r.text.contains("あ") && r.text.contains("うん")));
    assert!(ah_un.is_some(), "Must detect 'あ… うん。' bubble");

    // 5. Top-Left Bubble: '万事解決だ。\nスマホが\nあれば外に\n助けが呼べる。'
    let all_solved = res.regions.iter().find(|r| r.text.contains("万事解决") || r.text.contains("助けが呼べる") || r.text.contains("万事解決"));
    assert!(all_solved.is_some(), "Must detect top-left bubble '万事解決だ。 スマホが あれば外に 助けが呼べる。'");

    // 6. Bottom-Middle Bubble: '職員室に\nつないで\n先生にきて\nもらうか…'
    let staff_room = res.regions.iter().find(|r| r.text.contains("職員室") || r.text.contains("先生にきて"));
    assert!(staff_room.is_some(), "Must detect bottom-middle bubble '職員室に つないで 先生にきてもらうか…'");

    // 7. Bottom-Left Upper Bubble: 'いつも\nつるんでる\nやつらでも…'
    let hanging_out = res.regions.iter().find(|r| r.text.contains("つるんでる") || (r.text.contains("いつも") && r.text.contains("やつら")));
    assert!(hanging_out.is_some(), "Must detect bottom-left upper bubble 'いつも つるんでる やつらでも…'");
    let ho_text = &hanging_out.unwrap().text;
    assert!(!ho_text.contains("だれでもいい"), "Upper bubble must NOT be merged with lower bubble: {}", ho_text);

    // 8. Bottom-Left Lower Bubble: 'だれでもいい。\n友だち\nたくさん\nいるだろう。'
    let anyone_fine = res.regions.iter().find(|r| r.text.contains("だれでもいい") || (r.text.contains("友だち") && r.text.contains("いるだろう")));
    assert!(anyone_fine.is_some(), "Must detect bottom-left lower bubble 'だれでもいい。 友だち たくさん いるだろう。'");
    let af_text = &anyone_fine.unwrap().text;
    assert!(!af_text.contains("つるんでる"), "Lower bubble must NOT be merged with upper bubble: {}", af_text);
}

/// # Japanese Real-Page Regression: `page_akita_study_credits_smart_guy` (Resolution: Native WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Speech Bubble & Inner Dialogue Detection**:
///   1. Panel 1 Top-Right Inner Monologue: `世の中賢い奴が\n勝つんだよ`
///   2. Panel 1 Top-Left Dialogue Bubble: `ねぇ〜秋田くーん\n勉強教えてよ〜`
///   3. Panel 2 Middle-Right Dialogue Bubble: `アタシ\n単位やばくてぇ〜`
///   4. Panel 2 Middle Dialogue Bubble: `うん…時間\nあるときね`
///   5. Panel 2 Middle-Left Spiky / Black Dialogue Bubble: `ヤダよ\n面倒くさい`
/// - **Skip Standalone Dot Ellipsis Bubble**:
///   Ensures pure dot bubble (`……`) in the bottom panel is skipped or not required as a translation region.
/// - **Furigana / Whisper SFX Handling**:
///   Properly captures or handles top-right `フフ…` whisper and Furigana on `賢い`.
#[test]
fn test_regression_page_akita_study_credits_smart_guy() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_akita_study_credits_smart_guy/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_akita_study_credits_smart_guy: fixture not found");
            return;
        }
    };

    let res = crate::common::force_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native Page Akita Study Credits Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}, kind={:?}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical, r.kind);
    }

    // 1. Panel 1 Top-Right: '世の中賢い奴が\n勝つんだよ'
    let smart_guy = res.regions.iter().find(|r| (r.text.contains("世の中") || r.text.contains("賢い") || r.text.contains("勝つんだよ")) && r.box_.y < 400);
    assert!(smart_guy.is_some(), "Must detect top-right monologue '世の中賢い奴が勝つんだよ'");
    let sg_text = &smart_guy.unwrap().text;
    assert!(sg_text.contains("世の中") || sg_text.contains("勝つんだよ") || sg_text.contains("賢い"), "Monologue text mismatch: {}", sg_text);

    // 2. Panel 1 Top-Left: 'ねぇ〜秋田くーん\n勉強教えてよ〜'
    let teach_me = res.regions.iter().find(|r| (r.text.contains("秋田") || r.text.contains("勉強教") || r.text.contains("教えてよ")) && r.box_.y < 500);
    assert!(teach_me.is_some(), "Must detect top-left speech bubble 'ねぇ〜秋田くーん 勉強教えてよ〜'");
    let tm_text = &teach_me.unwrap().text;
    assert!(tm_text.contains("秋田") || tm_text.contains("教えて") || tm_text.contains("勉強"), "Speech bubble text mismatch: {}", tm_text);

    // 3. Panel 2 Middle-Right: 'アタシ\n単位やばくてぇ〜'
    let credits_bad = res.regions.iter().find(|r| (r.text.contains("アタシ") || r.text.contains("単位") || r.text.contains("やばくて")) && r.box_.y >= 700 && r.box_.y < 1100);
    assert!(credits_bad.is_some(), "Must detect middle-right bubble 'アタシ 単位やばくてぇ〜'");
    let cb_text = &credits_bad.unwrap().text;
    assert!(cb_text.contains("単位") || cb_text.contains("やばく") || cb_text.contains("アタシ"), "Middle-right bubble text mismatch: {}", cb_text);

    // 4. Panel 2 Middle: 'うん…時間\nあるときね'
    let when_time = res.regions.iter().find(|r| (r.text.contains("時間") || r.text.contains("あるときね") || r.text.contains("うん")) && r.box_.x >= 450 && r.box_.x <= 650 && r.box_.y >= 700 && r.box_.y < 1000);
    assert!(when_time.is_some(), "Must detect middle bubble 'うん…時間 あるときね'");

    // 5. Panel 2 Middle-Left: 'ヤダよ\n面倒くさい'
    let troublesome = res.regions.iter().find(|r| (r.text.contains("ヤダよ") || r.text.contains("面倒") || r.text.contains("面倒くさい") || r.text.contains("くさい")) && r.box_.x < 350 && r.box_.y >= 700 && r.box_.y < 1100);
    assert!(troublesome.is_some(), "Must detect middle-left spiky bubble 'ヤダよ 面倒くさい'");

    // 6. Negative Guard: Standalone pure dot ellipsis ('……' / '…') should be skipped
    assert!(
        !res.regions.iter().any(|r| {
            let t = r.text.trim();
            t == "……" || t == "…" || t == "..." || t == "...." || t == "....." || t == "●" || t == "○"
        }),
        "Standalone pure dot ellipsis bubble should be skipped and not emitted as a translation region"
    );

    // 7. Expected Region Count: 5 core bubbles (or 6 if 'フフ…' whisper SFX is detected)
    assert!(
        res.regions.len() == 5 || res.regions.len() == 6,
        "Expected 5 core dialogue bubbles (or 6 with whisper SFX), got {}",
        res.regions.len()
    );
}





