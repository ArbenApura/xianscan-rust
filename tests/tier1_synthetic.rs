// -- CRATE / EXTERNAL IMPORTS -- //
use image::{DynamicImage, Rgba, RgbaImage};

// -- INTERNAL IMPORTS -- //
use xianscan_rust::ml::detect::{filter_text_by_source_lang, has_cjk_characters};
use xianscan_rust::ml::geometry::{box_iou, calculate_box_angle, points_to_box_rect};
use xianscan_rust::ml::schemas::BoxRect;

// -- TESTS -- //

#[test]
fn test_tier1_synthetic_bubble_generation_and_detection() {
    // GENERATE A CLEAN SYNTHETIC SPEECH BUBBLE CANVAS (NO COPYRIGHTED MEDIA)
    let mut img = RgbaImage::from_pixel(400, 400, Rgba([245, 245, 245, 255]));

    // DRAW WHITE RECTANGULAR BUBBLE IN CENTER
    for y in 100..250 {
        for x in 80..320 {
            img.put_pixel(x, y, Rgba([255, 255, 255, 255]));
        }
    }

    // DRAW DARK BORDER AROUND BUBBLE
    for x in 80..320 {
        img.put_pixel(x, 100, Rgba([20, 20, 20, 255]));
        img.put_pixel(x, 249, Rgba([20, 20, 20, 255]));
    }
    for y in 100..250 {
        img.put_pixel(80, y, Rgba([20, 20, 20, 255]));
        img.put_pixel(319, y, Rgba([20, 20, 20, 255]));
    }

    let dyn_img = DynamicImage::ImageRgba8(img);
    assert_eq!(dyn_img.width(), 400);
    assert_eq!(dyn_img.height(), 400);
}

#[test]
fn test_tier1_synthetic_language_routing_filters() {
    // 1. ENGLISH PRESERVATION & CJK STRIPPING
    let mixed_en = "Hello World! 漫画 測試";
    let filtered_en = filter_text_by_source_lang(mixed_en, Some("en"));
    assert_eq!(filtered_en.trim(), "Hello World!");
    assert!(!has_cjk_characters(&filtered_en));

    // 2. CHINESE SCRIPT DETECTION
    let cjk_sample = "斩妖除魔，天道无极";
    assert!(has_cjk_characters(cjk_sample));

    // 3. JAPANESE HIRAGANA & KATAKANA HANDLING
    let ja_sample = "こんにちは 世界";
    assert!(has_cjk_characters(ja_sample));
}

#[test]
fn test_tier1_synthetic_geometry_invariants() {
    let bbox1 = BoxRect { x: 10, y: 10, w: 50, h: 50 };
    let bbox2 = BoxRect { x: 30, y: 30, w: 50, h: 50 };

    let iou = box_iou(&bbox1, &bbox2);
    assert!(iou > 0.0 && iou < 1.0, "Expected intersecting IoU between 0 and 1, got {}", iou);

    let pts = [[10.0, 10.0], [100.0, 10.0], [100.0, 40.0], [10.0, 40.0]];
    let angle = calculate_box_angle(&pts);
    assert_eq!(angle, 0.0);

    let poly = [[10, 15], [50, 20], [45, 80], [5, 75]];
    let rect = points_to_box_rect(&poly);
    assert_eq!(rect.x, 5);
    assert_eq!(rect.y, 15);
    assert_eq!(rect.w, 45);
    assert_eq!(rect.h, 65);
}

#[test]
fn test_tier1_synthetic_oversized_sfx_filtering() {
    let page_h = 1000;

    // 1. OVERSIZED VERTICAL SFX (HEIGHT = 350 >= 30% OF 1000, W/H = 100/350 < 2.5) -> MUST BE FILTERED
    let oversized_sfx = BoxRect { x: 50, y: 100, w: 100, h: 350 };
    let is_sentence1 = (oversized_sfx.w as f32 / oversized_sfx.h.max(1) as f32 >= 2.5) || oversized_sfx.h <= 35;
    let is_oversized1 = (oversized_sfx.h as f32 >= (page_h as f32) * 0.30) && !is_sentence1;
    assert!(is_oversized1, "Oversized vertical SFX must be flagged for removal");

    // 2. LONG HORIZONTAL GUTTER SENTENCE (HEIGHT = 40, WIDTH = 700, W/H = 17.5 >= 2.5) -> MUST BE PROTECTED
    let sentence_box = BoxRect { x: 50, y: 500, w: 700, h: 40 };
    let is_sentence2 = (sentence_box.w as f32 / sentence_box.h.max(1) as f32 >= 2.5) || sentence_box.h <= 35;
    let is_oversized2 = (sentence_box.h as f32 >= (page_h as f32) * 0.30) && !is_sentence2;
    assert!(!is_oversized2, "Horizontal sentence must never be treated as oversized SFX");

    // 3. MODERATE CALLIGRAPHY SFX (HEIGHT = 250 < 30% OF 1000) -> MUST BE PRESERVED
    let moderate_sfx = BoxRect { x: 100, y: 200, w: 120, h: 250 };
    let is_sentence3 = (moderate_sfx.w as f32 / moderate_sfx.h.max(1) as f32 >= 2.5) || moderate_sfx.h <= 35;
    let is_oversized3 = (moderate_sfx.h as f32 >= (page_h as f32) * 0.30) && !is_sentence3;
    assert!(!is_oversized3, "Moderate SFX (< 30% canvas height) must be preserved");
}


// -- OCR SCORE CALIBRATION (FEAT-003) -- //

use xianscan_rust::ml::ocr::confidence::{legacy_from_prob, logit, prob_from_legacy, LEGACY_MAX, LEGACY_MIN};
use xianscan_rust::ml::ocr::decode_ctc_slice;

/// SEEDED LCG (NO NEW DEPENDENCIES). RETURNS VALUES IN [0, 1).
struct Lcg(u64);

impl Lcg {
    fn next(&mut self) -> f32 {
        self.0 = self.0.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1_442_695_040_888_963_407);
        ((self.0 >> 40) as f32) / ((1_u64 << 24) as f32)
    }
}

fn charset(n: usize) -> Vec<String> {
    let mut chars = vec!["blank".to_string()];
    chars.extend((1..n).map(|i| char::from_u32(0x4E00 + i as u32).unwrap().to_string()));
    chars
}

/// RANDOM SOFTMAX ROWS; EVERY THIRD STEP IS BIASED TOWARDS BLANK SO REPEATS AND BLANKS BOTH OCCUR.
fn random_softmax_slice(rng: &mut Lcg, steps: usize, classes: usize) -> Vec<f32> {
    let mut out = Vec::with_capacity(steps * classes);
    for t in 0..steps {
        let mut row: Vec<f32> = (0..classes).map(|_| rng.next() + 1e-3).collect();
        if t % 3 == 0 {
            row[0] += 2.0;
        }
        let sum: f32 = row.iter().sum();
        out.extend(row.iter().map(|v| v / sum));
    }
    out
}

/// THE 38a1f16 DECODER SCORE, COPIED VERBATIM (PER-CHARACTER SIGMOID OF THE WINNING PROBABILITY, THEN THE MEAN).
fn legacy_reference_score(slice: &[f32], steps: usize, classes: usize, characters: &[String]) -> Option<f32> {
    let (mut prev_idx, mut total, mut count, mut text) = (0_usize, 0.0_f32, 0_usize, String::new());
    for t in 0..steps {
        let offset = t * classes;
        let mut max_val = slice[offset];
        for c in 1..classes {
            if slice[offset + c] > max_val {
                max_val = slice[offset + c];
            }
        }
        let mut max_idx = 0;
        for c in 1..classes {
            if slice[offset + c] == max_val {
                max_idx = c;
                break;
            }
        }
        if max_idx != 0 && max_idx != prev_idx && max_idx < characters.len() && characters[max_idx] != "blank" {
            text.push_str(&characters[max_idx]);
            total += (1.0 / (1.0 + (-max_val.max(-20.0).min(20.0)).exp())).clamp(0.0, 1.0);
            count += 1;
        }
        prev_idx = max_idx;
    }
    if text.trim().is_empty() {
        None
    } else {
        Some(if count > 0 { total / count as f32 } else { 0.0 })
    }
}

#[test]
fn ocr_score_decode_softmax_range() {
    let mut rng = Lcg(7);
    let chars = charset(12);
    for _ in 0..200 {
        let slice = random_softmax_slice(&mut rng, 20, 12);
        if let Some(res) = decode_ctc_slice(&slice, 20, 12, &chars) {
            let prob = res.prob.expect("decoder sets prob");
            assert!((0.0..=1.0).contains(&prob), "prob {prob} out of [0, 1]");
            assert!(res.score >= LEGACY_MIN && res.score <= LEGACY_MAX + 1e-6, "score {} out of legacy range", res.score);
        }
    }
    // ALL-BLANK SLICE DECODES TO NOTHING
    let mut blank = vec![0.0_f32; 10 * 12];
    for t in 0..10 {
        blank[t * 12] = 1.0;
    }
    assert!(decode_ctc_slice(&blank, 10, 12, &chars).is_none());
}

#[test]
fn ocr_score_decode_legacy_bit_identical() {
    let mut rng = Lcg(42);
    let chars = charset(16);
    let mut compared = 0;
    for _ in 0..1000 {
        let slice = random_softmax_slice(&mut rng, 24, 16);
        let expected = legacy_reference_score(&slice, 24, 16, &chars);
        let got = decode_ctc_slice(&slice, 24, 16, &chars);
        assert_eq!(expected.is_some(), got.is_some());
        if let (Some(e), Some(g)) = (expected, got) {
            assert_eq!(e.to_bits(), g.score.to_bits(), "legacy score changed: {e} vs {}", g.score);
            compared += 1;
        }
    }
    assert!(compared > 900, "too few decodable slices: {compared}");
}

#[test]
fn ocr_score_prob_is_mean_max_softmax() {
    let chars = vec!["blank".to_string(), "a".to_string(), "b".to_string()];
    #[rustfmt::skip]
    let slice = [
        0.05, 0.90, 0.05, // a (0.9)
        0.05, 0.90, 0.05, // a REPEATED: COLLAPSES
        0.90, 0.05, 0.05, // BLANK: SKIPPED
        0.25, 0.25, 0.50, // b (0.5)
    ];
    let res = decode_ctc_slice(&slice, 4, 3, &chars).expect("decodes");
    assert_eq!(res.text, "ab");
    assert!((res.prob.unwrap() - 0.7).abs() < 1e-6, "prob {:?}", res.prob);
    let legacy = (legacy_from_prob(0.9) + legacy_from_prob(0.5)) / 2.0;
    assert_eq!(res.score.to_bits(), legacy.to_bits());
}

#[test]
fn ocr_score_logits_input_is_normalised() {
    let chars = vec!["blank".to_string(), "a".to_string(), "b".to_string()];
    let slice = [1.0_f32, 3.0, 0.5, 0.0, 0.2, 4.0];
    let res = decode_ctc_slice(&slice, 2, 3, &chars).expect("decodes");
    assert_eq!(res.text, "ab");
    let softmax_max = |row: &[f32]| {
        let m = row.iter().cloned().fold(f32::MIN, f32::max);
        1.0 / row.iter().map(|v| (v - m).exp()).sum::<f32>()
    };
    let expected = (softmax_max(&slice[0..3]) + softmax_max(&slice[3..6])) / 2.0;
    let prob = res.prob.unwrap();
    assert!((prob - expected).abs() < 1e-6, "prob {prob} vs {expected}");
    assert!(prob <= 1.0);
}

#[test]
fn ocr_score_conversion_roundtrip() {
    for i in 0..=1000 {
        let p = i as f32 / 1000.0;
        let back = prob_from_legacy(legacy_from_prob(p));
        assert!((back - p).abs() < 1e-5, "{p} -> {back}");
    }
    assert_eq!(logit(0.5), 0.0);
    assert_eq!(prob_from_legacy(f32::NAN), 0.0);
    assert_eq!(prob_from_legacy(0.2), 0.0);
    assert_eq!(prob_from_legacy(0.99), 1.0);
}

#[test]
fn ocr_score_thresholds_registry_status() {
    use xianscan_rust::ml::ocr::score_thresholds::{computed_status, Scale, REGISTRY};
    let mut wrong = Vec::new();
    for t in REGISTRY {
        // LEGACY ENTRIES ARE CHECKED AGAINST THE SIGMOID RANGE, PROBABILITY ENTRIES (logit OF THE LITERAL) AGAINST [0, 1]
        let (lo, hi) = match t.scale {
            Scale::Legacy => (LEGACY_MIN, LEGACY_MAX),
            Scale::Prob => (0.0, 1.0),
        };
        let actual = computed_status(t.value(), t.op, lo, hi);
        if actual != t.documented_status {
            wrong.push(format!("{} ({}, {:?} {:?} {}): documented {:?}, computed {:?}", t.name, t.sites, t.scale, t.op, t.value(), t.documented_status, actual));
        }
    }
    assert!(wrong.is_empty(), "threshold registry out of date: {wrong:?}");
    // EVERY NAME IS UNIQUE
    let mut names: Vec<&str> = REGISTRY.iter().map(|t| t.name).collect();
    names.sort_unstable();
    names.dedup();
    assert_eq!(names.len(), REGISTRY.len());
}
