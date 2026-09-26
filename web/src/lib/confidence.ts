// OCR CONFIDENCE DISPLAY (FEAT-003 ADR-006).
// REGIONS STORED BEFORE THE CALIBRATED SCORE EXISTED CARRY THE LEGACY SIGMOID SCALE (conf_scale 0, VALUES IN
// (0.5, 0.7311]). NEW ROWS CARRY THE MODEL'S OWN PROBABILITY (conf_scale 1). LEGACY VALUES ARE CONVERTED FOR
// DISPLAY WITH THE INVERSE SIGMOID, WHICH IS EXACT FOR ONE CHARACTER AND A CLOSE ESTIMATE FOR AVERAGES.

export const CONF_SCALE_LEGACY = 0;
export const CONF_SCALE_SOFTMAX = 1;

// HIGHEST VALUE THE LEGACY SCALE CAN PRODUCE (SIGMOID OF 1). ANYTHING ABOVE IT WAS NEVER ON THAT SCALE (FOR EXAMPLE
// ROWS WRITTEN BY AN OLDER OCR BACKEND) AND IS SHOWN AS IT IS.
const LEGACY_MAX = 0.7310586;
const LEGACY_EPSILON = 1e-4;

export const LEGACY_CONFIDENCE_TOOLTIP = 'Estimated from an older analysis. Re-run OCR for an exact value.';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const isLegacyValue = (conf: number, scale: number | null | undefined): boolean =>
	scale !== CONF_SCALE_SOFTMAX && conf <= LEGACY_MAX + LEGACY_EPSILON;

/** A STORED CONFIDENCE ON THE 0..1 PROBABILITY SCALE, OR NULL WHEN UNKNOWN. */
export function displayConfidence(conf: number | null | undefined, scale: number | null | undefined): number | null {
	if (conf === null || conf === undefined || !Number.isFinite(conf)) return null;
	if (!isLegacyValue(conf, scale)) return clamp01(conf);
	if (conf <= 0) return 0;
	return clamp01(Math.log(conf / (1 - conf)));
}

/** TRUE WHEN THE SHOWN VALUE IS AN ESTIMATE CONVERTED FROM THE LEGACY SCALE. */
export function isEstimatedConfidence(conf: number | null | undefined, scale: number | null | undefined): boolean {
	return conf !== null && conf !== undefined && Number.isFinite(conf) && isLegacyValue(conf, scale);
}

export interface ConfidenceStats {
	avg_confidence?: number | null;
	avg_ocr_confidence?: number | null;
	confidence_scale?: string | null;
}

export interface ConfidenceRegion {
	conf?: number | null;
	confScale?: number | null;
}

/**
 * THE PAGE AVERAGE ON THE PROBABILITY SCALE: THE CALIBRATED STATS AVERAGE FIRST, THEN THE LEGACY STATS AVERAGE
 * CONVERTED, THEN THE MEAN OF THE REGIONS' DISPLAY VALUES. NULL WHEN NOTHING IS KNOWN.
 */
export function pageAverageConfidence(
	stats: ConfidenceStats | null | undefined,
	regions: ConfidenceRegion[] | null | undefined,
): number | null {
	if (stats && typeof stats.avg_ocr_confidence === 'number' && Number.isFinite(stats.avg_ocr_confidence)) {
		return clamp01(stats.avg_ocr_confidence);
	}
	if (stats && !stats.confidence_scale && typeof stats.avg_confidence === 'number') {
		return displayConfidence(stats.avg_confidence, CONF_SCALE_LEGACY);
	}
	const values = (regions ?? [])
		.map((r) => displayConfidence(r.conf, r.confScale))
		.filter((v): v is number => v !== null);
	if (values.length === 0) return null;
	return values.reduce((a, b) => a + b, 0) / values.length;
}

/** TRUE WHEN pageAverageConfidence HAD TO FALL BACK TO VALUES CONVERTED FROM THE LEGACY SCALE. */
export function isEstimatedPageAverage(
	stats: ConfidenceStats | null | undefined,
	regions: ConfidenceRegion[] | null | undefined,
): boolean {
	if (stats && typeof stats.avg_ocr_confidence === 'number' && Number.isFinite(stats.avg_ocr_confidence)) return false;
	if (stats && !stats.confidence_scale && typeof stats.avg_confidence === 'number') {
		return isEstimatedConfidence(stats.avg_confidence, CONF_SCALE_LEGACY);
	}
	return (regions ?? []).some((r) => isEstimatedConfidence(r.conf, r.confScale));
}
