use crate::ml::geometry::{box_score_fast, find_contours, get_mini_boxes, unclip_polygon};

/// DBNet representer (boxes_from_bitmap port): lines_map -> (boxes, scores)
pub fn lines_map_to_boxes(
    lines_map: &[f32],
    map_w: usize,
    map_h: usize,
    dest_w: usize,
    dest_h: usize,
    thresh: f32,
    box_thresh: f32,
    unclip_ratio: f32,
    max_candidates: usize,
    min_side: i32,
) -> (Vec<Vec<[i32; 2]>>, Vec<f32>) {
    let mut binary_map = vec![0_u8; map_w * map_h];
    for i in 0..(map_w * map_h) {
        if lines_map[i] > thresh {
            binary_map[i] = 255;
        }
    }

    let contours = find_contours(&binary_map, map_w, map_h);
    let mut boxes = Vec::new();
    let mut scores = Vec::new();

    for contour in contours.into_iter().take(max_candidates) {
        if contour.len() < 4 {
            continue;
        }
        let score = box_score_fast(lines_map, map_w, map_h, &contour);
        if score < box_thresh {
            continue;
        }

        let (points, sside) = get_mini_boxes(&contour);
        if sside < 2.0 {
            continue;
        }

        let expanded = match unclip_polygon(&points, unclip_ratio) {
            Some(exp) => exp,
            None => continue,
        };

        let (box_rect, sside2) = get_mini_boxes(&expanded);
        if (sside2 as i32) < min_side {
            continue;
        }

        let mut scaled_box = Vec::with_capacity(4);
        for p in box_rect {
            let sx = ((p[0] / map_w as f32) * dest_w as f32).round().clamp(0.0, dest_w as f32) as i32;
            let sy = ((p[1] / map_h as f32) * dest_h as f32).round().clamp(0.0, dest_h as f32) as i32;
            scaled_box.push([sx, sy]);
        }

        boxes.push(scaled_box);
        scores.push(score);
    }

    (boxes, scores)
}
