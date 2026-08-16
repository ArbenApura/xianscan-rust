use xianscan_rust::ml::schemas::BoxRect;
use xianscan_rust::ml::watermark::is_likely_watermark;

#[test]
fn test_watermark_remover_keywords() {
    let rect = BoxRect { x: 100, y: 100, w: 200, h: 40 };
    assert!(is_likely_watermark(&rect, "www.mangaupdates.com", 800, 1200));
    assert!(is_likely_watermark(&rect, "Join our Discord server", 800, 1200));
    assert!(is_likely_watermark(&rect, "Scanlated by Bilibili", 800, 1200));
}

#[test]
fn test_clean_story_text_not_watermark() {
    let rect = BoxRect { x: 200, y: 300, w: 150, h: 80 };
    assert!(!is_likely_watermark(&rect, "你到底是谁？！", 800, 1200));
    assert!(!is_likely_watermark(&rect, "顶级人物十名。", 800, 1200));
}

#[test]
fn test_border_micro_stamp_suppressed() {
    // Extreme edge tiny strip
    let rect = BoxRect { x: 5, y: 5, w: 50, h: 15 };
    assert!(is_likely_watermark(&rect, "tiny", 800, 1200));
}
