//! PER-MODEL ENGINE LOCKS (FEAT-004 PHASE 10, ADR-002).
//!
//! ONE MUTEX PER MODEL INSTEAD OF ONE FOR THE WHOLE ENGINE, SO A CLEAN (LAMA) NO LONGER WAITS BEHIND AN ANALYZE OR A
//! RESLICE, AND A RELOAD REPLACES ONE MODEL AT A TIME.

use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use image::DynamicImage;

use super::engine::{load_detector, load_inpainter, load_ocr, PipelineEngine};
use crate::ml::detect::ComicTextDetector;
use crate::ml::inpaint::LamaInpainter;
use crate::ml::ocr::RapidOcr;
use crate::ml::reslice::{detect_forbidden_zones_in_window, ZoneModels};

/// THE MODELS BEHIND THEIR OWN LOCKS.
///
/// LOCK ORDER RULE: detector, THEN ocr, THEN inpainter. NEVER TAKE AN EARLIER ONE WHILE HOLDING A LATER ONE. ANALYZE
/// TAKES detector AND ocr AND RELEASES detector AFTER FUSION; CLEAN TAKES ONLY inpainter; RESLICE TAKES ocr (AND
/// detector ONLY WHEN THERE IS NO ocr) FOR ONE DETECTION WINDOW AT A TIME.
pub struct SharedEngine {
    pub detector: Mutex<Option<ComicTextDetector>>,
    pub ocr: Mutex<Option<RapidOcr>>,
    pub inpainter: Mutex<Option<LamaInpainter>>,
}

/// LOCKS A MODEL, RECOVERING A POISONED LOCK (A REQUEST PANICKED WHILE HOLDING IT). THE BOOL IS TRUE WHEN IT WAS
/// POISONED, SO THE CALLER CAN SCHEDULE A REBUILD OF THAT MODEL.
pub fn lock_recover<T>(m: &Mutex<T>) -> (MutexGuard<'_, T>, bool) {
    match m.lock() {
        Ok(guard) => (guard, false),
        Err(poisoned) => {
            m.clear_poison();
            (poisoned.into_inner(), true)
        }
    }
}

impl SharedEngine {
    pub fn from_engine(e: PipelineEngine) -> Self {
        Self { detector: Mutex::new(e.detector), ocr: Mutex::new(e.ocr), inpainter: Mutex::new(e.inpainter) }
    }

    /// TRUE WHEN ANY MODEL LOCK IS POISONED.
    pub fn is_poisoned(&self) -> bool {
        self.detector.is_poisoned() || self.ocr.is_poisoned() || self.inpainter.is_poisoned()
    }

    /// REPLACES EVERY MODEL, ONE AT A TIME IN LOCK ORDER. EACH OLD MODEL IS DROPPED BEFORE ITS REPLACEMENT LOADS, SO
    /// PEAK MEMORY IS ONE MODEL, NOT TWO ENGINES (F2). A REQUEST WAITS ONLY FOR THE MODEL IT NEEDS.
    pub fn reload(&self, models_dir: &Path) {
        {
            let (mut g, _) = lock_recover(&self.detector);
            *g = None;
            *g = load_detector(models_dir);
        }
        {
            let (mut g, _) = lock_recover(&self.ocr);
            *g = None;
            *g = load_ocr(models_dir);
        }
        {
            let (mut g, _) = lock_recover(&self.inpainter);
            *g = None;
            *g = load_inpainter(models_dir);
        }
    }
}

impl ZoneModels for &SharedEngine {
    fn any(&mut self) -> bool {
        // ONE LOCK AT A TIME (THE ocr GUARD IS DROPPED BEFORE detector IS TAKEN)
        let has_ocr = lock_recover(&self.ocr).0.is_some();
        has_ocr || lock_recover(&self.detector).0.is_some()
    }

    fn zones_in_window(&mut self, canvas: &DynamicImage, window_top: u32, window_bottom: u32, safety_margin: i32) -> Vec<(i32, i32)> {
        // OCR FIRST; THE DETECTOR IS ONLY THE FALLBACK WHEN NO OCR IS LOADED. LOCKS ARE HELD FOR THIS WINDOW ONLY.
        let (mut ocr, _) = lock_recover(&self.ocr);
        if ocr.is_some() {
            return detect_forbidden_zones_in_window(canvas, window_top, window_bottom, safety_margin, None, ocr.as_mut());
        }
        drop(ocr);
        let (mut det, _) = lock_recover(&self.detector);
        detect_forbidden_zones_in_window(canvas, window_top, window_bottom, safety_margin, det.as_mut(), None)
    }
}
