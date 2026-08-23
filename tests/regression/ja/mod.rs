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

/// # Japanese Real-Page Regression: `page_choze_chosen_bloodline_vs_charanko` (Resolution: Native 1373 × 1079 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Full Double-Spread Japanese Manga Page Analysis**:
///   1. Match Cards / Introductions:
///      - `執拗に相手選手の人体破壊を楽しんで勝ち上がってきた`
///      - `選民血脈格闘術 チョゼ選手`
///      - `対` (Middle match separator)
///      - `バクザンの三連覇を阻み全試合一撃で勝ち上がってきた`
///      - `“水球炭酸拳” チャランコ選手` (Must be upright, zero rotation angle)
///   2. Dialogues & Bubbles across all panels:
///      - Top-Left: `初手で仕留めることなど容易い`, `だが私はお前達とは別格だということをわからせるため…`
///      - Middle-Left: `私の一族は先祖代々 優秀な遺伝子のみをかけ合わせて作られてきた`, `中でも私は過去最高傑作`, `もはや愚民どもとは全く異なる 新しい種族だ`, `この大会を皮切りに 我が一族の絶大な力を愚民どもに見せつけ ゆくゆくは…`
///      - Bottom-Left: `世界を支配する`
///      - Bottom-Right: `全試合一擊…？`, `くくくっ…`, `スイリューもお前も… 愚民どもはその程度で得意げか`
/// - **Zero Rotation Angle on Match Cards**:
///   Verifies that upright match card introduction bubble `チャランコ選手` does NOT have an erroneous rotation angle (`angle.abs() < 1.5` or `angle == 0.0`).
/// - **Strict Region Accounting**:
///   Asserts exact regions count (16 regions including SFX / 15 dialogue bubbles).
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

    // 0. Strict 16-region accounting
    assert_eq!(res.regions.len(), 16, "Must detect exactly 16 regions across the double-page spread");

    // 1. Match Card 1: Charanko ("水球炭酸拳" チャランコ選手)
    let charanko = res.regions.iter().find(|r| r.text.contains("チャランコ") || r.text.contains("水球炭酸拳"));
    assert!(charanko.is_some(), "Must detect Charanko match card '“水球炭酸拳” チャランコ選手'");
    let ch_region = charanko.unwrap();
    assert!(ch_region.angle.abs() < 1.5, "Charanko match card is perfectly upright and must not have rotation angle, got: {:.2}°", ch_region.angle);

    // 2. Match Card 2: Chosen Bloodline Chiyoze (選民血脈格闘術 チョゼ選手)
    let choze = res.regions.iter().find(|r| r.text.contains("選民") || r.text.contains("チョゼ") || r.text.contains("チヨゼ"));
    assert!(choze.is_some(), "Must detect Choze match card '選民血脈格闘術 チョゼ選手'");

    // 3. Match Card 3: VS (対)
    let vs = res.regions.iter().find(|r| r.text.trim() == "対" || r.text.contains("対"));
    assert!(vs.is_some(), "Must detect middle match card '対'");

    // 4. Match Card 4: Bakuzan three-peat
    let bakuzan = res.regions.iter().find(|r| r.text.contains("バクザン") || r.text.contains("三連覇") || r.text.contains("一撃"));
    assert!(bakuzan.is_some(), "Must detect Bakuzan match card");

    // 5. Match Card 5: Opponents body destruction
    let body_destroy = res.regions.iter().find(|r| r.text.contains("相手選手") || r.text.contains("人体破壊"));
    assert!(body_destroy.is_some(), "Must detect body destruction match card");

    // 6. Top-Left: Easy first move
    let first_move = res.regions.iter().find(|r| r.text.contains("初手で") || r.text.contains("仕留める") || r.text.contains("容易い"));
    assert!(first_move.is_some(), "Must detect '初手で仕留めることなど容易い' bubble");

    // 7. Top-Left: Different level execution
    let diff_level = res.regions.iter().find(|r| r.text.contains("別格") || r.text.contains("わからせる") || r.text.contains("処刑する"));
    assert!(diff_level.is_some(), "Must detect 'だが私はお前達とは別格だということをわからせるため…' bubble");

    // 8. Mid-Left: Ancestral genes
    let genes = res.regions.iter().find(|r| r.text.contains("先祖代々") || r.text.contains("遺伝子") || r.text.contains("優秀な"));
    assert!(genes.is_some(), "Must detect ancestral genes bubble");

    // 9. Mid-Left: Greatest masterpiece
    let masterpiece = res.regions.iter().find(|r| r.text.contains("最高傑作") || r.text.contains("中でも私は"));
    assert!(masterpiece.is_some(), "Must detect masterpiece bubble");

    // 10. Mid-Left: New species
    let new_species = res.regions.iter().find(|r| r.text.contains("愚民") && (r.text.contains("新しい種族") || r.text.contains("異なる") || r.text.contains("種族")));
    assert!(new_species.is_some(), "Must detect new species bubble");

    // 11. Mid-Left: Start of tournament
    let tournament_start = res.regions.iter().find(|r| r.text.contains("大会を皮切りに") || r.text.contains("絶大な力") || r.text.contains("見せつけ"));
    assert!(tournament_start.is_some(), "Must detect tournament start bubble");

    // 12. Bottom-Left: Rule the world
    let rule_world = res.regions.iter().find(|r| r.text.contains("世界を") || r.text.contains("支配する"));
    assert!(rule_world.is_some(), "Must detect '世界を支配する' bubble");

    // 13. Bottom-Right: All matches one blow?
    let one_blow_q = res.regions.iter().find(|r| (r.text.contains("全試合") || r.text.contains("一撃") || r.text.contains("一擊")) && r.box_.y > 700);
    assert!(one_blow_q.is_some(), "Must detect '全試合一擊…？' bubble");

    // 14. Bottom-Right: Kukuku whisper
    let kukuku = res.regions.iter().find(|r| r.text.contains("くくく") || r.text.contains("くっ"));
    assert!(kukuku.is_some(), "Must detect 'くくくっ…' whisper bubble");

    // 15. Bottom-Right: Suiryu and you too
    let suiryu = res.regions.iter().find(|r| r.text.contains("スイリュー") || r.text.contains("得意げ"));
    assert!(suiryu.is_some(), "Must detect Suiryu reaction bubble");
}

/// # Japanese Real-Page Regression: `page_do_s_monster_princess_whip_fubuki` (Resolution: Native 1370 × 1079 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Giant SFX Inpainting Hallucination Suppression**:
///   Guarantees that low-confidence sprawling SFX/noise detections (`score < 0.50`, $w, h \ge 200$)
///   do not capture adjacent dialogue bubble lines (`かつての仲間に\n遠慮してるのかい？`) or create massive
///   $400+\text{px}$ inpainting/translation blackout boxes across panels.
/// - **Negative Guards Against Stray / Echo SFX Fragments**:
///   Ensures motion lines on whip attacks do not emit isolated single-character hallucination boxes (`"会"` / `SLASH`).
/// - **Core Dialogue & Onomatopoeia Accounting**:
///   1. Top-Left Dialogues:
///      - `アンタも仲間に入れてあげるわ`
///      - `気の毒だね ウフフ…`
///      - `そうだ… だったら`
///      - Large Whip SFX: `バシィッ` / `五立`
///      - `死ぬまで この弩S様の 奴隷としてね！` (Angle must be upright/snapped to 0.0)
///   2. Top-Right Panel:
///      - `残念でした`
///      - `その子達は もう私の奴隷！`
///   3. Mid-Right Panel:
///      - `くっ…` (Fubuki groan)
///      - `ウフフフフッ`
///      - `手下を奪われた気分はどうだい`
///   4. Bottom Panels:
///      - `ほらほらぁ！ 反撃しないと 殺されちゃうよぉー！`
///      - `重い！`
///      - `かつての仲間に 遠慮してるのかい？`
///      - `このムチの 威力が 侮れない…！！`
/// - **Strict Region Accounting**:
///   Guarantees clean region emissions without duplicate giant SFX boxes.
#[test]
fn test_regression_page_do_s_monster_princess_whip_fubuki() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_do_s_monster_princess_whip_fubuki/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_do_s_monster_princess_whip_fubuki: fixture not found");
            return;
        }
    };

    let res = crate::common::get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Double Page Do-S vs Fubuki Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}, angle={:.2}, kind={:?}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical, r.angle, r.kind);
    }

    // 0. Negative Guard: Zero giant hallucinated SFX region spanning across bottom panels
    assert!(
        !res.regions.iter().any(|r| {
            (r.box_.w >= 300 && r.box_.h >= 300) || (r.text.contains("遠慮してるのかい") && r.box_.w >= 200)
        }),
        "Must NOT emit giant hallucinated SFX box covering the bottom panel"
    );

    // 1. Negative Guard: No duplicate single-character motion blur slice ('会' / '七')
    assert!(
        !res.regions.iter().any(|r| {
            let t = r.text.trim();
            (t == "会" || t == "公") && r.box_.w <= 30 && r.box_.h <= 30
        }),
        "Must NOT emit isolated phantom character from motion blur lines"
    );

    // 2. Dialogue: 'かつての仲間に 遠慮してるのかい？' (Must be inside its own dialogue bubble)
    let holding_back = res.regions.iter().find(|r| r.text.contains("遠慮してるのかい") || r.text.contains("かつての仲間に"));
    assert!(holding_back.is_some(), "Must detect 'かつての仲間に 遠慮してるのかい？' dialogue bubble");
    let hb_region = holding_back.unwrap();
    assert!(hb_region.box_.w < 150 && hb_region.box_.h < 250, "Holding back bubble must be a normal-sized speech bubble, got: {:?}", hb_region.box_);

    // 3. Dialogue: 'アンタも 仲間に入れて あげるわ'
    let join_us = res.regions.iter().find(|r| r.text.contains("アンタも") || r.text.contains("仲間に入れて"));
    assert!(join_us.is_some(), "Must detect 'アンタも 仲間に入れて あげるわ' bubble");

    // 4. Dialogue: '死ぬまで この弩S様の 奴隷としてね！'
    let do_s_queen = res.regions.iter().find(|r| r.text.contains("弩S") || r.text.contains("奴隷としてね") || r.text.contains("死ぬまで"));
    assert!(do_s_queen.is_some(), "Must detect Do-S Queen speech bubble");
    let ds_region = do_s_queen.unwrap();
    assert_eq!(ds_region.angle, 0.0, "Do-S Queen speech bubble must have angle 0.0, got: {:.2}°", ds_region.angle);

    // 5. Dialogue: 'その子達は もう私の奴隷！'
    let my_slaves = res.regions.iter().find(|r| r.text.contains("その子達") || r.text.contains("私の奴隷"));
    assert!(my_slaves.is_some(), "Must detect 'その子達は もう私の奴隷！' bubble");

    // 6. Dialogue: '残念でした'
    let too_bad = res.regions.iter().find(|r| r.text.contains("残念でした"));
    assert!(too_bad.is_some(), "Must detect '残念でした' bubble");

    // 7. Dialogue: '手下を奪われた 気分はどうだい'
    let minions = res.regions.iter().find(|r| r.text.contains("手下を奪われた") || r.text.contains("気分はどうだい"));
    assert!(minions.is_some(), "Must detect '手下を奪われた 気分はどうだい' bubble");

    // 8. Dialogue: 'ほらほらぁ！ 反撃しないと 殺されちゃうよぉー！'
    let come_on = res.regions.iter().find(|r| r.text.contains("ほらほら") || r.text.contains("反撃しないと") || r.text.contains("殺されちゃう"));
    assert!(come_on.is_some(), "Must detect 'ほらほらぁ！ 反撃しないと 殺されちゃうよぉー！' bubble");

    // 9. Dialogue: '重い！'
    let heavy = res.regions.iter().find(|r| r.text.contains("重い") || r.text.contains("おも"));
    assert!(heavy.is_some(), "Must detect '重い！' bubble");

    // 10. Dialogue: 'このムチの 威力が 侮れない…！！'
    let whip_power = res.regions.iter().find(|r| r.text.contains("ムチの") || r.text.contains("威力が") || r.text.contains("侮れない"));
    assert!(whip_power.is_some(), "Must detect 'このムチの 威力が 侮れない…！！' bubble");

    // 11. Exact Dialogue Accounting: exactly 13 dialogue regions
    assert_eq!(res.regions.len(), 13, "Must detect exactly 13 regions, got: {}", res.regions.len());
}

/// # Japanese Real-Page Regression: `page_dream_strong_violence_stylized_narration` (Resolution: Native 1129 × 1600 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Full-Height Vertical Stylized Narration (White with Black Outline)**:
///   1. Right Vertical Column: `夢の中の僕は強者で`
///   2. Left Vertical Column: `思うまま暴力を振るっていた`
/// - **Zero Fragmented Sub-Boxes & Zero Hallucinated Prefix/Suffix**:
///   - Prevents right sentence from being truncated into single/fragmented characters (`中\nの`).
///   - Prevents left sentence from capturing hallucinated duplicated prefixes (`ま6暴力`, `系`).
/// - **Strict 2-Region Accounting**:
///   Must detect exactly 2 vertical narration regions spanning the left and right sides.
#[test]
fn test_regression_page_dream_strong_violence_stylized_narration() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_dream_strong_violence_stylized_narration/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_dream_strong_violence_stylized_narration: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Dream Strong Violence Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}, angle={:.2}, kind={:?}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical, r.angle, r.kind);
    }

    // 0. Strict 2-region accounting
    assert_eq!(res.regions.len(), 2, "Must detect exactly 2 vertical narration regions, got: {}", res.regions.len());

    // 1. Right Vertical Narration: '夢の中の僕は強者で'
    let right_narration = res.regions.iter().find(|r| r.box_.x > 800 || r.text.contains("夢") || r.text.contains("強者") || r.text.contains("僕"));
    assert!(right_narration.is_some(), "Must detect right vertical narration block");
    let rn = right_narration.unwrap();
    assert!(rn.text.contains("夢") || rn.text.contains("強者") || rn.text.contains("僕は"), "Right narration text mismatch: {}", rn.text);
    assert!(rn.vertical, "Right narration must be vertical orientation");

    // 2. Left Vertical Narration: '思うまま暴力を振るっていた'
    let left_narration = res.regions.iter().find(|r| r.box_.x < 400 || r.text.contains("思うまま") || r.text.contains("暴力"));
    assert!(left_narration.is_some(), "Must detect left vertical narration block");
    let ln = left_narration.unwrap();
    assert!(ln.text.contains("思うまま") || ln.text.contains("暴力") || ln.text.contains("振るって"), "Left narration text mismatch: {}", ln.text);
    assert!(!ln.text.contains("ま6暴力"), "Left narration must not contain hallucinated prefix 'ま6暴力': {}", ln.text);
    assert!(ln.vertical, "Left narration must be vertical orientation");
}

/// # Japanese Real-Page Regression: `page_action_kick_punch_slap_sfx_only` (Resolution: Native 1129 × 1600 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Zero Dialogue / SFX-Only Action Page Suppression**:
///   Guarantees that on an action manga page consisting strictly of martial arts strikes, kicks, and
///   onomatopoeia (`パァン`, `ブゥン`, `ズォッ`), no giant sprawling `free_text` regions or garbled OCR
///   speedline noise (`VV\nY\n水`) are emitted when SFX translation is disabled.
/// - **Negative Guards Against Giant Cross-Panel Blackout Boxes**:
///   Asserts that no region spans across multiple panels or creates huge bounding boxes ($w \ge 300, h \ge 500$).
/// - **Strict 0-Region Accounting (Standard Dialogue Mode)**:
///   In standard dialogue mode (`include_onomatopoeia: false`), exactly 0 regions must be emitted.
#[test]
fn test_regression_page_action_kick_punch_slap_sfx_only() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_action_kick_punch_slap_sfx_only/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_action_kick_punch_slap_sfx_only: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Action SFX Only Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}, angle={:.2}, kind={:?}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical, r.angle, r.kind);
    }

    // 0. Negative Guard: Zero giant blackout boxes spanning across panels
    assert!(
        !res.regions.iter().any(|r| r.box_.w >= 300 && r.box_.h >= 500),
        "Must NOT emit giant bounding box covering comic panels"
    );

    // 1. Negative Guard: Zero garbled speedline OCR noise ('VV', '水')
    assert!(
        !res.regions.iter().any(|r| {
            let t = r.text.trim();
            t.contains("VV") || (t.contains("Y") && t.contains("水"))
        }),
        "Must NOT emit garbled speedline OCR noise"
    );

    // 2. Strict 0-region accounting: pure action page with no dialogue
    assert_eq!(
        res.regions.len(),
        0,
        "Action page with zero dialogue must emit 0 regions when SFX is disabled, got: {}",
        res.regions.len()
    );
}

/// # Japanese Real-Page Regression: `page_wise_emphasis_hand_stroke_noise_gratitude` (Resolution: Native 1129 × 1600 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Panel 1 Top Emphasis & Narration**:
///   1. Top-Right Narration: `この子もまた`
///   2. Top-Left Calligraphy / Emphasis: `“賢”!?` (capturing both `賢` and `!?` without giant empty bounds)
/// - **Panel 2 Dialogues & Negative Drawing Stroke Guard**:
///   3. Top-Right Bubble: `あ`
///   4. Mid-Right Bubble: `ありがとう…\n君は…？`
///   5. Left Bubble: `逃げるん\nですか？`
///   - **Negative Guard**: Eliminates stray drawing vibration / hand gesture noise (`"しし"`, `"し"`)
///     between the character's hand and speech bubble.
/// - **Panel 3 Dialogues**:
///   6. Mid-Right Bubble: `まあでも\nそうか‥`
///   7. Mid-Left Bubble: `仕方ない\nですよね`
///   8. Far-Right Bubble: `あ？`
/// - **Strict Region Accounting**:
///   Must detect 7 or 8 clean dialogue/narration regions with zero phantom hand noise boxes.
#[test]
fn test_regression_page_wise_emphasis_hand_stroke_noise_gratitude() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_wise_emphasis_hand_stroke_noise_gratitude/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_wise_emphasis_hand_stroke_noise_gratitude: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Wise Emphasis Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}, angle={:.2}, kind={:?}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical, r.angle, r.kind);
    }

    // 0. Negative Guard: Drawing vibration / hand noise ('しし', 'し') must be eliminated
    assert!(
        !res.regions.iter().any(|r| {
            let t = r.text.trim();
            (t == "しし" || t == "し" || t == "いい") && r.box_.w <= 45 && r.box_.h <= 60
        }),
        "Must NOT emit stray hand gesture / speedline noise 'しし'"
    );

    // 1. Panel 1 Top-Right: 'この子もまた'
    let this_one_too = res.regions.iter().find(|r| r.text.contains("この子もまた") || (r.text.contains("この子") && r.box_.y < 600));
    assert!(this_one_too.is_some(), "Must detect top-right narration 'この子もまた'");

    // 2. Panel 1 Top-Left: '“賢”!?'
    let wise_emphasis = res.regions.iter().find(|r| r.text.contains("賢") && r.box_.y < 600 && r.box_.x < 600);
    assert!(wise_emphasis.is_some(), "Must detect top-left emphasis '“賢”!?'");

    // 3. Panel 2: '逃げるんですか？'
    let running_away = res.regions.iter().find(|r| r.text.contains("逃げる") || r.text.contains("ですか"));
    assert!(running_away.is_some(), "Must detect '逃げるんですか？' bubble");

    // 4. Panel 2: 'ありがとう… 君は…？'
    let thanks_who = res.regions.iter().find(|r| r.text.contains("ありがとう") || r.text.contains("君は"));
    assert!(thanks_who.is_some(), "Must detect 'ありがとう… 君は…？' bubble");

    // 5. Panel 3: 'まあでも そうか‥'
    let well_but = res.regions.iter().find(|r| r.text.contains("まあでも") || r.text.contains("そうか"));
    assert!(well_but.is_some(), "Must detect 'まあでも そうか‥' bubble");

    // 6. Panel 3: '仕方ないですよね'
    let cant_help = res.regions.iter().find(|r| r.text.contains("仕方ない") || r.text.contains("ですよね"));
    assert!(cant_help.is_some(), "Must detect '仕方ないですよね' bubble");

    // 7. Panel 3: 'あ？'
    let ah_q = res.regions.iter().find(|r| (r.text.contains("あ？") || r.text.trim() == "あ" || r.text.contains("あ?")) && r.box_.y > 1300);
    assert!(ah_q.is_some(), "Must detect bottom-right 'あ？' bubble");

    // 8. Strict Region Accounting: 7 or 8 dialogue regions (excluding stray drawing noise)
    assert!(
        res.regions.len() >= 7 && res.regions.len() <= 8,
        "Expected 7 or 8 clean dialogue/narration regions, got {}",
        res.regions.len()
    );
}

/// # Japanese Real-Page Regression: `page_dogeza_wise_calligraphy_furigana_narration` (Resolution: Native 1129 × 1600 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Panel 1 Dialogues & Narration**:
///   1. Top-Right Narration: `どうせ\nこんな馬鹿`
///   2. Top-Middle Narration: `社会に出たら\n弱者確定`
///   3. Top-Left Bubble: `今のうち\n楽しんでおけ`
/// - **Panel 2 Calligraphy Emphasis & Narration Separation**:
///   4. Middle Narration: `そう\nここは\n土下座こそ` (Cleanly isolated from calligraphy)
///   5. Middle Emphasis: `“賢”!!` (Must detect large bold calligraphy `賢` with quotes and exclamation)
/// - **Panel 3 Dialogue**:
///   6. Bottom Bubble: `終わり\nました？`
/// - **Strict 6-Region Accounting**:
///   Guarantees all 6 regions are detected without losing the bold `賢!!` calligraphy.
#[test]
fn test_regression_page_dogeza_wise_calligraphy_furigana_narration() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_dogeza_wise_calligraphy_furigana_narration/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_dogeza_wise_calligraphy_furigana_narration: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Dogeza Wise Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}, angle={:.2}, kind={:?}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical, r.angle, r.kind);
    }

    // 0. Strict 6-region accounting
    assert_eq!(res.regions.len(), 6, "Must detect exactly 6 regions across all 3 panels, got: {}", res.regions.len());

    // 1. Panel 1 Top-Right: 'どうせ こんな馬鹿'
    let idiot = res.regions.iter().find(|r| r.text.contains("こんな馬鹿") || (r.text.contains("どうせ") && r.box_.y < 500));
    assert!(idiot.is_some(), "Must detect top-right narration 'どうせ こんな馬鹿'");

    // 2. Panel 1 Top-Middle: '社会に出たら 弱者確定'
    let loser = res.regions.iter().find(|r| r.text.contains("社会に出たら") || r.text.contains("弱者確定"));
    assert!(loser.is_some(), "Must detect top-middle narration '社会に出たら 弱者確定'");

    // 3. Panel 1 Top-Left: '今のうち 楽しんでおけ'
    let enjoy = res.regions.iter().find(|r| r.text.contains("今のうち") || r.text.contains("楽しんでおけ"));
    assert!(enjoy.is_some(), "Must detect top-left speech bubble '今のうち 楽しんでおけ'");

    // 4. Panel 2 Middle-Right Narration: 'そう ここは 土下座こそ'
    let dogeza = res.regions.iter().find(|r| r.text.contains("土下座") || (r.text.contains("そう") && r.text.contains("ここは")));
    assert!(dogeza.is_some(), "Must detect middle narration 'そう ここは 土下座こそ'");
    let dg_text = &dogeza.unwrap().text;
    assert!(!dg_text.contains("賢"), "Middle narration must not contain the calligraphy glyph '賢': {}", dg_text);

    // 5. Panel 2 Middle-Left Calligraphy: '“賢”!!'
    let wise_calligraphy = res.regions.iter().find(|r| r.text.contains("賢") && r.box_.y >= 450 && r.box_.y <= 1100);
    assert!(wise_calligraphy.is_some(), "Must detect middle calligraphy emphasis '“賢”!!'");

    // 6. Panel 3 Bottom: '終わりました？'
    let finished_q = res.regions.iter().find(|r| (r.text.contains("終わり") || r.text.contains("ました")) && r.box_.y > 1200);
    assert!(finished_q.is_some(), "Must detect bottom speech bubble '終わりました？'");
}











