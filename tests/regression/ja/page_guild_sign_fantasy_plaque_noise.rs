// -- INTERNAL IMPORTS -- //
use crate::common::get_or_analyze_fixture_with_lang;

// -- TESTS -- //

/// # JAPANESE REAL-PAGE REGRESSION: `page_guild_sign_fantasy_plaque_noise` (RESOLUTION: 960 × 1910)
///
/// ## CONTEXT & PURPOSE:
/// - Source: Production page 109982 (seq 2), native 960 × 1910.
/// - Scene: Guild building reveal — decorative in-world fantasy script lettering on the entrance plaque,
///   plus 5 speech bubbles / narration.
/// - PRODUCTION FAILURE (v0.5.0-beta.1): The plaque's fantasy script OCR'd as garbage
///   `"中1ェc70に4Φ17814"` @0.661 and formed a bogus FreeText region over the plaque
///   (typeset (222,882,181×41), translation: null).
/// - EXPECTED: Exactly 5 regions (5 DialogueBubbles); the plaque lettering is fully suppressed.
#[test]
fn test_regression_page_guild_sign_fantasy_plaque_noise() {
    let img = match crate::common::load_fixture_or_skip("ja", "page_guild_sign_fantasy_plaque_noise/page.webp") {
        Some(i) => i,
        None => {
            eprintln!("[INFO] Skipping test_regression_page_guild_sign_fantasy_plaque_noise: fixture not found");
            return;
        }
    };

    let res = get_or_analyze_fixture_with_lang(&img, Some("ja"));
    println!("=== Japanese Guild Sign Fantasy Plaque Noise Page ===");
    println!("Detected {} regions:", res.regions.len());
    for (i, r) in res.regions.iter().enumerate() {
        println!(
            "  [Region {}] id={}, kind={:?}, text=\"{}\", conf={:.3}, angle={:.2}, vertical={}, box={:?}, bubble_box={:?}",
            i,
            r.id,
            r.kind,
            r.text.replace('\n', "\\n"),
            r.confidence,
            r.angle,
            r.vertical,
            r.box_,
            r.bubble_box
        );
    }

    // 1. EXACT ELEMENT COUNTS: EXACTLY 5 DIALOGUE BUBBLES, ZERO FREE TEXT, ZERO SFX
    crate::assert_element_counts!(res, 5, 5, 0, 0);

    // 2. NEGATIVE GUARDS: NO FANTASY-PLAQUE OCR GARBAGE
    for r in &res.regions {
        let t = r.text.replace('\n', "");
        assert!(
            !t.contains("c70") && !t.contains("4Φ17814"),
            "Fantasy plaque garbage must not be extracted, got: '{}'",
            r.text.replace('\n', "\\n")
        );
    }

    // 3. KEY DIALOGUE SANITY
    assert!(
        res.regions.iter().any(|r| (r.text.contains("ギ") || r.text.contains("ギルド")) && r.box_.y > 1500),
        "'ここがギルドか' bubble must exist at bottom panel"
    );
    assert!(res.regions.iter().any(|r| r.text.contains("なるほど")), "'…なるほど' bubble must exist");
    assert!(
        res.regions.iter().any(|r| r.text.contains("敬語") && r.text.contains("父親")),
        "'領主である俺の父親にすら敬語を使ってなかった' bubble must exist"
    );
}
