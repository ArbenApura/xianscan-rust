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
const BUNDLED = ['CCWildWords-Roman.ttf', 'FriendlySans-Regular.ttf', 'GeneralSans-Regular.ttf', 'Lexend-Bold.ttf', 'Montserrat-Bold.ttf', 'Poppins-Bold.ttf', 'wqy-microhei.ttc', 'NotoSansDevanagari-Regular.ttf', 'NotoSansThai-Regular.ttf', 'Tajawal-Regular.ttf'];
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
