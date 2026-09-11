// FONT PARSER UNIT TESTS
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFontBuffer, groupFontFilesByFamily } from '$lib/server/typeset/font-parser';

// -- TESTS -- //

describe('parseFontBuffer', () => {
	const fontDir = join(process.cwd(), 'static/fonts');

	it('parses CC Wild Words font header correctly', () => {
		const buf = readFileSync(join(fontDir, 'CCWildWords-Roman.ttf'));
		const meta = parseFontBuffer(buf);
		expect(meta.familyName).toBe('CC Wild Words');
		expect(meta.format).toBe('truetype');
		expect(meta.supportedWeights).toEqual(['normal']);
	});

	it('parses General Sans Regular font correctly', () => {
		const buf = readFileSync(join(fontDir, 'GeneralSans-Regular.ttf'));
		const meta = parseFontBuffer(buf);
		expect(meta.familyName).toBe('General Sans');
		expect(meta.format).toBe('truetype');
		expect(meta.supportedWeights).toEqual(['normal']);
	});

	it('parses General Sans Bold font correctly with bold weight detection', () => {
		const buf = readFileSync(join(fontDir, 'GeneralSans-Bold.ttf'));
		const meta = parseFontBuffer(buf);
		expect(meta.familyName).toBe('General Sans');
		expect(meta.format).toBe('truetype');
		expect(meta.supportedWeights).toEqual(['bold']);
	});

	it('parses Montserrat font correctly', () => {
		const buf = readFileSync(join(fontDir, 'Montserrat-Bold.ttf'));
		const meta = parseFontBuffer(buf);
		expect(meta.familyName).toBe('Montserrat');
		expect(meta.format).toBe('truetype');
	});

	it('parses Poppins Bold font correctly', () => {
		const buf = readFileSync(join(fontDir, 'Poppins-Bold.ttf'));
		const meta = parseFontBuffer(buf);
		expect(meta.familyName).toBe('Poppins');
		expect(meta.format).toBe('truetype');
		expect(meta.supportedWeights).toEqual(['bold']);
	});

	it('parses Lexend font correctly', () => {
		const buf = readFileSync(join(fontDir, 'Lexend-Bold.ttf'));
		const meta = parseFontBuffer(buf);
		expect(meta.familyName).toBe('Lexend');
		expect(meta.format).toBe('truetype');
	});

	it('parses weightNumeric, style, and derives weightLabel correctly', () => {
		const regBuf = readFileSync(join(fontDir, 'GeneralSans-Regular.ttf'));
		const regMeta = parseFontBuffer(regBuf);
		expect(regMeta.weightNumeric).toBe(400);
		expect(regMeta.style).toBe('normal');
		expect(regMeta.isVariable).toBe(false);

		const boldBuf = readFileSync(join(fontDir, 'GeneralSans-Bold.ttf'));
		const boldMeta = parseFontBuffer(boldBuf);
		expect(boldMeta.weightNumeric).toBe(700);
		expect(boldMeta.style).toBe('normal');
	});

	it('groups multiple font files under the same family with merged supportedWeights', () => {
		const regBuf = readFileSync(join(fontDir, 'GeneralSans-Regular.ttf'));
		const boldBuf = readFileSync(join(fontDir, 'GeneralSans-Bold.ttf'));

		const groups = groupFontFilesByFamily([
			{ fileName: 'GeneralSans-Regular.ttf', buffer: regBuf },
			{ fileName: 'GeneralSans-Bold.ttf', buffer: boldBuf },
		]);

		expect(groups.size).toBe(1);
		const group = groups.get('general sans')!;
		expect(group).toBeDefined();
		expect(group.familyName).toBe('General Sans');
		expect(group.supportedWeights).toContain('normal');
		expect(group.supportedWeights).toContain('bold');
		expect(group.variants.length).toBe(2);
	});

	it('throws on corrupted or too small buffer', () => {
		expect(() => parseFontBuffer(Buffer.from([0, 1, 2]))).toThrow();
		expect(() => parseFontBuffer(Buffer.alloc(20))).toThrow();
	});
});
