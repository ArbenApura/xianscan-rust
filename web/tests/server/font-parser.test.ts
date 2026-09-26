// FONT PARSER UNIT TESTS
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFontBuffer, groupFontFilesByFamily } from '$lib/server/typeset/font-parser';

// -- TESTS -- //

describe('parseFontBuffer', () => {
	const fontDir = join(process.cwd(), 'static/fonts');

	it('parses CC Wild Words font header correctly and detects all-caps constraint', () => {
		const buf = readFileSync(join(fontDir, 'CCWildWords-Roman.ttf'));
		const meta = parseFontBuffer(buf);
		expect(meta.familyName).toBe('CC Wild Words');
		expect(meta.format).toBe('truetype');
		expect(meta.supportedWeights).toEqual(['normal']);
		expect(meta.allCapsOnly).toBe(true);
		expect(meta.supportedCasings).toEqual(['uppercase']);
	});

	it('parses General Sans Regular font correctly with full casing support', () => {
		const buf = readFileSync(join(fontDir, 'GeneralSans-Regular.ttf'));
		const meta = parseFontBuffer(buf);
		expect(meta.familyName).toBe('General Sans');
		expect(meta.format).toBe('truetype');
		expect(meta.supportedWeights).toEqual(['normal']);
		expect(meta.allCapsOnly).toBe(false);
		expect(meta.supportedCasings).toEqual(['uppercase', 'original', 'lowercase']);
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

// -- GLYPH COVERAGE (FEAT-006) -- //

describe('readCmapCoverage / scriptsCoveredBy', async () => {
	const { readCmapCoverage, scriptsCoveredBy, splitFontCollection, detectLegacyEncoding, CodepointSet } = await import(
		'$lib/server/typeset/font-parser'
	);
	const fontDir = join(process.cwd(), 'static/fonts');
	const scriptsOf = (file: string, dir = 0) => scriptsCoveredBy(readCmapCoverage(readFileSync(join(fontDir, file)), dir));

	it('CC Wild Words covers Latin but not Devanagari', () => {
		const scripts = scriptsOf('CCWildWords-Roman.ttf');
		expect(scripts).toContain('latin');
		expect(scripts).not.toContain('devanagari');
	});

	it('Poppins covers Latin and Devanagari', () => {
		const scripts = scriptsOf('Poppins-Bold.ttf');
		expect(scripts).toContain('latin');
		expect(scripts).toContain('devanagari');
	});

	it('reads the faces of a .ttc collection (WenQuanYi: Han and Cyrillic, no Devanagari)', () => {
		const buf = readFileSync(join(fontDir, 'wqy-microhei.ttc'));
		const dirs = splitFontCollection(buf);
		expect(dirs.length).toBeGreaterThanOrEqual(1);
		expect(dirs[0]).toBeGreaterThan(0);
		const scripts = scriptsCoveredBy(readCmapCoverage(buf, dirs[0]));
		expect(scripts).toEqual(expect.arrayContaining(['han', 'cyrillic']));
		expect(scripts).not.toContain('devanagari');
		// parseFontBuffer READS THE FIRST FACE OF A COLLECTION TOO
		expect(parseFontBuffer(buf).scripts).toEqual(expect.arrayContaining(['han']));
	});

	it.each([
		['NotoSansDevanagari-Regular.ttf', ['devanagari'], ['latin']],
		['NotoSansDevanagari-Bold.ttf', ['devanagari'], ['latin']],
		['NotoSansThai-Regular.ttf', ['thai'], ['latin']],
		['NotoSansThai-Bold.ttf', ['thai'], ['latin']],
		['Tajawal-Regular.ttf', ['arabic', 'latin'], ['devanagari']],
		['Tajawal-Bold.ttf', ['arabic', 'latin'], ['devanagari']],
	])('bundled script font %s covers %j and not %j', (file, yes, no) => {
		const scripts = scriptsOf(file);
		for (const s of yes) expect(scripts).toContain(s);
		for (const s of no) expect(scripts).not.toContain(s);
	});

	it('a single font file is its own collection of one', () => {
		expect(splitFontCollection(readFileSync(join(fontDir, 'Poppins-Bold.ttf')))).toEqual([0]);
	});

	it('decodes a synthetic format 12 subtable beyond the BMP', () => {
		// sfnt HEADER WITH ONE TABLE (cmap), cmap WITH ONE (3,10) RECORD, FORMAT 12 WITH TWO GROUPS
		const groups = [
			[0x41, 0x43, 1],
			[0x20000, 0x20005, 10],
		];
		const sub = Buffer.alloc(16 + groups.length * 12);
		sub.writeUInt16BE(12, 0);
		sub.writeUInt32BE(sub.length, 4);
		sub.writeUInt32BE(groups.length, 12);
		groups.forEach(([a, b, g], i) => {
			sub.writeUInt32BE(a, 16 + i * 12);
			sub.writeUInt32BE(b, 20 + i * 12);
			sub.writeUInt32BE(g, 24 + i * 12);
		});
		const cmapHeader = Buffer.alloc(12);
		cmapHeader.writeUInt16BE(1, 2);
		cmapHeader.writeUInt16BE(3, 4);
		cmapHeader.writeUInt16BE(10, 6);
		cmapHeader.writeUInt32BE(12, 8);
		const cmap = Buffer.concat([cmapHeader, sub]);
		const dir = Buffer.alloc(12 + 16);
		dir.writeUInt32BE(0x00010000, 0);
		dir.writeUInt16BE(1, 4);
		dir.write('cmap', 12, 'ascii');
		dir.writeUInt32BE(28, 20);
		dir.writeUInt32BE(cmap.length, 24);
		const set = readCmapCoverage(Buffer.concat([dir, cmap]));
		expect(set.has(0x42)).toBe(true);
		expect(set.has(0x44)).toBe(false);
		expect(set.has(0x20003)).toBe(true);
		expect(set.has(0x20006)).toBe(false);
	});

	it('CodepointSet merges adjacent ranges and searches them', () => {
		const set = new CodepointSet([
			[10, 20],
			[21, 30],
			[50, 60],
		]);
		expect(set.ranges).toEqual([
			[10, 30],
			[50, 60],
		]);
		expect(set.has(25)).toBe(true);
		expect(set.has(40)).toBe(false);
	});

	it('flags legacy Hindi fonts and Hindi-named fonts without Devanagari', () => {
		expect(detectLegacyEncoding({ familyName: 'Kruti Dev 010' }, ['latin'])).toMatch(/legacy/);
		expect(detectLegacyEncoding({ familyName: 'My Hindi Font' }, ['latin'])).toMatch(/no Devanagari/);
		expect(detectLegacyEncoding({ familyName: 'My Hindi Font' }, ['latin', 'devanagari'])).toBeNull();
		expect(detectLegacyEncoding({ familyName: 'Poppins' }, ['latin'])).toBeNull();
	});
});
