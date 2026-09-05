// -- INTERNAL IMPORTS -- //
use crate::common::{clean_fixture_with_cache, get_or_analyze_fixture_with_lang};

// -- TESTS -- //

/// # CHINESE REAL-PAGE REGRESSION: `page_master_yuan_huan_ellipsis_double_bubble` (RESOLUTION: 827 × 1834)
///
/// ## CONTEXT & PURPOSE:
/// - Source: Production page 111088 (seq 13), native 827 × 1834 uncompressed.
/// - Scene: Dialogue between Young Master Zheng and Master Yuan Huan regarding a fake birthday artifact gift.
/// - Defect: In the top-left panel, a connected double-lobe speech balloon has an upper lobe with "……"
///   and a lower lobe with "袁桓大师。". The "……" is not translated, but because it was not tracked as
///   a visual occupant, "袁桓大师。" was treated as a sole occupant and its typeset_box was centered
///   to the balloon centroid (y = 122), dragging it right across the waist between the lobes.
///   Additionally, white bubble cavity inpainting cleared the "……", leaving an empty upper lobe.
/// - EXPECTED:
///   1. "袁桓大师。" must remain anchored in its lower chamber (typeset_box.y >= 145, never snapped to y <= 135).
///   2. The upper lobe must not be invaded by the lower utterance's typesetting envelope.
///   3. All 6 dialogue utterances must be accurately captured with zero corrupted grouping.
#[test]
fn test_regression_page_master_yuan_huan_ellipsis_double_bubble() {
    let img = match crate::common::load_fixture_or_skip("zh_hans", "page_master_yuan_huan_ellipsis_double_bubble/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_master_yuan_huan_ellipsis_double_bubble: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("zh_hans"));
    println!("=== Chinese Master Yuan Huan Ellipsis Double Bubble (827x1834) ===");
    println!("Detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  [Region {}] id={}, kind={:?}, text=\"{}\", conf={:.3}, angle={:.2}, vertical={}, box={:?}, bubble_box={:?}, typeset_box={:?}",
            i,
            r.id,
            r.kind,
            r.text.replace('\n', "\\n"),
            r.confidence,
            r.angle,
            r.vertical,
            r.box_,
            r.bubble_box,
            r.typeset_box
        );
    }

    // 1. AT LEAST 6 DIALOGUE REGIONS MUST BE DETECTED
    assert!(
        res.regions.len() >= 6,
        "Expected at least 6 regions on page 111088, got {}",
        res.regions.len()
    );

    // 2. TARGET REGION: "袁桓大师。" IN TOP-LEFT DOUBLE BUBBLE
    let yuan_huan = res
        .regions
        .iter()
        .find(|r| r.text.contains("袁桓大师"))
        .expect("Master Yuan Huan dialogue bubble '袁桓大师。' must be detected");

    // TIGHT TEXT BOUNDS CLAMPING: TEXT LIES IN LOWER LOBE (y >= 145, y + h <= 205)
    assert!(
        yuan_huan.box_.y >= 145,
        "OCR text box y for '袁桓大师。' must be anchored in the lower chamber (y >= 145), got y = {}",
        yuan_huan.box_.y
    );
    assert!(
        yuan_huan.box_.y + yuan_huan.box_.h <= 205,
        "OCR text box bottom for '袁桓大师。' must not exceed lower lobe (y + h <= 205), got bottom = {}",
        yuan_huan.box_.y + yuan_huan.box_.h
    );

    // 3. TYPESET BOX CENTERING REJECTION GUARD:
    // MUST NEVER BE DRAGGED TO BALLOON CENTROID (y <= 135, e.g. y = 122) ACROSS THE WAIST
    if let Some(tb) = &yuan_huan.typeset_box {
        assert!(
            tb.y >= 145,
            "typeset_box y for '袁桓大师。' must remain anchored in lower lobe (tb.y >= 145), but was dragged to y = {}",
            tb.y
        );
        assert!(
            tb.y + tb.h <= 210,
            "typeset_box bottom for '袁桓大师。' must not bleed below bubble (tb.y + tb.h <= 210), got = {}",
            tb.y + tb.h
        );
    }

    // 4. VERIFY ALL OTHER KEY DIALOGUES PRESENT & UNCORRUPTED
    let really_true = res
        .regions
        .iter()
        .find(|r| r.text.contains("他说的是") || r.text.contains("真的吗"))
        .expect("Dialogue '他说的是真的吗？' must be detected");
    assert!(
        really_true.text.contains("真的吗"),
        "Bubble text must contain '真的吗', got: '{}'",
        really_true.text.replace('\n', "\\n")
    );

    let dare_scam = res
        .regions
        .iter()
        .find(|r| r.text.contains("准备寿礼") || r.text.contains("敢骗我"))
        .expect("Dialogue '我为爷爷准备寿礼，你竟然敢骗我？' must be detected");
    assert!(
        dare_scam.text.contains("敢骗我"),
        "Bubble text must contain '敢骗我', got: '{}'",
        dare_scam.text.replace('\n', "\\n")
    );

    let let_me_explain = res
        .regions
        .iter()
        .find(|r| r.text.contains("郑少") && r.text.contains("解释"))
        .expect("Dialogue '郑少，你听我解释。' must be detected");
    assert!(
        let_me_explain.text.contains("解释"),
        "Bubble text must contain '解释', got: '{}'",
        let_me_explain.text.replace('\n', "\\n")
    );

    let compensate = res
        .regions
        .iter()
        .find(|r| r.text.contains("补偿") || r.text.contains("法器"))
        .expect("Dialogue '郑少，我这也是没办法...补偿您的！' must be detected");
    assert!(
        compensate.text.contains("补偿"),
        "Bubble text must contain '补偿', got: '{}'",
        compensate.text.replace('\n', "\\n")
    );

    let hmph = res
        .regions
        .iter()
        .find(|r| r.text.contains("哼"))
        .expect("Dialogue '哼。' must be detected");
    assert!(
        hmph.text.contains("哼"),
        "Bubble text must contain '哼', got: '{}'",
        hmph.text.replace('\n', "\\n")
    );

    // 5. SHRINKWRAP INPAINTING PRESERVATION:
    // "……" IN THE UPPER LOBE MUST NOT BE WIPED OUT
    if let Some(cleaned) = clean_fixture_with_cache(&img, &res) {
        let rgb = cleaned.to_rgb8();
        let mut min_lum = 255u8;
        for y in 109..119 {
            for x in 109..153 {
                let p = rgb.get_pixel(x, y);
                let lum = ((p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000) as u8;
                min_lum = min_lum.min(lum);
            }
        }
        assert!(
            min_lum < 180,
            "Upper lobe ellipsis '……' must be preserved as dark ink, but min luminance was {}",
            min_lum
        );
    }
}
