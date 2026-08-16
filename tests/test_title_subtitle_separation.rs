use xianscan_rust::ml::detect::{CHINESE_RE, PUNCT_ONLY};
use xianscan_rust::ml::geometry::calculate_box_angle_i32;

#[test]
fn test_mid_sentence_ellipsis_not_split() {
    let text = "你……是李婉儿，";
    assert!(!PUNCT_ONLY.is_match(text));
    assert!(CHINESE_RE.is_match(text));
}

#[test]
fn test_sample_45334_substring_deduplication() {
    let raw_crop_lines: Vec<&str> = vec![
        "嗯，他对你的评价",
        "极高，称你为……",
        "极高，",
        "嗯",
    ];
    let boxes: Vec<[[f32; 2]; 4]> = vec![
        [[0.0, 0.0], [200.0, 0.0], [200.0, 30.0], [0.0, 30.0]],
        [[0.0, 35.0], [180.0, 35.0], [180.0, 65.0], [0.0, 65.0]],
        [[0.0, 35.0], [60.0, 35.0], [60.0, 65.0], [0.0, 65.0]],
        [[0.0, 0.0], [30.0, 0.0], [30.0, 30.0], [0.0, 30.0]],
    ];

    let mut dedup_indices: Vec<usize> = Vec::new();
    for i in 0..raw_crop_lines.len() {
        let t = raw_crop_lines[i].trim();
        let b = &boxes[i];
        let mut dup = false;

        for &d in &dedup_indices {
            let dt = raw_crop_lines[d].trim();
            let db = &boxes[d];

            if t.contains(dt) || dt.contains(t) {
                let bx = b[0][0];
                let by = b[0][1];
                let bw = b[1][0] - b[0][0];
                let bh = b[2][1] - b[1][1];

                let dx = db[0][0];
                let dy = db[0][1];
                let dw = db[1][0] - db[0][0];
                let dh = db[2][1] - db[1][1];

                let ix = (0.0_f32).max((bx + bw).min(dx + dw) - bx.max(dx));
                let iy = (0.0_f32).max((by + bh).min(dy + dh) - by.max(dy));
                let inter = ix * iy;
                let min_area = (bw * bh).min(dw * dh).max(1.0);

                if inter / min_area > 0.40 {
                    if t.len() <= dt.len() {
                        dup = true;
                        break;
                    }
                }
            }
        }
        if !dup {
            dedup_indices.push(i);
        }
    }

    let kept_texts: Vec<&str> = dedup_indices.iter().map(|&i| raw_crop_lines[i]).collect();
    assert_eq!(kept_texts, vec!["嗯，他对你的评价", "极高，称你为……"]);
}

#[test]
fn test_horizontal_speech_bubble_angle_is_zero() {
    let poly = vec![[50, 100], [250, 100], [250, 140], [50, 140]];
    let angle = calculate_box_angle_i32(&poly);
    assert_eq!(angle, 0.0);
}
