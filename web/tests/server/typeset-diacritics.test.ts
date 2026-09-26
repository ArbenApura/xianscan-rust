// PLAIN LETTERS FOR DIACRITICS THE FONT LACKS, IN THE RENDERER (FEAT-011): CC WILD WORDS HAS NO É, SO WITHOUT THIS THE
// LETTER IS DRAWN IN A FALLBACK FONT MID-WORD; WITH IT THE WORD IS ONE RUN IN WILD WORDS. A FONT WITH É KEEPS IT.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// RECORD EVERY fillText (TEXT, FONT, DIRECTION) ON THE 600 PX PAGE CANVAS typesetPage CREATES
const fills: { text: string; font: string; direction: string }[] = [];
vi.mock('@napi-rs/canvas', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@napi-rs/canvas')>();
	const createCanvas = (...args: Parameters<typeof actual.createCanvas>) => {
		const canvas = actual.createCanvas(...args);
		if (args[0] !== 600) return canvas;
		const getContext = canvas.getContext.bind(canvas);
		(canvas as unknown as { getContext: unknown }).getContext = (...ctxArgs: unknown[]) => {
			const ctx = (getContext as (...a: unknown[]) => any)(...ctxArgs);
			const fillText = ctx.fillText.bind(ctx);
			ctx.fillText = (text: string, x: number, y: number) => {
				fills.push({ text, font: ctx.font, direction: ctx.direction });
				return fillText(text, x, y);
			};
			return ctx;
		};
		return canvas;
	};
	return { ...actual, createCanvas };
});
vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

import { createCanvas } from '@napi-rs/canvas';
import { plainForFont, registerFonts, typesetPage, type TypesetOptions } from '$lib/server/typeset';
import type { TypesetRegion } from '$lib/server/typeset/stat-panel';

// -- CONSTANTS -- //

const PAGE_W = 600;
const PAGE_H = 400;

// -- STATES -- //

let whitePage: Buffer;

// -- HELPERS -- //

function region(text: string, over: Partial<TypesetRegion> = {}): TypesetRegion {
	return { id: 'r0', box: { x: 40, y: 40, w: 520, h: 140 }, kind: 'dialogue_bubble', text, ...over };
}

async function render(regions: TypesetRegion[], opts: TypesetOptions = {}): Promise<Buffer> {
	fills.length = 0;
	return typesetPage(whitePage, regions, { fontDialogue: 'CC Wild Words', colorMode: 'dark', targetScript: 'latin', ...opts });
}

const firstFamily = (font: string) => /"([^"]+)"/.exec(font)?.[1] ?? '';
const drawnText = () => fills.map((f) => f.text).join('|');

// -- LIFECYCLES -- //

beforeAll(() => {
	registerFonts();
	const c = createCanvas(PAGE_W, PAGE_H);
	const x = c.getContext('2d');
	x.fillStyle = 'white';
	x.fillRect(0, 0, PAGE_W, PAGE_H);
	whitePage = c.toBuffer('image/png');
});

beforeEach(() => {
	fills.length = 0;
});

// -- TESTS -- //

describe('a font without accented letters (CC Wild Words)', () => {
	it('draws CAFE as one Wild Words run, in any language', async () => {
		await render([region('Café')]);
		expect(fills.map((f) => f.text)).toEqual(['CAFE']);
		expect(firstFamily(fills[0].font)).toBe('CC Wild Words');
		expect(fills.some((f) => firstFamily(f.font) === 'Friendly Sans')).toBe(false);
	});

	it('uppercases ß before drawing it plain', async () => {
		await render([region('Straße')]);
		expect(drawnText()).toBe('STRASSE');
	});

	it('renders like the plain word', async () => {
		const plain = await render([region('CAFE DEJA VU')]);
		expect((await render([region('Café déjà vu')])).equals(plain)).toBe(true);
	});
});

describe('a font with accented letters (Poppins)', () => {
	it('keeps É', async () => {
		await render([region('Café')], { fontDialogue: 'Poppins' });
		expect(drawnText()).toBe('CAFÉ');
		expect(fills.every((f) => firstFamily(f.font) === 'Poppins')).toBe(true);
	});

	it('plainForFont keeps letters the family has and changes the rest', () => {
		expect(plainForFont('CAFÉ STRASSE', 'Poppins')).toBe('CAFÉ STRASSE');
		expect(plainForFont('CAFÉ', 'CC Wild Words')).toBe('CAFE');
		// UNKNOWN CODE POINTS: EVERY LETTER IS KEPT
		expect(plainForFont('CAFÉ', 'No Such Family XYZ')).toBe('CAFÉ');
	});
});

describe('unchanged output', () => {
	it('keeps Japanese and Russian text byte-identical to the same text with the plain rule unused', async () => {
		for (const [text, targetScript] of [
			['がんばれ！ぱぴぷ', 'kana'],
			['Йошкар-Ола, ёлка!', 'cyrillic'],
		] as const) {
			fills.length = 0;
			await render([region(text)], { targetScript });
			expect(drawnText().replace(/\|/g, '')).toBe(text.replace('Йошкар-Ола, ёлка!', 'ЙОШКАР-ОЛА, ЁЛКА!'));
		}
	});

	it('keeps a right-to-left line in one run while drawing the Latin name plain', async () => {
		await render([region('مرحبا José')], { targetScript: 'arabic' });
		expect(fills.length).toBe(1);
		expect(fills[0].direction).toBe('rtl');
	});
});
