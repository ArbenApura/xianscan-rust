use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrLine {
    pub polygon: Vec<[i32; 2]>,
    pub text: String,
    pub score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrResult {
    pub text: String,
    pub score: f32,
    pub lines: Vec<(Vec<[i32; 2]>, String, f32)>,
}

/// Helper to decode CTC logits using greedy argmax with blank token suppression and probability estimation.
pub fn decode_ctc_slice(
    out_slice: &[f32],
    time_steps: usize,
    num_classes: usize,
    characters: &[String],
) -> Option<OcrResult> {
    let mut text = String::new();
    let mut prev_idx = 0_usize;
    let mut total_prob = 0.0_f32;
    let mut token_count = 0_usize;

    for t in 0..time_steps {
        let offset = t * num_classes;
        if offset + num_classes > out_slice.len() {
            break;
        }
        let mut max_idx = 0;
        let mut max_val = out_slice[offset];

        for c in 1..num_classes {
            let v = out_slice[offset + c];
            if v > max_val {
                max_val = v;
            }
        }

        for c in 1..num_classes {
            if out_slice[offset + c] == max_val {
                max_idx = c;
                break;
            }
        }

        if max_idx != 0 && max_idx != prev_idx {
            if max_idx < characters.len() {
                let ch = &characters[max_idx];
                if ch != "blank" {
                    text.push_str(ch);
                    let prob = (1.0 / (1.0 + (-max_val.max(-20.0).min(20.0)).exp())).clamp(0.0, 1.0);
                    total_prob += prob;
                    token_count += 1;
                }
            }
        }
        prev_idx = max_idx;
    }

    let avg_confidence = if token_count > 0 {
        total_prob / token_count as f32
    } else {
        0.0
    };

    let trimmed = text.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(OcrResult {
            text: trimmed,
            score: avg_confidence,
            lines: Vec::new(),
        })
    }
}

pub fn parse_dict_string(dict_str: &str) -> Vec<String> {
    if let Ok(json_chars) = serde_json::from_str::<Vec<String>>(dict_str) {
        json_chars
    } else {
        let mut list = vec!["blank".to_string()];
        for line in dict_str.lines() {
            list.push(line.to_string());
        }
        list.push(" ".to_string());
        list
    }
}
