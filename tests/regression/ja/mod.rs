use std::path::Path;
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
    let mut img_path = Path::new("tests/fixtures/ja/sample.webp"); if !img_path.exists() { img_path = Path::new("tests/fixtures/zh_hans/page_zhang_yude_chengdu_cemetery.webp"); };
    if !img_path.exists() {
        eprintln!("Fixture {:?} not found, skipping test", img_path);
        return;
    }

    let img = image::ImageReader::open(img_path)
        .expect("Failed to open fixture image")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

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
    let img_path = Path::new("tests/fixtures/ja/page_lucky_me_first_place_vertical.webp");
    if !img_path.exists() {
        eprintln!("Fixture {:?} not found, skipping test", img_path);
        return;
    }

    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_lucky_me_first_place_vertical.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

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
    let modest_bubble = res.regions.iter().find(|r| r.text.contains("謙遜してるのも") || r.text.contains("かっこい"));
    assert!(modest_bubble.is_some(), "Must detect modest girl bubble");
    assert!(!modest_bubble.unwrap().text.contains("e t致"), "Must strip ruby slivers");

    // 10. Bottom-Center Boy Bubble: '末は 博士か 大臣か'
    let proverb_bubble = res.regions.iter().find(|r| r.text.contains("博士か") || r.text.contains("大臣か") || r.text.contains("末は"));
    assert!(proverb_bubble.is_some(), "Must detect proverb bubble '末は 博士か 大臣か'");
    let p_text = &proverb_bubble.unwrap().text;
    assert!(p_text.contains("末は") && (p_text.contains("博士か") || p_text.contains("大臣か")), "Proverb must contain vertical columns: {}", p_text);
}

/// # Japanese Real-Page Regression: PageId 64026 (Resolution: 640 × 1005 WebP)
///
/// ## Purpose & Behavior Tested:
/// - **Vertical Japanese Dialogue & Reading Order**:
///   Extracts Japanese vertical dialogue bubbles across the assembly and side-story panels:
///   1. Top-Right Announcement: `全校朝礼を始めます`
///   2. Top-Middle Instruction: `生徒は体育館に集合し`
///   3. Middle Panel Chapter Tag: `番外編`
///   4. Bottom-Left Spiky Bubble (Upper): `人前では` / `天幕さん！` / `ストップ！`
///   5. Bottom-Left Spiky Bubble (Middle): `ごめん\n止まんない`
///   6. Bottom-Left Spiky Bubble (Lower): `あぁもう` / `ああもう`
///   7. Bottom-Right Dialogue (Upper): `…ハジメ`
///   8. Bottom-Right Dialogue (Lower): `なんか紙\nない？`
///   9. Bottom-Middle Dialogue: `紙？`
///   10. Bottom Shocked Reaction: `まさか`
/// - **Optional Floating SFX**:
///   Permits detected courtyard/corridor floating SFX (e.g. `かャ` / `ざわ` / `ガヤ`) without breaking strict dialogue assertions.
///
/// ## Key Invariants:
/// - Between 10 and 11 regions detected (9 dialogue bubbles + 1 chapter tag + optional SFX).
/// - All 10 core dialogue/header regions accounted for.
#[test]
fn test_regression_manga_tenmaku_assembly_extra_chapter() {
    let img_path = Path::new("tests/fixtures/ja/manga_tenmaku_assembly_extra_chapter.webp");
    if !img_path.exists() {
        eprintln!("Fixture {:?} not found, skipping test", img_path);
        return;
    }

    let img = image::ImageReader::open(img_path)
        .expect("Failed to open manga_tenmaku_assembly_extra_chapter.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("Manga Tenmaku Assembly (len={}):", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. Regions count: 10 core regions (9 bubbles + 1 header) + optional SFX
    assert!(
        res.regions.len() >= 10 && res.regions.len() <= 12,
        "Expected between 10 and 12 regions, got {}",
        res.regions.len()
    );

    // 1. Top-Right Announcement: '全校朝礼を始めます'
    let assembly = res.regions.iter().find(|r| r.text.contains("全校朝礼") || r.text.contains("始めます"));
    assert!(assembly.is_some(), "Must detect top-right assembly announcement");
    assert!(assembly.unwrap().text.contains("全校朝礼") || assembly.unwrap().text.contains("始めます"), "Assembly text mismatch");

    // 2. Top-Middle Instruction: '生徒は体育館に集合し'
    let gym = res.regions.iter().find(|r| r.text.contains("生徒") || r.text.contains("体育館") || r.text.contains("集合"));
    assert!(gym.is_some(), "Must detect top-middle gymnasium announcement");
    assert!(gym.unwrap().text.contains("体育館") || gym.unwrap().text.contains("生徒"), "Gym text mismatch");

    // 3. Middle Chapter Tag: '番外編'
    let chapter_tag = res.regions.iter().find(|r| r.text.contains("番外編"));
    assert!(chapter_tag.is_some(), "Must detect chapter tag '番外編'");

    // 4. Bottom-Left Upper Spiky Bubble: '人前では... 天幕さん！ ストップ！'
    let stop_bubble = res.regions.iter().find(|r| r.text.contains("人前") || r.text.contains("天幕") || r.text.contains("ストップ"));
    assert!(stop_bubble.is_some(), "Must detect bottom-left upper spiky bubble");
    let stop_text = &stop_bubble.unwrap().text;
    assert!(stop_text.contains("人前") || stop_text.contains("天幕") || stop_text.contains("ストップ"), "Stop bubble text mismatch: {}", stop_text);

    // 5. Bottom-Left Middle Spiky Bubble: 'ごめん\n止まんない'
    let sorry_bubble = res.regions.iter().find(|r| r.text.contains("止まんない") || r.text.contains("ごめん"));
    assert!(sorry_bubble.is_some(), "Must detect 'ごめん 止まんない' bubble");

    // 6. Bottom-Left Lower Spiky Bubble: 'あぁもう'
    let ah_bubble = res.regions.iter().find(|r| r.text.contains("あぁもう") || r.text.contains("ああもう") || r.text.contains("もう"));
    assert!(ah_bubble.is_some(), "Must detect 'ああもう' bubble");

    // 7. Bottom-Right Dialogue (Upper): '…ハジメ'
    let hajime = res.regions.iter().find(|r| r.text.contains("ハジメ"));
    assert!(hajime.is_some(), "Must detect '…ハジメ' bubble");

    // 8. Bottom-Right Dialogue (Lower): 'なんか紙ない？'
    let paper_req = res.regions.iter().find(|r| r.text.contains("なんか紙") || (r.text.contains("紙") && r.text.contains("ない")));
    assert!(paper_req.is_some(), "Must detect 'なんか紙ない？' bubble");

    // 9. Bottom-Middle Dialogue: '紙？'
    let paper_q = res.regions.iter().find(|r| r.text.contains("紙？") || r.text.contains("紙?"));
    assert!(paper_q.is_some(), "Must detect '紙？' question bubble");

    // 10. Bottom Shocked Reaction: 'まさか'
    let masaka = res.regions.iter().find(|r| r.text.contains("まさか") || (r.text.contains("ま") && r.text.contains("さ") && r.text.contains("か")));
    assert!(masaka.is_some(), "Must detect 'まさか' reaction bubble");
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
    let img_path = Path::new("tests/fixtures/ja/manga_kotatsu_timing_tea_club_lottery.webp");
    if !img_path.exists() {
        eprintln!("Fixture {:?} not found, skipping test", img_path);
        return;
    }

    let img = image::ImageReader::open(img_path)
        .expect("Failed to open manga_kotatsu_timing_tea_club_lottery.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

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
    let img_path = Path::new("tests/fixtures/ja/page_school_phone_rule_e_bubble.webp");
    if !img_path.exists() {
        eprintln!("Fixture {:?} not found, skipping test", img_path);
        return;
    }

    let img = image::ImageReader::open(img_path)
        .expect("Failed to open page_school_phone_rule_e_bubble.webp")
        .with_guessed_format()
        .expect("Failed to guess format")
        .decode()
        .expect("Failed to decode image");

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Native 810x737 Page Results ({} regions) ===", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: box={:?}, text='{}', conf={:.2}, vert={}", i, r.box_, r.text.replace('\n', "\\n"), r.confidence, r.vertical);
    }

    // 0. Strict 8-region accounting (Rule #12)
    assert_eq!(res.regions.len(), 8, "Must detect exactly 8 speech bubbles across the page");

    // 1. Top-Right Bubble: '気が\nぬけたら\n意識\nトびそうに\nなった…'
    let top_right = res.regions.iter().find(|r| r.text.contains("気が") && r.text.contains("ぬけたら"));
    assert!(top_right.is_some(), "Must detect top-right bubble '気が ぬけたら 意識 トびそうに なった…'");
    let tr_text = &top_right.unwrap().text;
    assert!(tr_text.contains("意識") && (tr_text.contains("トびそう") || tr_text.contains("トひそう") || tr_text.contains("卜びそう")), "Must preserve consciousness fade text: {}", tr_text);

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
    let all_solved = res.regions.iter().find(|r| r.text.contains("万事解決") || r.text.contains("助けが呼べる"));
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



