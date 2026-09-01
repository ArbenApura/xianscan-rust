// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_zhou_tianhao_silent_spell_escape` (RESOLUTION: 827 x 1785)
///
/// ## SCENE CONTEXT:
/// - Rebirth of the Urban Immortal Cultivator (重生之都市修仙)
/// - Panel 1: Chen Fan negotiating with nightclub boss Zhou Tianhao's men:
///   - Dialogue bubble: `嗯?`
///   - Dialogue bubble: `你先让他们离开，我留在这里，咱们慢慢玩。`
///   - Free text thought: `威胁我？那我就施展法术，悄无声息的杀掉你，一了百了。`
/// - Panel 2: Boss Zhou Tianhao grinning:
///   - Dialogue bubble: `可以，我倒要看看你今晚怎么陪我玩。`
/// - Panel 3: Fleeing crowd and girls:
///   - Free text: `能走了！`
///   - Free text (MANDATORY): `快走快走！` (Background fleeing crowd reaction)
///   - Dialogue bubble: `陈凡！` (Xu Rongfei calling Chen Fan)
///   - Dialogue bubble: `快走啦大小姐!` (Jiang Churan pulling Xu Rongfei)
/// - Panel 4: Jiang Churan analyzing Zhou Tianhao:
///   - Thought bubble: `难怪他一副有恃无恐的样子，但周天豪可不是靠打就解决的。`
/// - Panel 5: Chen Fan planning silent slaughter:
///   - Thought bubble: `姜初然和许容妃走了就行了。`
///   - Thought bubble: `接下来释放法术杀掉这里的所有人就可以了。`
///
/// ## STRICT CONSTRAINTS & INVARIANTS:
/// 1. **EXACT ELEMENT COUNTS**:
///    - Expected total regions: 11
///    - Dialogue / Thought bubbles: 8
///    - Free text: 3 (`威胁我？...`, `能走了！`, `快走快走！`)
///    - Sound effects (SFX): 0
/// 2. **NEGATIVE GUARDS**:
///    - Aggregator watermarks `COLAMANGA.com` / `ACloudMerge.com` in middle gutter must be suppressed.
///    - Background neon club signs (e.g. `帝王厅`) must not produce false text extractions.
#[test]
fn test_regression_page_zhou_tianhao_silent_spell_escape() {
    let img = match crate::common::load_fixture_or_skip(
        "zh_hans",
        "page_zhou_tianhao_silent_spell_escape/page.webp",
    ) {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_zhou_tianhao_silent_spell_escape: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh-Hans"));
    println!(
        "Zhou Tianhao Silent Spell Escape Page detected {} regions:",
        res.regions.len()
    );
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}",
            i,
            r.kind,
            r.angle,
            r.box_,
            r.text.replace('\n', "\\n"),
            r.confidence
        );
    }

    // 1. EXACT ELEMENT COUNTS: 11 TOTAL REGIONS (8 DIALOGUE BUBBLES, 0 SFX, 3 FREE TEXT)
    crate::assert_element_counts!(res, 11, 8, 0, 3);

    // 2. DIALOGUE BUBBLE 1: "嗯?"
    let r_hmm = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("嗯") || r.text.trim() == "嗯?")
    });
    assert!(r_hmm.is_some(), "Must detect dialogue bubble '嗯?'");

    // 3. DIALOGUE BUBBLE 2: "你先让他们离开..."
    let r_leave_first = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("让他们离开") || r.text.contains("慢慢玩"))
    });
    assert!(
        r_leave_first.is_some(),
        "Must detect dialogue bubble '你先让他们离开，我留在这里，咱们慢慢玩。'"
    );

    // 4. DIALOGUE BUBBLE 3: "可以，我倒要看看你今晚怎么陪我玩。"
    let r_boss_play = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("陪我") || r.text.contains("要看看") || r.text.contains("可以，我倒"))
    });
    assert!(
        r_boss_play.is_some(),
        "Must detect Zhou Tianhao dialogue bubble '可以，我倒要看看你今晚怎么陪我玩。'"
    );

    // 5. DIALOGUE BUBBLE 4: "陈凡！"
    let r_chen_fan_excl = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && r.text.contains("陈凡")
            && (r.text.contains("！") || r.text.contains("!"))
            && r.box_.y < 1100
    });
    assert!(
        r_chen_fan_excl.is_some(),
        "Must detect Xu Rongfei reaction bubble '陈凡！'"
    );

    // 6. DIALOGUE BUBBLE 5: "快走啦大小姐!"
    let r_hurry_miss = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("大小姐") || r.text.contains("快走啦"))
    });
    assert!(
        r_hurry_miss.is_some(),
        "Must detect Jiang Churan dialogue bubble '快走啦大小姐!'"
    );

    // 7. DIALOGUE BUBBLE 6: "难怪他一副有恃无恐的样子..."
    let r_zhou_tianhao_thought = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("有恃无恐") || r.text.contains("周天豪"))
    });
    assert!(
        r_zhou_tianhao_thought.is_some(),
        "Must detect Jiang Churan thought bubble '难怪他一副有恃无恐的样子，但周天豪可不是靠打就解决的。'"
    );

    // 8. DIALOGUE BUBBLE 7: "姜初然和许容妃走了就行了。"
    let r_girls_gone = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("姜初然") || r.text.contains("许容妃"))
    });
    assert!(
        r_girls_gone.is_some(),
        "Must detect Chen Fan thought bubble '姜初然和许容妃走了就行了。'"
    );

    // 9. DIALOGUE BUBBLE 8: "接下来释放法术杀掉这里的所有人就可以了。"
    let r_kill_everyone = res.regions.iter().find(|r| {
        r.kind == RegionKind::DialogueBubble
            && (r.text.contains("释放法术") || r.text.contains("所有人"))
    });
    assert!(
        r_kill_everyone.is_some(),
        "Must detect Chen Fan thought bubble '接下来释放法术杀掉这里的所有人就可以了。'"
    );

    // 10. FREE TEXT 1: "威胁我？那我就施展法术..."
    let r_threat_spell = res.regions.iter().find(|r| {
        r.kind == RegionKind::FreeText
            && (r.text.contains("威胁我") || r.text.contains("施展法术") || r.text.contains("悄无声息"))
    });
    assert!(
        r_threat_spell.is_some(),
        "Must detect Chen Fan free text thought '威胁我？那我就施展法术，悄无声息的杀掉你，一了百了。'"
    );

    // 11. FREE TEXT 2: "能走了！"
    let r_can_go = res.regions.iter().find(|r| {
        r.kind == RegionKind::FreeText
            && (r.text.contains("能走了") || r.text.trim() == "能走了！")
    });
    assert!(
        r_can_go.is_some(),
        "Must detect escaping crowd free text '能走了！'"
    );

    // 12. FREE TEXT 3: "快走快走！" (MANDATORY)
    let r_hurry_hurry = res.regions.iter().find(|r| {
        r.kind == RegionKind::FreeText
            && (r.text.contains("快走快走") || r.text.trim() == "快走快走！")
    });
    assert!(
        r_hurry_hurry.is_some(),
        "Must detect background fleeing crowd free text '快走快走！'"
    );

    // 13. NEGATIVE GUARD: NO AGGREGATOR WATERMARKS
    assert!(
        !res.regions.iter().any(|r| {
            let t = r.text.to_lowercase();
            t.contains("colamanga") || t.contains("acloudmerge") || t.contains("腾讯动漫")
        }),
        "Gutter platform watermarks must be suppressed"
    );
}
