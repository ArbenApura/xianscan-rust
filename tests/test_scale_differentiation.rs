use xianscan_rust::ml::detect::{group_paragraphs, merge_text_lines};
use xianscan_rust::ml::geometry::box_to_xywh_f32;

fn box_pts(x: f32, y: f32, w: f32, h: f32) -> Vec<[f32; 2]> {
    vec![[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
}

/// # Scale Test: Whisper Font Tight Vertical Gap Grouping
///
/// ## Purpose:
/// Verifies small whisper font lines ($h=14\text{px}$) with tight spacing ($gap=5\text{px}$) group together.
#[test]
fn test_whisper_lines_group_at_tight_gap() {
    let l1 = box_pts(80.0, 100.0, 120.0, 14.0);
    let l2 = box_pts(80.0, 119.0, 120.0, 14.0); // gap = 5px < 0.45 * 14 = 6.3px
    let (merged, _) = group_paragraphs(&[l1, l2], &[0.9, 0.9], None, 0.20, 0.45, 1.50, 0.60);
    assert_eq!(merged.len(), 1, "Whisper lines with gap=5px must group");
}

/// # Scale Test: Whisper Font Wide Gap Separation
///
/// ## Purpose:
/// Verifies small whisper font lines ($h=14\text{px}$) with wide gap ($gap=9\text{px}$) remain separate.
#[test]
fn test_whisper_lines_separate_at_wide_gap() {
    let l1 = box_pts(80.0, 100.0, 120.0, 14.0);
    let l2 = box_pts(80.0, 123.0, 120.0, 14.0); // gap = 9px > 0.45 * 14 = 6.3px
    let (merged, _) = group_paragraphs(&[l1, l2], &[0.9, 0.9], None, 0.20, 0.45, 1.50, 0.60);
    assert_eq!(merged.len(), 2, "Whisper lines with gap=9px must stay separate");
}

/// # Scale Test: Standard Dialogue Tight Gap Grouping
///
/// ## Purpose:
/// Verifies standard dialogue text lines ($h=26\text{px}$) group within paragraph thresholds.
#[test]
fn test_dialogue_lines_group_at_tight_gap() {
    let l1 = box_pts(100.0, 200.0, 200.0, 26.0);
    let l2 = box_pts(100.0, 236.0, 200.0, 26.0); // gap = 10px < 0.45 * 26 = 11.7px
    let (merged, _) = group_paragraphs(&[l1, l2], &[0.9, 0.9], None, 0.20, 0.45, 1.50, 0.60);
    assert_eq!(merged.len(), 1);
}

/// # Scale Test: Panel Gutter Separation for Standard Dialogue
///
/// ## Purpose:
/// Verifies dialogue lines across a gutter gap ($gap=15\text{px}$) are kept in separate regions.
#[test]
fn test_dialogue_lines_separate_at_gutter() {
    let l1 = box_pts(100.0, 200.0, 200.0, 26.0);
    let l2 = box_pts(100.0, 241.0, 200.0, 26.0); // gap = 15px > 0.45 * 26 = 11.7px
    let (merged, _) = group_paragraphs(&[l1, l2], &[0.9, 0.9], None, 0.20, 0.45, 1.50, 0.60);
    assert_eq!(merged.len(), 2);
}

/// # Scale Test: Disparate Font Size Non-Grouping Invariant
///
/// ## Purpose:
/// Verifies that small dialogue lines ($h=14\text{px}$) never group with giant SFX/Title lines ($h=45\text{px}$).
#[test]
fn test_different_font_sizes_never_group() {
    let l1 = box_pts(80.0, 100.0, 120.0, 14.0);
    let l2 = box_pts(80.0, 118.0, 120.0, 45.0); // ratio = 45 / 14 = 3.21 > 1.50
    let (merged, _) = group_paragraphs(&[l1, l2], &[0.9, 0.9], None, 0.20, 0.45, 1.50, 0.60);
    assert_eq!(merged.len(), 2, "Lines with h1=14 and h2=45 must stay separate");
}

/// # Scale Test: Adjacent Multi-Line Bubble Non-Chaining
///
/// ## Purpose:
/// Verifies that 4-line left bubble and 4-line right bubble do not merge via transitive spatial chaining.
#[test]
fn test_adjacent_bubbles_not_merged_via_chaining() {
    // Left bubble: 4 lines at cx=146
    let l1 = box_pts(82.0, 662.0, 128.0, 32.0);
    let l2 = box_pts(82.0, 696.0, 128.0, 32.0);
    let l3 = box_pts(82.0, 729.0, 128.0, 32.0);
    let l4 = box_pts(82.0, 761.0, 128.0, 32.0);

    // Right bubble: 4 lines at cx=276.5
    let r1 = box_pts(170.0, 760.0, 213.0, 32.0);
    let r2 = box_pts(170.0, 793.0, 213.0, 32.0);
    let r3 = box_pts(170.0, 826.0, 213.0, 32.0);
    let r4 = box_pts(170.0, 860.0, 213.0, 32.0);

    let all_boxes = vec![l1, l2, l3, l4, r1, r2, r3, r4];
    let all_scores = vec![0.99; 8];

    let (result, _) = group_paragraphs(&all_boxes, &all_scores, None, 0.20, 0.45, 1.50, 0.60);
    assert_eq!(result.len(), 2, "Adjacent side-by-side bubbles must not merge");
}

/// # Scale Test: Suspicious X-Overlap Horizontal Merge Guard
///
/// ## Purpose:
/// Verifies that overlapping horizontal line segments with mismatched alignment stay independent.
#[test]
fn test_merge_text_lines_suspicious_x_overlap() {
    let l4 = box_pts(82.0, 761.0, 128.0, 32.0);
    let r1 = box_pts(184.0, 760.0, 200.0, 32.0);

    let (merged, _) = merge_text_lines(&[l4, r1], &[0.99, 0.99], None, 0.40, 0.55, 1.35);
    assert_eq!(merged.len(), 2, "Suspicious X-overlap must prevent horizontal line merge");

    let (x0, _, _, _) = box_to_xywh_f32(&merged[0]);
    let (x1, _, _, _) = box_to_xywh_f32(&merged[1]);
    assert_eq!(x0.min(x1), 82.0);
    assert_eq!(x0.max(x1), 184.0);
}
