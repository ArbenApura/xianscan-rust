use xianscan_rust::ml::detect::{
    clean_stray_ocr_artifacts, deduplicate_boxes, group_paragraphs, is_pure_watermark_region,
    merge_text_lines, sort_regions_top_to_bottom,
};
use xianscan_rust::ml::geometry::box_to_xywh_f32;

fn box_pts(x: f32, y: f32, w: f32, h: f32) -> Vec<[f32; 2]> {
    vec![[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
}

#[test]
fn test_case_4_bubble_tail_digit_stripping() {
    let raw = "我看你能嚣张\n到什么时候！200";
    let cleaned = clean_stray_ocr_artifacts(raw);
    assert_eq!(cleaned, "我看你能嚣张\n到什么时候！");
}

#[test]
fn test_case_5_clean_stray_ocr_artifacts_normal() {
    let raw = "哼，这么胡\n来，菜鸟一\n个！";
    let cleaned = clean_stray_ocr_artifacts(raw);
    assert_eq!(cleaned, "哼，这么胡\n来，菜鸟一\n个！");
}

#[test]
fn test_case_7_thought_tail_noise_filter() {
    assert!(is_pure_watermark_region("300"));
    assert!(is_pure_watermark_region("200"));
    assert!(is_pure_watermark_region("000"));
    assert!(is_pure_watermark_region("ooo"));
}

#[test]
fn test_case_9_system_card_prefix_merging() {
    let b1 = box_pts(464.0, 1200.0, 75.0, 50.0); // 嘟！
    let b2 = box_pts(542.0, 1198.0, 190.0, 50.0); // 恐惧值+0
    let texts = vec!["嘟！".to_string(), "恐惧值+0".to_string()];

    let (merged, _) = merge_text_lines(&[b1, b2], &[0.99, 0.99], Some(&texts), 0.40, 0.55, 1.35);
    assert_eq!(merged.len(), 1, "'嘟！' and '恐惧值+0' should merge on same row");
    let (x, _, w, _) = box_to_xywh_f32(&merged[0]);
    assert!(x <= 464.0 && x + w >= 732.0);
}

#[test]
fn test_case_11_sfx_exclamation_retention() {
    let raw = "咳！";
    let cleaned = clean_stray_ocr_artifacts(raw);
    assert_eq!(cleaned, "咳！");
}

#[test]
fn test_case_22_dialogue_paragraph_fragmentation_guard() {
    let b_left_top = box_pts(13.0, 807.0, 289.0, 74.0);
    let b_left_bot = box_pts(16.0, 876.0, 175.0, 34.0);
    let b_right = box_pts(520.0, 871.0, 194.0, 74.0);

    let boxes = vec![b_left_top, b_right, b_left_bot];
    let scores = vec![0.99992, 0.9982, 0.9997];
    let texts = vec![
        "算了，岁数也大了\n身体也不行\n1我还是".to_string(),
        "需要我带你升\n级吗？".to_string(),
        "乖乖练级吧。".to_string(),
    ];

    let (grouped_boxes, grouped_scores) = group_paragraphs(&boxes, &scores, Some(&texts), 0.20, 0.45, 1.50, 0.60);
    assert_eq!(grouped_boxes.len(), 2, "Expected 2 unified bubbles");

    let (dedup_boxes, _) = deduplicate_boxes(&grouped_boxes, &grouped_scores, 0.40);
    assert_eq!(dedup_boxes.len(), 2);

    let order = sort_regions_top_to_bottom(&dedup_boxes, 1201, 0.5);
    let left_idx = order[0];
    let right_idx = order[1];

    let (_lx, ly, lw, lh) = box_to_xywh_f32(&dedup_boxes[left_idx]);
    let (rx, _, _, _) = box_to_xywh_f32(&dedup_boxes[right_idx]);

    assert!(ly <= 807.0 && ly + lh >= 910.0, "Left bubble height encompasses all lines");
    assert!(lw >= 280.0);
    assert!(rx >= 500.0);
}
