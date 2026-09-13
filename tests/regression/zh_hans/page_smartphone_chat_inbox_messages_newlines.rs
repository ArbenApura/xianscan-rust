// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;
use xianscan_rust::ml::schemas::RegionKind;

// -- TESTS -- //

#[test]
fn test_regression_page_smartphone_chat_inbox_messages_newlines() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_smartphone_chat_inbox_messages_newlines") {
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

    // 1. EXACT ELEMENT COUNTS: 8 REGIONS (0 DIALOGUE BUBBLES, 0 SFX, 8 FREE TEXT HEADER/TAB/MESSAGE CARDS)
    crate::assert_element_counts!(res, 8, 0, 0, 8);

    // 2. HEADER: "消息(99+)"
    let r0 = res.regions.iter().find(|r| r.text.contains("消息"));
    assert!(r0.is_some(), "Must detect inbox header '消息(99+)'");
    assert_eq!(r0.unwrap().kind, RegionKind::FreeText);

    // 3. INBOX MESSAGE 1: "锦王\n钱总，我诚挚向您道歉！..."
    let r5 = res.regions.iter().find(|r| r.text.contains("锦王"));
    assert!(r5.is_some(), "Must detect chat message from '锦王'");
    let r5 = r5.unwrap();
    assert_eq!(r5.kind, RegionKind::FreeText);
    assert!(r5.text.starts_with("锦王\n"), "Sender name '锦王' must be followed by a newline");
    assert!(r5.text.contains("向您道歉"), "Must contain apology message body");
    crate::assert_region_bounds!(r5, RegionKind::FreeText, 231, 921, 494, 164, 20);

    // 4. INBOX MESSAGE 2: "爽爽\n钱哥哥，太感谢你了..."
    let r6 = res.regions.iter().find(|r| r.text.contains("爽爽"));
    assert!(r6.is_some(), "Must detect chat message from '爽爽'");
    let r6 = r6.unwrap();
    assert_eq!(r6.kind, RegionKind::FreeText);
    assert!(r6.text.starts_with("爽爽\n"), "Sender name '爽爽' must be followed by a newline");
    assert!(r6.text.contains("太感谢你了"), "Must contain gratitude message body");
    crate::assert_region_bounds!(r6, RegionKind::FreeText, 230, 1193, 502, 162, 20);

    // 5. INBOX MESSAGE 3: "茶茶\n钱哥哥，刚刚我正准备..."
    let r7 = res.regions.iter().find(|r| r.text.contains("茶茶"));
    assert!(r7.is_some(), "Must detect chat message from '茶茶'");
    let r7 = r7.unwrap();
    assert_eq!(r7.kind, RegionKind::FreeText);
    assert!(r7.text.starts_with("茶茶\n"), "Sender name '茶茶' must be followed by a newline");
    assert!(r7.text.contains("徐少"), "Must contain message body mentioning Xu Shao");
    crate::assert_region_bounds!(r7, RegionKind::FreeText, 227, 1479, 508, 164, 20);
}
