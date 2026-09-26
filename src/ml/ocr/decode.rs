use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};

use super::confidence;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrLine {
    pub polygon: Vec<[i32; 2]>,
    pub text: String,
    pub score: f32,
    /// CALIBRATED CONFIDENCE (MEAN MAX SOFTMAX PROBABILITY, [0, 1]). ABSENT IN FIXTURES RECORDED BEFORE FEAT-003.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prob: Option<f32>,
}

impl OcrLine {
    /// THE CALIBRATED CONFIDENCE, OR AN ESTIMATE FROM THE LEGACY SCORE WHEN IT WAS NEVER RECORDED.
    pub fn prob_or_derived(&self) -> f32 {
        self.prob.unwrap_or_else(|| confidence::prob_from_legacy(self.score))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrResult {
    pub text: String,
    pub score: f32,
    pub lines: Vec<(Vec<[i32; 2]>, String, f32)>,
    /// CALIBRATED CONFIDENCE OF THE WHOLE RESULT (SAME AGGREGATION AS score).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prob: Option<f32>,
    /// CALIBRATED CONFIDENCE PER ENTRY OF lines (PARALLEL; MAY BE SHORTER IN OLD FIXTURES).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub line_probs: Vec<f32>,
}

impl OcrResult {
    /// THE CALIBRATED CONFIDENCE, OR AN ESTIMATE FROM THE LEGACY SCORE WHEN IT WAS NEVER RECORDED.
    pub fn prob_or_derived(&self) -> f32 {
        self.prob.unwrap_or_else(|| confidence::prob_from_legacy(self.score))
    }

    /// THE CALIBRATED CONFIDENCE OF lines[i], OR AN ESTIMATE FROM ITS LEGACY SCORE.
    pub fn line_prob(&self, i: usize) -> f32 {
        match self.line_probs.get(i) {
            Some(p) => *p,
            None => self.lines.get(i).map(|l| confidence::prob_from_legacy(l.2)).unwrap_or_else(|| self.prob_or_derived()),
        }
    }
}

// ONE WARNING PER PROCESS WHEN A RECOGNISER EMITS LOGITS INSTEAD OF PROBABILITIES (ADR-009)
static WARNED_LOGITS: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedCropEntry {
    pub crop_rect: [i32; 4],
    pub source_lang: Option<String>,
    pub result: OcrResult,
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
    let mut total_raw = 0.0_f32;
    let mut token_count = 0_usize;

    // THE CONTRACT IS A SOFTMAX ROW PER TIME STEP. A LOGITS EXPORT IS NORMALISED PER CHARACTER INSTEAD (FAIL SOFT)
    let is_prob = num_classes == 0
        || out_slice.len() < num_classes
        || confidence::row_is_probability(&out_slice[0..num_classes]);
    if !is_prob && !WARNED_LOGITS.swap(true, Ordering::Relaxed) {
        tracing::warn!("OCR recogniser output is not a probability distribution; normalising confidence per character");
    }

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

        if max_idx != 0 && max_idx != prev_idx
            && max_idx < characters.len() {
                let ch = &characters[max_idx];
                if ch != "blank" {
                    text.push_str(ch);
                    total_prob += confidence::legacy_from_prob(max_val);
                    total_raw += if is_prob {
                        max_val.clamp(0.0, 1.0)
                    } else {
                        let row = &out_slice[offset..offset + num_classes];
                        let denom: f32 = row.iter().map(|v| (v - max_val).exp()).sum();
                        if denom.is_finite() && denom > 0.0 { (1.0 / denom).clamp(0.0, 1.0) } else { 0.0 }
                    };
                    token_count += 1;
                }
            }
        prev_idx = max_idx;
    }

    let avg_confidence = if token_count > 0 {
        total_prob / token_count as f32
    } else {
        0.0
    };
    let avg_prob = if token_count > 0 {
        total_raw / token_count as f32
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
            prob: Some(avg_prob),
            line_probs: Vec::new(),
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
