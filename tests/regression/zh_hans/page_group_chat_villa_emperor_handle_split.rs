// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

/// # SIMPLIFIED CHINESE REAL-PAGE REGRESSION: `page_group_chat_villa_emperor_handle_split` (RESOLUTION: 900 × 1901)
///
/// ## PURPOSE & BEHAVIOR TESTED:
/// - **CHAT MESSAGE 2 SENDER HANDLE & BUBBLE SEPARATION**:
///   IN A SMARTPHONE GROUP CHAT INTERFACE ("炎江太子千金(23)"), SENDER NICKNAMES APPEAR OUTSIDE AND ABOVE EACH BUBBLE.
///   THE SENDER HANDLE "墅帝：" MUST NOT BE MERGED WITH THE INNER DIALOGUE BUBBLE "钱总，我！我开了5个大商场，任你选一个！".
/// - **ALL SENDER HANDLES & BUBBLES**:
///   EACH OF THE 6 MESSAGES MUST HAVE ITS SENDER HANDLE AND BUBBLE SEPARATED INDEPENDENTLY.
/// - **EXACT COUNTS**: 13 REGIONS TOTAL (1 HEADER + 6 SENDER HANDLES + 6 MESSAGE BODIES).
#[test]
fn test_regression_page_group_chat_villa_emperor_handle_split() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_group_chat_villa_emperor_handle_split/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("Detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!("  Region r{}: kind={:?}, angle={:.2}, box={:?}, text='{}', conf={:.2}", i, r.kind, r.angle, r.box_, r.text.replace('\n', "\\n"), r.confidence);
    }

    // 1. EXACT STRUCTURAL ELEMENT COUNTS: 13 REGIONS TOTAL
    // (1 TITLE HEADER + 6 SENDER NICKNAMES + 6 CHAT BUBBLE BODIES)
    crate::assert_element_counts!(res, 13, 0, 0, 13);

    // 2. CHAT HEADER TITLE: "炎江太子千金(23)"
    let r_header = res.regions.iter().find(|r| r.text.contains("炎江太子千金"));
    assert!(r_header.is_some(), "Must detect group chat header title '炎江太子千金(23)'");
    let r_header = r_header.unwrap();
    assert_eq!(r_header.kind, RegionKind::FreeText);
    crate::assert_region_bounds!(r_header, RegionKind::FreeText, 238, 137, 381, 51, 20);

    // 3. MESSAGE 1: NICKNAME "穷得只剩钱:" AND BUBBLE BODY
    let r_nick1 = res.regions.iter().find(|r| r.text.contains("穷得只剩钱"));
    assert!(r_nick1.is_some(), "Must detect sender 1 '穷得只剩钱:'");
    let r_msg1 = res.regions.iter().find(|r| r.text.contains("各位兄弟姐妹") || r.text.contains("撑撑场子"));
    assert!(r_msg1.is_some(), "Must detect message 1 body");

    // 4. MESSAGE 2: SENDER HANDLE "墅帝：" MUST BE SEPARATED FROM BUBBLE BODY
    let r_nick2 = res.regions.iter().find(|r| r.text.contains("墅帝"));
    assert!(r_nick2.is_some(), "Must detect sender 2 handle '墅帝：' as an isolated region");
    let r_nick2 = r_nick2.unwrap();
    assert_eq!(r_nick2.kind, RegionKind::FreeText);
    assert!(!r_nick2.text.contains("商场"), "Sender handle '墅帝：' must NOT contain dialogue body");

    let r_msg2 = res.regions.iter().find(|r| r.text.contains("钱总，我！") || r.text.contains("5个大商场"));
    assert!(r_msg2.is_some(), "Must detect message 2 body '钱总，我！我开了5个大商场，任你选一个！'");
    let r_msg2 = r_msg2.unwrap();
    assert_eq!(r_msg2.kind, RegionKind::FreeText);
    assert!(!r_msg2.text.contains("墅帝"), "Message 2 body must NOT include sender handle '墅帝'");

    // NEGATIVE CHECK: SENDER HANDLE MUST NOT BE MERGED WITH BUBBLE
    assert!(
        !res.regions.iter().any(|r| r.text.contains("墅帝") && r.text.contains("商场")),
        "Sender handle '墅帝：' must NOT be merged with dialogue bubble"
    );

    // 5. MESSAGE 3: NICKNAME "微笑的妍宝：" AND BUBBLE BODY
    assert!(res.regions.iter().any(|r| r.text.contains("微笑的妍宝")), "Must detect sender 3 '微笑的妍宝：'");
    assert!(res.regions.iter().any(|r| r.text.contains("我家也有开商场")), "Must detect message 3 body");

    // 6. MESSAGE 4: NICKNAME "只是个卖飞机的：" AND BUBBLE BODY
    assert!(res.regions.iter().any(|r| r.text.contains("只是个卖飞机的")), "Must detect sender 4 '只是个卖飞机的：'");
    assert!(res.regions.iter().any(|r| r.text.contains("虽然我只是个卖飞机的")), "Must detect message 4 body");

    // 7. MESSAGE 5: NICKNAME "低调、太子爷：" AND BUBBLE BODY
    assert!(res.regions.iter().any(|r| r.text.contains("低调、太子爷")), "Must detect sender 5 '低调、太子爷：'");
    assert!(res.regions.iter().any(|r| r.text.contains("银月广场")), "Must detect message 5 body");

    // 8. MESSAGE 6: NICKNAME "炎江七郎：" AND BUBBLE BODY
    assert!(res.regions.iter().any(|r| r.text.contains("炎江七郎")), "Must detect sender 6 '炎江七郎：'");
    assert!(res.regions.iter().any(|r| r.text.contains("我也")), "Must detect message 6 body");
}
