//! CHECKED IMAGE INTAKE: EVERY SIZE IS KNOWN AND BOUNDED BEFORE ANY PIXEL BUFFER IS ALLOCATED.
//! LIMIT VALUES COME FROM FEAT-002 ADR-001; ENV OVERRIDES ARE READ ONCE AT STARTUP.

use std::io::Cursor;

use axum::http::StatusCode;
use image::{DynamicImage, ImageReader};

/// SMALLEST / LARGEST PAGE HEIGHTS A RESLICE MAY ASK FOR.
pub const MIN_SLICE_HEIGHT: u32 = 256;
pub const MAX_SLICE_HEIGHT: u32 = 20_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IntakeLimits {
    /// LONGEST ALLOWED EDGE OF A SINGLE IMAGE, IN PIXELS.
    pub max_edge: u32,
    /// MOST PIXELS A SINGLE IMAGE MAY HOLD.
    pub max_image_pixels: u64,
    /// DECODER ALLOCATION BUDGET FOR ONE IMAGE, IN BYTES.
    pub max_image_alloc: u64,
    /// MOST IMAGES ONE RESLICE REQUEST MAY CARRY.
    pub max_images: usize,
    /// MOST PIXELS THE STITCHED CANVAS MAY HOLD.
    pub max_canvas_pixels: u64,
    /// LARGEST FACTOR AN IMAGE MAY BE SCALED UP BY TO MATCH THE WIDEST ONE.
    pub max_width_ratio: u32,
}

impl Default for IntakeLimits {
    fn default() -> Self {
        Self {
            max_edge: 65_535,
            max_image_pixels: 100_000_000,
            max_image_alloc: 512 * 1024 * 1024,
            max_images: 400,
            max_canvas_pixels: 200_000_000,
            max_width_ratio: 8,
        }
    }
}

impl IntakeLimits {
    /// DEFAULTS PLUS THE OPTIONAL `XIANSCAN_MAX_RESLICE_MP` (CANVAS) AND
    /// `XIANSCAN_MAX_IMAGE_MP` (PER IMAGE) OVERRIDES, IN MEGAPIXELS.
    pub fn from_env() -> Self {
        let mut limits = Self::default();
        if let Some(mp) = env_megapixels("XIANSCAN_MAX_RESLICE_MP") {
            limits.max_canvas_pixels = mp;
        }
        if let Some(mp) = env_megapixels("XIANSCAN_MAX_IMAGE_MP") {
            limits.max_image_pixels = mp;
            // KEEP THE DECODER BUDGET ABLE TO HOLD AN RGBA IMAGE AT THE NEW CAP
            limits.max_image_alloc = limits.max_image_alloc.max(mp.saturating_mul(4));
        }
        limits
    }
}

fn env_megapixels(name: &str) -> Option<u64> {
    let raw = std::env::var(name).ok()?;
    match raw.trim().parse::<u64>() {
        Ok(mp) if mp > 0 => Some(mp.saturating_mul(1_000_000)),
        _ => {
            tracing::warn!("Ignoring {}={:?}: expected a positive whole number of megapixels", name, raw);
            None
        }
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum IntakeError {
    #[error("Image {index} could not be decoded: {reason}")]
    Undecodable { index: usize, reason: String },
    #[error("Image {index} is {width} x {height}, which is over the size limit")]
    TooLarge { index: usize, width: u32, height: u32 },
    #[error("Too many images: {count} (the limit is {max})")]
    TooManyImages { count: usize, max: usize },
    #[error("The stitched canvas would be {pixels} pixels (the limit is {max})")]
    CanvasTooLarge { pixels: u64, max: u64 },
    #[error("Image {index} is only {width} px wide; stretching it to {max_w} px is over the width ratio limit")]
    WidthRatio { index: usize, width: u32, max_w: u32 },
    #[error("Invalid page heights: {0}")]
    InvalidHeights(String),
}

impl IntakeError {
    pub fn status(&self) -> StatusCode {
        match self {
            Self::TooManyImages { .. } | Self::CanvasTooLarge { .. } => StatusCode::PAYLOAD_TOO_LARGE,
            _ => StatusCode::UNPROCESSABLE_ENTITY,
        }
    }
}

/// READS ONLY THE IMAGE HEADER; NO PIXEL DATA IS DECODED.
pub fn probe_dimensions(bytes: &[u8]) -> Result<(u32, u32), String> {
    ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .into_dimensions()
        .map_err(|e| e.to_string())
}

/// DECODES ONE IMAGE AFTER CHECKING ITS HEADER AGAINST THE LIMITS, WITH THE DECODER ITSELF CAPPED TOO.
pub fn decode_image_limited(bytes: &[u8], index: usize, limits: &IntakeLimits) -> Result<DynamicImage, IntakeError> {
    let (width, height) = probe_dimensions(bytes).map_err(|reason| IntakeError::Undecodable { index, reason })?;
    if width > limits.max_edge
        || height > limits.max_edge
        || u64::from(width) * u64::from(height) > limits.max_image_pixels
    {
        return Err(IntakeError::TooLarge { index, width, height });
    }

    let mut decoder_limits = image::Limits::default();
    decoder_limits.max_image_width = Some(limits.max_edge);
    decoder_limits.max_image_height = Some(limits.max_edge);
    decoder_limits.max_alloc = Some(limits.max_image_alloc);

    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| IntakeError::Undecodable { index, reason: e.to_string() })?;
    reader.limits(decoder_limits);
    reader.decode().map_err(|e| match e {
        image::ImageError::Limits(_) => IntakeError::TooLarge { index, width, height },
        other => IntakeError::Undecodable { index, reason: other.to_string() },
    })
}

/// HEIGHT OF AN IMAGE AFTER SCALING IT TO `max_w`. SAME ROUNDING AS THE STITCHER USES.
pub fn scaled_height(w: u32, h: u32, max_w: u32) -> u32 {
    if w == max_w {
        h
    } else {
        (h as f32 * (max_w as f32 / w as f32)).round() as u32
    }
}

/// RETURNS `(max_w, total_h)` OF THE STITCHED CANVAS, OR THE REASON IT MAY NOT BE BUILT.
pub fn plan_canvas(dims: &[(u32, u32)], limits: &IntakeLimits) -> Result<(u32, u64), IntakeError> {
    if dims.len() > limits.max_images {
        return Err(IntakeError::TooManyImages { count: dims.len(), max: limits.max_images });
    }
    let max_w = dims.iter().map(|&(w, _)| w).max().unwrap_or(0);
    let max_ratio = u64::from(limits.max_width_ratio);

    let mut total_h = 0_u64;
    for (index, &(w, h)) in dims.iter().enumerate() {
        if w == 0 || u64::from(w) * max_ratio < u64::from(max_w) {
            return Err(IntakeError::WidthRatio { index, width: w, max_w });
        }
        total_h = total_h
            .checked_add(u64::from(scaled_height(w, h, max_w)))
            .ok_or(IntakeError::CanvasTooLarge { pixels: u64::MAX, max: limits.max_canvas_pixels })?;
    }

    let pixels = u64::from(max_w).checked_mul(total_h).unwrap_or(u64::MAX);
    if pixels > limits.max_canvas_pixels || total_h > u64::from(u32::MAX) {
        return Err(IntakeError::CanvasTooLarge { pixels, max: limits.max_canvas_pixels });
    }
    Ok((max_w, total_h))
}

/// PROBES EVERY HEADER AND PLANS THE COMBINED CANVAS, THEN DECODES. NOTHING IS DECODED
/// UNLESS THE WHOLE SET FITS, AND ANY UNREADABLE PART FAILS THE SET (NAMING ITS INDEX).
pub fn decode_for_canvas<B: AsRef<[u8]>>(parts: &[B], limits: &IntakeLimits) -> Result<Vec<DynamicImage>, IntakeError> {
    if parts.len() > limits.max_images {
        return Err(IntakeError::TooManyImages { count: parts.len(), max: limits.max_images });
    }
    let dims = parts
        .iter()
        .enumerate()
        .map(|(index, part)| {
            probe_dimensions(part.as_ref()).map_err(|reason| IntakeError::Undecodable { index, reason })
        })
        .collect::<Result<Vec<_>, _>>()?;
    plan_canvas(&dims, limits)?;
    parts
        .iter()
        .enumerate()
        .map(|(index, part)| decode_image_limited(part.as_ref(), index, limits))
        .collect()
}

/// REQUIRES `256 <= min <= target <= max <= 20000`.
pub fn validate_heights(target: u32, min: u32, max: u32) -> Result<(), IntakeError> {
    if min < MIN_SLICE_HEIGHT || max > MAX_SLICE_HEIGHT || min > target || target > max {
        return Err(IntakeError::InvalidHeights(format!(
            "need {MIN_SLICE_HEIGHT} <= min ({min}) <= target ({target}) <= max ({max}) <= {MAX_SLICE_HEIGHT}"
        )));
    }
    Ok(())
}
