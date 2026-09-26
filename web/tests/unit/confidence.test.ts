// OCR CONFIDENCE DISPLAY (FEAT-003 PHASE 3): LEGACY SIGMOID-SCALE VALUES ARE CONVERTED, CALIBRATED ONES PASS THROUGH.
import { describe, expect, it } from 'vitest';
import { displayConfidence, isEstimatedConfidence, isEstimatedPageAverage, pageAverageConfidence } from '$lib/confidence';

describe('displayConfidence', () => {
	it('converts the legacy maximum to about 100%', () => {
		expect(displayConfidence(0.731058, 0)).toBeCloseTo(1.0, 4);
	});

	it('converts a mid legacy value with the inverse sigmoid', () => {
		expect(displayConfidence(0.62, 0)).toBeCloseTo(Math.log(0.62 / 0.38), 6);
		expect(displayConfidence(0.62, 0)).toBeCloseTo(0.49, 2);
	});

	it('passes calibrated values through', () => {
		expect(displayConfidence(0.97, 1)).toBe(0.97);
	});

	it('keeps unknown values null', () => {
		expect(displayConfidence(null, 0)).toBeNull();
		expect(displayConfidence(undefined, 1)).toBeNull();
		expect(displayConfidence(Number.NaN, 0)).toBeNull();
	});

	it('treats a missing scale as legacy', () => {
		expect(displayConfidence(0.731058, undefined)).toBeCloseTo(1.0, 4);
		expect(displayConfidence(0.731058, null)).toBeCloseTo(1.0, 4);
	});

	it('clamps out-of-range values', () => {
		expect(displayConfidence(0.3, 0)).toBe(0);
		expect(displayConfidence(0.7311, 0)).toBeCloseTo(1.0, 3);
		expect(displayConfidence(1.5, 0)).toBe(1);
		expect(displayConfidence(-0.2, 0)).toBe(0);
		expect(displayConfidence(1.2, 1)).toBe(1);
		expect(displayConfidence(-0.1, 1)).toBe(0);
	});

	it('shows values above the legacy maximum as they are (never on the sigmoid scale)', () => {
		expect(displayConfidence(0.954, 0)).toBe(0.954);
		expect(isEstimatedConfidence(0.954, 0)).toBe(false);
	});

	it('flags only legacy values as estimates', () => {
		expect(isEstimatedConfidence(0.6, 0)).toBe(true);
		expect(isEstimatedConfidence(0.6, 1)).toBe(false);
		expect(isEstimatedConfidence(null, 0)).toBe(false);
	});
});

describe('pageAverageConfidence', () => {
	const regions = [
		{ conf: 0.9, confScale: 1 },
		{ conf: 0.731058, confScale: 0 },
	];

	it('prefers the calibrated stats average', () => {
		expect(pageAverageConfidence({ avg_confidence: 0.7, avg_ocr_confidence: 0.93, confidence_scale: 'softmax_mean_v1' }, regions)).toBe(0.93);
	});

	it('converts a legacy stats average when no scale is recorded', () => {
		expect(pageAverageConfidence({ avg_confidence: 0.731058 }, regions)).toBeCloseTo(1.0, 4);
	});

	it('falls back to the mean of the region display values', () => {
		expect(pageAverageConfidence(null, regions)).toBeCloseTo((0.9 + 1.0) / 2, 4);
		// A NEW-SCALE PAGE WITHOUT A CALIBRATED AVERAGE DOES NOT CONVERT ITS LEGACY avg_confidence
		expect(pageAverageConfidence({ avg_confidence: 0.6, confidence_scale: 'softmax_mean_v1' }, [{ conf: 0.8, confScale: 1 }])).toBe(0.8);
	});

	it('returns null when nothing is known', () => {
		expect(pageAverageConfidence(null, [])).toBeNull();
		expect(pageAverageConfidence(undefined, [{ conf: null, confScale: 0 }])).toBeNull();
	});
});

describe('isEstimatedPageAverage', () => {
	it('is false for a calibrated stats average', () => {
		expect(isEstimatedPageAverage({ avg_ocr_confidence: 0.9, avg_confidence: 0.7 }, [])).toBe(false);
	});

	it('is true for a legacy stats average', () => {
		expect(isEstimatedPageAverage({ avg_confidence: 0.7 }, [])).toBe(true);
	});

	it('follows the regions when no stats average exists', () => {
		expect(isEstimatedPageAverage(null, [{ conf: 0.62, confScale: 0 }])).toBe(true);
		expect(isEstimatedPageAverage(null, [{ conf: 0.95, confScale: 1 }])).toBe(false);
	});
});
