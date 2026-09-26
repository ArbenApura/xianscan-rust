// RIGHT-TO-LEFT LINE DRAWING (FEAT-007 PHASE 2)
import { describe, it, expect, vi, beforeAll } from 'vitest';

// RECORD EVERY fillText (TEXT, DIRECTION, ALIGN) ON CONTEXTS CREATED THROUGH createCanvas, INCLUDING typesetPage'S OWN
const fillCalls: { text: string; direction: string; textAlign: string }[] = [];
const fillYs: number[] = [];
const fillFonts: string[] = [];
vi.mock('@napi-rs/canvas', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@napi-rs/canvas')>();
	const createCanvas = (...args: Parameters<typeof actual.createCanvas>) => {
		const canvas = actual.createCanvas(...args);
		const getContext = canvas.getContext.bind(canvas);
		(canvas as unknown as { getContext: unknown }).getContext = (...ctxArgs: unknown[]) => {
			const ctx = (getContext as (...a: unknown[]) => any)(...ctxArgs);
			const fillText = ctx.fillText.bind(ctx);
			ctx.fillText = (text: string, x: number, y: number, maxWidth?: number) => {
				fillCalls.push({ text, direction: ctx.direction, textAlign: ctx.textAlign });
				fillYs.push(y);
				fillFonts.push(ctx.font);
				return maxWidth === undefined ? fillText(text, x, y) : fillText(text, x, y, maxWidth);
			};
			return ctx;
		};
		return canvas;
	};
	return { ...actual, createCanvas };
});
vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

import { createCanvas } from '@napi-rs/canvas';
import { BUNDLED_SCRIPT_FONTS, drawTextLineWithRuns, fitFontSizeWithLines, registerFonts, rtlFontSpec, typesetPage } from '$lib/server/typeset';
import type { ScriptFontContext } from '$lib/server/typeset/script-fonts';

const sctx: ScriptFontContext = { dialogue: 'CC Wild Words', scriptFonts: {}, targetScript: 'arabic', bundled: BUNDLED_SCRIPT_FONTS };
const BLACK = { fill: 'black', stroke: 'white' };

beforeAll(() => {
	registerFonts();
});

function columnInk(data: Uint8ClampedArray | Buffer, width: number, height: number): number[] {
	const cols = new Array(width).fill(0);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			if (data[i] < 128 && data[i + 3] > 0) cols[x]++;
		}
	}
	return cols;
}

function correlation(a: number[], b: number[]): number {
	const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
	const ma = mean(a);
	const mb = mean(b);
	let num = 0;
	let da = 0;
	let db = 0;
	for (let i = 0; i < a.length; i++) {
		num += (a[i] - ma) * (b[i] - mb);
		da += (a[i] - ma) ** 2;
		db += (b[i] - mb) ** 2;
	}
	return num / Math.sqrt(da * db || 1);
}

describe('drawTextLineWithRuns direction', () => {
	it('an RTL line is drawn with one fillText, whole, in rtl direction', () => {
		const canvas = createCanvas(400, 80);
		const ctx = canvas.getContext('2d');
		fillCalls.length = 0;
		const line = '«مرحبا» يا Goku 25!';
		drawTextLineWithRuns(ctx, line, 200, 50, 28, 'CC Wild Words', '', BLACK, 0, false, undefined, 'center', 'normal', 'normal', sctx, 'rtl');
		expect(fillCalls).toEqual([{ text: line, direction: 'rtl', textAlign: 'center' }]);
	});

	it("start alignment anchors an RTL line's right edge", () => {
		const canvas = createCanvas(400, 80);
		const ctx = canvas.getContext('2d');
		fillCalls.length = 0;
		drawTextLineWithRuns(ctx, 'مرحبا', 380, 50, 28, 'CC Wild Words', '', BLACK, 0, false, undefined, 'start', 'normal', 'normal', sctx, 'rtl');
		expect(fillCalls[0].textAlign).toBe('right');
	});

	it('an LTR line keeps the per-run drawing', () => {
		const canvas = createCanvas(400, 80);
		const ctx = canvas.getContext('2d');
		fillCalls.length = 0;
		drawTextLineWithRuns(ctx, 'OK नमस्ते', 200, 50, 28, 'CC Wild Words', '', BLACK, 0, false, undefined, 'center', 'normal', 'normal', { ...sctx, targetScript: 'devanagari' });
		expect(fillCalls.map((c) => c.text)).toEqual(['OK ', 'नमस्ते']);
	});
});

describe('typesetPage with Arabic', () => {
	async function renderRegion(text: string): Promise<{ page: Uint8ClampedArray; size: number }> {
		const page = createCanvas(600, 200);
		const pctx = page.getContext('2d');
		pctx.fillStyle = '#ffffff';
		pctx.fillRect(0, 0, 600, 200);
		const out = await typesetPage(page.toBuffer('image/png'), [{ id: 'r', box: { x: 20, y: 20, w: 560, h: 160 }, text, kind: 'dialogue_bubble' }], {
			outlineMode: 'none',
			colorMode: 'dark',
			targetScript: 'arabic',
		});
		const { loadImage } = await import('@napi-rs/canvas');
		const img = await loadImage(out);
		const back = createCanvas(600, 200);
		const bctx = back.getContext('2d');
		bctx.drawImage(img, 0, 0);
		const measure = createCanvas(10, 10).getContext('2d');
		// typesetPage CAPS DIALOGUE AT max(24, 3.5% OF THE PAGE WIDTH): 24 PX ON THIS 600 PX PAGE
		const fitted = fitFontSizeWithLines(measure, text, 'CC Wild Words', 560, 160, 24, 24, undefined, undefined, 'normal', 'normal', sctx);
		expect(fitted.lines).toHaveLength(1);
		return { page: bctx.getImageData(0, 0, 600, 200).data, size: fitted.size };
	}

	it.each(['مرحبا، كيف حالك؟ أنا بخير.', 'Goku نحو المستشفى رقم 25!'])('%s matches a single RTL fillText of the same string', async (text) => {
		const { page, size } = await renderRegion(text);
		const ref = createCanvas(600, 200);
		const rctx = ref.getContext('2d');
		rctx.fillStyle = '#ffffff';
		rctx.fillRect(0, 0, 600, 200);
		rctx.font = rtlFontSpec(size, 'CC Wild Words', text, undefined, 'normal', 'normal', sctx);
		rctx.direction = 'rtl';
		rctx.textAlign = 'center';
		rctx.fillStyle = 'black';
		// SAME VERTICAL PLACEMENT AS typesetPage FOR ONE LINE
		rctx.fillText(text, 300, 20 + (160 - size * 0.75) / 2 + size * 0.75);
		const a = columnInk(page, 600, 200);
		const b = columnInk(rctx.getImageData(0, 0, 600, 200).data, 600, 200);
		expect(correlation(a, b)).toBeGreaterThan(0.95);
		const firstInk = (v: number[]) => v.findIndex((n) => n > 0);
		expect(Math.abs(firstInk(a) - firstInk(b))).toBeLessThanOrEqual(2);
	});

	it('does not upper-case Latin names inside Arabic text', async () => {
		fillCalls.length = 0;
		const page = createCanvas(600, 200).toBuffer('image/png');
		await typesetPage(page, [{ id: 'r', box: { x: 20, y: 20, w: 560, h: 160 }, text: 'مرحبا Goku', kind: 'dialogue_bubble' }], { targetScript: 'arabic' });
		const drawn = fillCalls.map((c) => c.text).join(' ');
		expect(drawn).toContain('Goku');
		expect(drawn).not.toContain('GOKU');
	});
});

describe('vertical metrics (FEAT-007 PHASE 4)', () => {
	async function inkRows(text: string, box: { x: number; y: number; w: number; h: number }, opts = {}) {
		const page = createCanvas(400, 200);
		const pctx = page.getContext('2d');
		pctx.fillStyle = '#ffffff';
		pctx.fillRect(0, 0, 400, 200);
		const out = await typesetPage(page.toBuffer('image/png'), [{ id: 'r', box, text, kind: 'dialogue_bubble' }], {
			outlineMode: 'none',
			colorMode: 'dark',
			...opts,
		});
		const { loadImage } = await import('@napi-rs/canvas');
		const back = createCanvas(400, 200);
		const bctx = back.getContext('2d');
		bctx.drawImage(await loadImage(out), 0, 0);
		const data = bctx.getImageData(0, 0, 400, 200).data;
		let top = -1;
		let bottom = -1;
		for (let yy = 0; yy < 200; yy++) {
			for (let xx = 0; xx < 400; xx++) {
				if (data[(yy * 400 + xx) * 4] < 128) {
					if (top < 0) top = yy;
					bottom = yy;
					break;
				}
			}
		}
		return { top, bottom };
	}

	it('a single Arabic line is vertically centred by its ink', async () => {
		const box = { x: 50, y: 40, w: 300, h: 120 };
		const { top, bottom } = await inkRows('مرحبا بكم جميعا', box, { targetScript: 'arabic' });
		expect(top).toBeGreaterThan(0);
		const above = top - box.y;
		const below = box.y + box.h - 1 - bottom;
		expect(Math.abs(above - below)).toBeLessThanOrEqual(3);
	});

	it('Latin keeps the fixed 0.75 em baseline', async () => {
		fillYs.length = 0;
		fillFonts.length = 0;
		const box = { x: 50, y: 40, w: 300, h: 120 };
		const page = createCanvas(400, 200).toBuffer('image/png');
		await typesetPage(page, [{ id: 'r', box, text: 'HELLO', kind: 'dialogue_bubble' }], { outlineMode: 'none' });
		// ONE LINE: BASELINE = TOP + (h - 0.75 SIZE) / 2 + 0.75 SIZE, WITH THE SIZE THE RENDERER ACTUALLY USED
		const size = Number(/(\d+(?:\.\d+)?)px/.exec(fillFonts[0])?.[1]);
		expect(size).toBeGreaterThan(0);
		expect(fillYs[0]).toBeCloseTo(box.y + (box.h - size * 0.75) / 2 + size * 0.75, 5);
	});
});
