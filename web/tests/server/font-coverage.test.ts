// RENDER-PROBE COVERAGE MUST AGREE WITH THE cmap FOR EVERY BUNDLED FONT (FEAT-006 PHASE 2)
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as canvas from '@napi-rs/canvas';
import { SCRIPT_FONT_SLOTS } from '$lib/typeset-scripts';
import { parseFontBuffer, readCmapCoverage, scriptsCoveredBy, splitFontCollection } from '$lib/server/typeset/font-parser';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));
vi.mock('@napi-rs/canvas', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@napi-rs/canvas')>();
	return { ...actual, createCanvas: vi.fn(actual.createCanvas) };
});

// ONE FILE PER FAMILY (THE FACE SKIA PICKS FOR A PLAIN 32px REQUEST)
const BUNDLED = ['CCWildWords-Roman.ttf', 'FriendlySans-Regular.ttf', 'GeneralSans-Regular.ttf', 'Lexend-Bold.ttf', 'Montserrat-Bold.ttf', 'Poppins-Bold.ttf', 'wqy-microhei.ttc', 'NotoSansDevanagari-Regular.ttf', 'NotoSansThai-Regular.ttf', 'Tajawal-Regular.ttf', 'SigmarOne-Regular.ttf'];
const fontDir = join(process.cwd(), 'static/fonts');

beforeAll(async () => {
	const { registerFonts } = await import('$lib/server/typeset/fonts');
	registerFonts();
});

describe('probeFamilyScript', () => {
	it.each(BUNDLED)('agrees with the cmap for %s on every script slot', async (file) => {
		const { probeFamilyScript } = await import('$lib/server/typeset/coverage');
		const buf = readFileSync(join(fontDir, file));
		const dir = splitFontCollection(buf)[0];
		const family = parseFontBuffer(buf, dir).familyName;
		const cmapScripts = scriptsCoveredBy(readCmapCoverage(buf, dir));
		for (const slot of SCRIPT_FONT_SLOTS) {
			expect({ family, slot, covered: probeFamilyScript(family, slot) }).toEqual({ family, slot, covered: cmapScripts.includes(slot) });
		}
	});

	it('an unknown family is never covered', async () => {
		const { probeFamilyScript } = await import('$lib/server/typeset/coverage');
		expect(probeFamilyScript('No Such Font 12345', 'devanagari')).toBe(false);
	});
});

describe('familyCovers', () => {
	it('caches the answer (no second render)', async () => {
		const { familyCovers, invalidateCoverageCache } = await import('$lib/server/typeset/coverage');
		invalidateCoverageCache();
		const spy = vi.mocked(canvas.createCanvas);
		const first = familyCovers('Poppins', 'devanagari');
		const renders = spy.mock.calls.length;
		expect(familyCovers('Poppins', 'devanagari')).toBe(first);
		expect(spy.mock.calls.length).toBe(renders);
	});

	it('consults registered sources before probing', async () => {
		const { familyCovers, registerCoverageSource } = await import('$lib/server/typeset/coverage');
		registerCoverageSource((family, script) => (family === 'Imaginary Sans' && script === 'thai' ? true : undefined));
		expect(familyCovers('Imaginary Sans', 'thai')).toBe(true);
		expect(familyCovers('Imaginary Sans', 'hebrew')).toBe(false);
	});
});

describe('code point coverage (FEAT-010)', () => {
	it('reads bundled code points from the cmap: Wild Words lacks É but maps [ (repurposed arrow)', async () => {
		const { familyCodepoints, familyCoversText } = await import('$lib/server/typeset/coverage');
		const set = familyCodepoints('CC Wild Words');
		expect(set).not.toBeNull();
		expect(set!.has('É'.codePointAt(0)!)).toBe(false);
		expect(set!.has('['.codePointAt(0)!)).toBe(true);
		expect(familyCoversText('CC Wild Words', 'HELLO')).toBe(true);
		expect(familyCoversText('CC Wild Words', 'ÉPÉE')).toBe(false);
	});

	it('checks letters, marks and digits only: symbols never block coverage', async () => {
		const { familyCoversText, familyMissing, lettersOf } = await import('$lib/server/typeset/coverage');
		expect(lettersOf('[SKILL: 7]!')).toEqual(['S', 'K', 'I', 'L', 'L', '7']);
		expect(familyCoversText('Poppins', 'LOVE♥YOU')).toBe(true);
		expect(familyMissing('Poppins', 'LOVE♥YOU')).toEqual(['♥']);
	});

	it('treats an unregistered family as unknown and never throws', async () => {
		const { familyCodepoints, familyCoversText, familyMissing } = await import('$lib/server/typeset/coverage');
		expect(familyCodepoints('No Such Font 12345')).toBeNull();
		expect(familyCoversText('No Such Font 12345', 'HELLO')).toBe(false);
		expect(familyMissing('No Such Font 12345', 'HELLO')).toEqual([]);
	});

	it('counts an empty cmap set as unknown', async () => {
		const { familyCodepoints, registerCodepointSource } = await import('$lib/server/typeset/coverage');
		const { CodepointSet } = await import('$lib/server/typeset/font-parser');
		registerCodepointSource((family) => (family === 'Symbol Only Face' ? new CodepointSet([]) : undefined));
		expect(familyCodepoints('Symbol Only Face')).toBeNull();
	});

	it('sees a new answer after invalidateCoverageCache', async () => {
		const { familyCodepoints, invalidateCoverageCache, registerCodepointSource } = await import('$lib/server/typeset/coverage');
		const { CodepointSet } = await import('$lib/server/typeset/font-parser');
		let ranges: [number, number][] = [[0x41, 0x41]];
		registerCodepointSource((family) => (family === 'Swappable Face' ? new CodepointSet(ranges) : undefined));
		expect(familyCodepoints('Swappable Face')!.has(0x42)).toBe(false);
		ranges = [[0x41, 0x42]];
		expect(familyCodepoints('Swappable Face')!.has(0x42)).toBe(false);
		invalidateCoverageCache();
		expect(familyCodepoints('Swappable Face')!.has(0x42)).toBe(true);
	});

	it('only accepts a face whose family name matches (no prefix fallback to another family)', async () => {
		const { codepointsOfNamedFace } = await import('$lib/server/typeset/fonts');
		const path = join(fontDir, 'Poppins-Bold.ttf');
		expect(codepointsOfNamedFace(path, 'Poppins')).not.toBeNull();
		expect(codepointsOfNamedFace(path, 'Montserrat')).toBeNull();
	});
});
