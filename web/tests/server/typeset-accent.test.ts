// ACCENT FONT RENDERING (FEAT-010 PHASE 7). BUNDLED FILES ARE REGISTERED UNDER TEST ALIASES WITH A CONTROLLED
// CODE POINT SET (THE OWNER'S BLAMBOT FONTS CANNOT BE REDISTRIBUTED, SO THEY ARE NOT TEST FIXTURES).
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// RECORD EVERY fillText / strokeText (TEXT, FONT, LINE WIDTH, DIRECTION) ON THE 600 PX PAGE CANVAS typesetPage CREATES
// (THE COVERAGE PROBE DRAWS ON ITS OWN SMALL CANVASES, WHICH ARE NOT RECORDED)
const fills: { text: string; font: string; direction: string; y: number }[] = [];
const strokes: { text: string; lineWidth: number }[] = [];
vi.mock('@napi-rs/canvas', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@napi-rs/canvas')>();
	const createCanvas = (...args: Parameters<typeof actual.createCanvas>) => {
		const canvas = actual.createCanvas(...args);
		if (args[0] !== 600) return canvas;
		const getContext = canvas.getContext.bind(canvas);
		(canvas as unknown as { getContext: unknown }).getContext = (...ctxArgs: unknown[]) => {
			const ctx = (getContext as (...a: unknown[]) => any)(...ctxArgs);
			const fillText = ctx.fillText.bind(ctx);
			const strokeText = ctx.strokeText.bind(ctx);
			ctx.fillText = (text: string, x: number, y: number) => {
				fills.push({ text, font: ctx.font, direction: ctx.direction, y });
				return fillText(text, x, y);
			};
			ctx.strokeText = (text: string, x: number, y: number) => {
				strokes.push({ text, lineWidth: ctx.lineWidth });
				return strokeText(text, x, y);
			};
			return ctx;
		};
		return canvas;
	};
	return { ...actual, createCanvas };
});
vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';
import { registerFonts, typesetPage, type TypesetOptions } from '$lib/server/typeset';
import { invalidateCoverageCache, registerCodepointSource } from '$lib/server/typeset/coverage';
import { CodepointSet, readCmapCoverage, splitFontCollection } from '$lib/server/typeset/font-parser';
import { runMeasuringContext } from '$lib/server/typeset/accent';
import { BUNDLED_SCRIPT_FONTS, splitTextRuns } from '$lib/server/typeset/fonts';
import type { TypesetRegion } from '$lib/server/typeset/stat-panel';
import type { ScriptFontContext } from '$lib/server/typeset/script-fonts';

// -- CONSTANTS -- //

const FONT_DIR = join(process.cwd(), 'static/fonts');
const PAGE_W = 600;
const PAGE_H = 400;

// -- STATES -- //

let whitePage: Buffer;

// -- HELPERS -- //

function cmapOf(file: string): CodepointSet {
	const buf = readFileSync(join(FONT_DIR, file));
	return readCmapCoverage(buf, splitFontCollection(buf)[0]);
}

/** THE SET WITHOUT THE GIVEN CHARACTERS. */
function without(set: CodepointSet, chars: string): CodepointSet {
	const drop = new Set([...chars].map((c) => c.codePointAt(0) as number));
	const ranges: [number, number][] = [];
	for (const [a, b] of set.ranges) {
		let start = a;
		for (let cp = a; cp <= b; cp++) {
			if (drop.has(cp)) {
				if (cp > start) ranges.push([start, cp - 1]);
				start = cp + 1;
			}
		}
		if (start <= b) ranges.push([start, b]);
	}
	return new CodepointSet(ranges);
}

function region(over: Partial<TypesetRegion> & { text: string }): TypesetRegion {
	return { id: over.id ?? 'r0', box: over.box ?? { x: 40, y: 40, w: 520, h: 140 }, kind: 'free_text', ...over };
}

async function render(regions: TypesetRegion[], opts: TypesetOptions = {}): Promise<Buffer> {
	fills.length = 0;
	strokes.length = 0;
	return typesetPage(whitePage, regions, { fontDialogue: 'CC Wild Words', colorMode: 'dark', targetScript: 'latin', ...opts });
}

const firstFamily = (font: string) => /"([^"]+)"/.exec(font)?.[1] ?? '';

// -- LIFECYCLES -- //

beforeAll(() => {
	registerFonts();
	// LATIN ACCENT: MONTSERRAT'S FILE WITHOUT [ ] É IN ITS cmap (LIKE A BLAMBOT DISPLAY FONT)
	GlobalFonts.registerFromPath(join(FONT_DIR, 'Montserrat-Bold.ttf'), 'Test Accent');
	// THE SAME FILE WITHOUT Q: A MISSING LETTER THAT HAS NO PLAIN FORM (FEAT-011)
	GlobalFonts.registerFromPath(join(FONT_DIR, 'Montserrat-Bold.ttf'), 'Test Accent NoQ');
	// HAN AND ARABIC ACCENTS: THE BUNDLED CJK AND ARABIC FILES UNDER NEW NAMES
	GlobalFonts.registerFromPath(join(FONT_DIR, 'wqy-microhei.ttc'), 'Test Brush');
	GlobalFonts.registerFromPath(join(FONT_DIR, 'Tajawal-Regular.ttf'), 'Test Arabic');
	const accent = without(cmapOf('Montserrat-Bold.ttf'), '[]ÉéÈè');
	const accentNoQ = without(cmapOf('Montserrat-Bold.ttf'), '[]ÉéÈèQq');
	const brush = cmapOf('wqy-microhei.ttc');
	const arabic = cmapOf('Tajawal-Regular.ttf');
	registerCodepointSource((family) => ({ 'Test Accent': accent, 'Test Accent NoQ': accentNoQ, 'Test Brush': brush, 'Test Arabic': arabic })[family]);
	invalidateCoverageCache();
	const c = createCanvas(PAGE_W, PAGE_H);
	const x = c.getContext('2d');
	x.fillStyle = 'white';
	x.fillRect(0, 0, PAGE_W, PAGE_H);
	whitePage = c.toBuffer('image/png');
});

beforeEach(() => {
	fills.length = 0;
	strokes.length = 0;
});

// -- TESTS -- //

describe('feature off (byte-identical)', () => {
	it('renders exactly as before when no accent font is set, even with labelled regions', async () => {
		const plain = [
			region({ id: 'a', text: 'Hold on! What is this?', kind: 'dialogue_bubble', box: { x: 40, y: 20, w: 300, h: 120 } }),
			region({ id: 'b', text: 'Flowing Blade!', kind: 'dialogue_bubble', box: { x: 360, y: 20, w: 200, h: 100 } }),
			region({ id: 'c', text: 'Green Wood Sword Art', box: { x: 40, y: 200, w: 520, h: 140 } }),
		];
		const labelled = plain.map((r) => ({ ...r, role: 'accent' as const }));
		const before = await render(plain);
		const after = await render(labelled, { accentFonts: {} });
		expect(after.equals(before)).toBe(true);
	});

	it('keeps dialogue run splitting unchanged: Poppins draws LOVE♥YOU as before with accent fonts set', async () => {
		const bubble = [region({ text: 'LOVE♥YOU', kind: 'dialogue_bubble' })];
		const before = await render(bubble, { fontDialogue: 'Poppins' });
		const after = await render(bubble, { fontDialogue: 'Poppins', accentFonts: { latin: 'Test Accent' } });
		expect(after.equals(before)).toBe(true);
	});

	it('does not change dialogue sizes when a labelled bubble renders as dialogue (review H6)', async () => {
		const page = [
			region({ id: 'a', text: 'We finally meet again, old friend.', kind: 'dialogue_bubble', box: { x: 40, y: 20, w: 260, h: 150 } }),
			region({ id: 'b', text: 'Flowing Blade', kind: 'dialogue_bubble', box: { x: 320, y: 20, w: 240, h: 150 } }),
		];
		const before = await render(page);
		const after = await render(page.map((r) => (r.id === 'b' ? { ...r, role: 'accent' as const } : r)), { accentFonts: { latin: 'Test Accent' } });
		expect(after.equals(before)).toBe(true);
	});
});

describe('accent font selection', () => {
	it('draws an accent free text region in the Latin accent font', async () => {
		await render([region({ text: 'Green Wood Sword Art', role: 'accent' })], { accentFonts: { latin: 'Test Accent' } });
		expect(fills.length).toBeGreaterThan(0);
		expect(fills.every((f) => firstFamily(f.font) === 'Test Accent')).toBe(true);
	});

	it('skips speech bubbles unless accentInBubbles is on', async () => {
		const bubble = [region({ text: 'Green Wood Sword Art', role: 'accent', kind: 'dialogue_bubble' })];
		await render(bubble, { accentFonts: { latin: 'Test Accent' } });
		expect(fills.some((f) => firstFamily(f.font) === 'Test Accent')).toBe(false);
		await render(bubble, { accentFonts: { latin: 'Test Accent' }, accentInBubbles: true });
		expect(fills.some((f) => firstFamily(f.font) === 'Test Accent')).toBe(true);
	});

	it('draws a missing accented letter plain in the accent font instead of falling back (FEAT-011)', async () => {
		await render([region({ text: "TECHNIQUE DE L'ÉPÉE", role: 'accent' })], { accentFonts: { latin: 'Test Accent' } });
		expect(fills.every((f) => firstFamily(f.font) === 'Test Accent')).toBe(true);
		expect(fills.map((f) => f.text).join('')).toContain('EPEE');
	});

	it('falls back to the dialogue font with a heavier outline when a letter without a plain form is missing', async () => {
		const text = 'TECHNIQUE OF THE BLADE';
		await render([region({ text })], { accentFonts: { latin: 'Test Accent NoQ' } });
		const plainWidth = strokes[0].lineWidth;
		await render([region({ text, role: 'accent' })], { accentFonts: { latin: 'Test Accent NoQ' } });
		expect(fills.some((f) => firstFamily(f.font) === 'Test Accent NoQ')).toBe(false);
		expect(strokes[0].lineWidth).toBeGreaterThan(plainWidth);
	});

	it('routes missing brackets to Friendly Sans, never to CC Wild Words arrows (review H5)', async () => {
		await render([region({ text: '[SKILL: SHADOW STEP]', role: 'accent' })], { accentFonts: { latin: 'Test Accent' } });
		const brackets = fills.filter((f) => f.text.includes('[') || f.text.includes(']'));
		expect(brackets.length).toBeGreaterThan(0);
		expect(brackets.every((f) => firstFamily(f.font) === 'Friendly Sans')).toBe(true);
		const letters = fills.filter((f) => /[A-Z]/.test(f.text));
		expect(letters.every((f) => firstFamily(f.font) === 'Test Accent')).toBe(true);
	});

	it('routes missing brackets to the dialogue font when it really has them', async () => {
		await render([region({ text: '[SKILL: SHADOW STEP]', role: 'accent' })], { fontDialogue: 'Poppins', accentFonts: { latin: 'Test Accent' } });
		const brackets = fills.filter((f) => f.text.includes('['));
		expect(brackets.every((f) => firstFamily(f.font) === 'Poppins')).toBe(true);
	});

	it('uses the per-script slot for Chinese and falls back when only a Latin accent font is set', async () => {
		const zh = [region({ text: '青木剑诀', role: 'accent' })];
		await render(zh, { targetScript: 'han', accentFonts: { han: 'Test Brush' } });
		expect(fills.every((f) => firstFamily(f.font) === 'Test Brush')).toBe(true);
		await render(zh, { targetScript: 'han', accentFonts: { latin: 'Test Accent' } });
		expect(fills.some((f) => firstFamily(f.font) === 'Test Brush' || firstFamily(f.font) === 'Test Accent')).toBe(false);
	});

	it('beats a dialogue script slot for han, kana (kanji in a Japanese book) and legacy fontCjk (review H3)', async () => {
		await render([region({ text: '青木剑诀', role: 'accent' })], {
			targetScript: 'han',
			scriptFonts: { han: 'WenQuanYi Micro Hei' },
			accentFonts: { han: 'Test Brush' },
		});
		expect(fills.every((f) => firstFamily(f.font) === 'Test Brush')).toBe(true);
		await render([region({ text: '奥義', role: 'accent' })], {
			targetScript: 'kana',
			scriptFonts: { kana: 'WenQuanYi Micro Hei' },
			accentFonts: { kana: 'Test Brush' },
		});
		expect(fills.every((f) => firstFamily(f.font) === 'Test Brush')).toBe(true);
		await render([region({ text: '青木剑诀', role: 'accent' })], { targetScript: 'han', fontCjk: 'WenQuanYi Micro Hei', accentFonts: { han: 'Test Brush' } });
		expect(fills.every((f) => firstFamily(f.font) === 'Test Brush')).toBe(true);
	});

	it('draws an Arabic accent region right to left in one call per line with the accent font first', async () => {
		await render([region({ text: 'فن سيف الخشب', role: 'accent' })], {
			targetScript: 'arabic',
			scriptFonts: { arabic: 'Tajawal' },
			accentFonts: { arabic: 'Test Arabic' },
		});
		expect(fills.length).toBeGreaterThan(0);
		expect(fills.every((f) => f.direction === 'rtl' && firstFamily(f.font) === 'Test Arabic')).toBe(true);
	});

	it('applies the accent casing without touching dialogue casing', async () => {
		await render(
			[
				region({ id: 'a', text: 'Green Wood Sword Art', role: 'accent' }),
				region({ id: 'b', text: 'Stop right there', kind: 'dialogue_bubble', box: { x: 40, y: 220, w: 520, h: 140 } }),
			],
			{ accentFonts: { latin: 'Test Accent' }, accentCasing: 'original', casing: 'uppercase' },
		);
		const drawn = fills.map((f) => f.text).join(' ');
		expect(drawn).toContain('Green');
		expect(drawn).toContain('STOP');
	});
});

describe('layout', () => {
	it('centres an accent line on its measured ink (ADR-013)', async () => {
		const box = { x: 150, y: 140, w: 300, h: 120 };
		const png = await render([region({ text: 'SWORD', role: 'accent', box })], { accentFonts: { latin: 'Test Accent' }, outlineMode: 'none' });
		const img = await loadImage(png);
		const c = createCanvas(PAGE_W, PAGE_H);
		const x = c.getContext('2d');
		x.drawImage(img, 0, 0);
		const data = x.getImageData(0, 0, PAGE_W, PAGE_H).data;
		let top = -1;
		let bottom = -1;
		for (let yy = box.y; yy < box.y + box.h; yy++) {
			for (let xx = box.x; xx < box.x + box.w; xx++) {
				if (data[(yy * PAGE_W + xx) * 4] < 128) {
					if (top < 0) top = yy;
					bottom = yy;
					break;
				}
			}
		}
		expect(top).toBeGreaterThan(0);
		const gapTop = top - box.y;
		const gapBottom = box.y + box.h - 1 - bottom;
		expect(Math.abs(gapTop - gapBottom)).toBeLessThanOrEqual(3);
	});

	it('keeps a joiner with its conjunct even when the accent font lacks it (code critic)', () => {
		const sctx: ScriptFontContext = {
			dialogue: 'Test Accent',
			scriptFonts: { bengali: 'Test Accent' },
			targetScript: 'bengali',
			bundled: BUNDLED_SCRIPT_FONTS,
			codepointRouting: true,
			symbolFallback: 'CC Wild Words',
		};
		// RA + ZWJ + VIRAMA + YA (BENGALI YA-PHALA); THE TEST ACCENT cmap HAS NO ZWJ
		const text = '\u09B0\u200D\u09CD\u09AF';
		const runs = splitTextRuns(text, 'Test Accent', '', sctx);
		expect(runs.every((r) => !r.text.includes('\u200D') || r.script === 'bengali')).toBe(true);
		expect(runs.some((r) => r.font === 'Friendly Sans')).toBe(false);
	});

	it('measures an accent line by the runs it is drawn with', () => {
		const sctx: ScriptFontContext = {
			dialogue: 'Test Accent',
			scriptFonts: {},
			targetScript: 'latin',
			bundled: BUNDLED_SCRIPT_FONTS,
			codepointRouting: true,
			symbolFallback: 'CC Wild Words',
		};
		const real = createCanvas(10, 10).getContext('2d');
		const measure = runMeasuringContext(real, 'Test Accent', sctx, undefined, 'normal', 'normal', 'ltr');
		measure.font = 'normal 40px "Test Accent"';
		const text = '[SKILL]';
		const measured = measure.measureText(text).width;
		let drawn = 0;
		for (const run of splitTextRuns(text, 'Test Accent', '', sctx)) {
			real.font = `normal 40px "${run.font}", sans-serif`;
			drawn += real.measureText(run.text).width;
		}
		expect(splitTextRuns(text, 'Test Accent', '', sctx)).toHaveLength(3);
		expect(Math.abs(measured - drawn)).toBeLessThan(0.5);
		expect(measure.font).toBe('normal 40px "Test Accent"');
	});
});

describe('bundled default (Sigmar One)', () => {
	it('draws an accent region in Sigmar One with the default settings', async () => {
		const { buildTypesetOptions } = await import('$lib/server/typeset/options');
		const { DEFAULTS } = await import('$lib/stores/settings');
		const opts = buildTypesetOptions({ canonical: { ...DEFAULTS }, targetScript: 'latin' });
		fills.length = 0;
		await typesetPage(whitePage, [region({ text: "Technique de l'Épée", role: 'accent' })], opts);
		const drawn = fills.filter((f) => f.text.trim());
		expect(drawn.length).toBeGreaterThan(0);
		// EVERY SUPPORTED LATIN LETTER IS IN SIGMAR ONE, SO ACCENTED TEXT DOES NOT FALL BACK
		expect(drawn.every((f) => firstFamily(f.font) === 'Sigmar One')).toBe(true);
	});
});

