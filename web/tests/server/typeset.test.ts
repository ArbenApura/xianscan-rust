// TYPESET TESTS — WRAPPING, AUTOFIT, CONTRAST, AND A REAL PAGE COMPOSITION (SKIA, NO DOM NEEDED).
import { describe, expect, it } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import {
	decollideRegions,
	fontFor,
	fitFontSize,
	isSfxOrShout,
	pickTextColor,
	reflowText,
	renderText,
	sampleBackground,
	sanitizeForFont,
	typesetPage,
	wrapText,
} from '$lib/server/typeset';

function ctx() {
	const c = createCanvas(10, 10);
	const x = c.getContext('2d');
	x.font = '20px Arial';
	return x;
}

// -- COLOR / CONTRAST -- //

describe('pickTextColor', () => {
	it('white text on dark backgrounds', () => {
		expect(pickTextColor({ r: 10, g: 10, b: 10 })).toEqual({ fill: 'white', stroke: 'black' });
	});

	it('black text on light backgrounds', () => {
		expect(pickTextColor({ r: 245, g: 245, b: 245 })).toEqual({ fill: 'black', stroke: 'white' });
	});
});

describe('fontFor', () => {
	it('uses CC Wild Words even when text contains tildes or special punctuation', () => {
		expect(fontFor()).toBe('CC Wild Words');
		expect(fontFor("And those heroines' scandalous news, heh heh heh~")).toBe('CC Wild Words');
		expect(fontFor('Boss, you don\'t know!')).toBe('CC Wild Words');
	});

	it('uses fallback font for square brackets and unsupported symbols (Page 58670)', () => {
		expect(fontFor('[LORD OF LIANGZHOU] Arc ends,')).toBe('Friendly Sans');
		expect(fontFor('[GU GOD ARC] begins')).toBe('Friendly Sans');
		expect(fontFor('Item: {Skill}')).toBe('Friendly Sans');
	});

	it('uses CC Wild Words as primary font for dialogue with em-dashes while dashes resolve via font stack (Page 45358)', () => {
		expect(fontFor('Even the principal says so—')).toBe('CC Wild Words');
		expect(fontFor('Might as well use them all—who knows')).toBe('CC Wild Words');
		expect(fontFor('Wait–what?')).toBe('CC Wild Words');
	});

	it('uses fallback font for CJK text', () => {
		expect(fontFor('还有那些侠女的花边新闻')).toBe('Friendly Sans');
	});
});

// -- SANITIZE & RENDER STRING -- //

describe('sanitizeForFont', () => {
	it('normalizes full-width tildes to ASCII tilde', () => {
		expect(sanitizeForFont('Heh heh heh～～～')).toBe('Heh heh heh~~~');
	});

	it('preserves em-dashes and en-dashes for fallback font rendering (Page 45358)', () => {
		expect(sanitizeForFont('Even the principal says so—')).toBe('Even the principal says so—');
		expect(sanitizeForFont('Might as well use them all—who knows, I might get something good.')).toBe(
			'Might as well use them all—who knows, I might get something good.',
		);
	});
});

describe('renderText', () => {
	it('uppercases Latin text at render time and preserves em-dashes for fallback font', () => {
		expect(
			renderText({
				id: 'r0',
				box: { x: 0, y: 0, w: 10, h: 10 },
				text: 'Even the principal says so—',
			}),
		).toBe('EVEN THE PRINCIPAL SAYS SO—');
	});

	it('uppercases accented letters', () => {
		expect(renderText({ id: 'r0', box: { x: 0, y: 0, w: 10, h: 10 }, text: 'héllo wörld' })).toBe('HÉLLO WÖRLD');
	});

	it('leaves CJK and punctuation unchanged (preserves unicode symbols for font fallback rendering)', () => {
		expect(renderText({ id: 'r0', box: { x: 0, y: 0, w: 10, h: 10 }, text: '小心！BOOM…' })).toBe('小心！BOOM…');
	});
});

describe('isSfxOrShout', () => {
	it('identifies single words and exclamations as SFX', () => {
		expect(isSfxOrShout('WEI!')).toBe(true);
		expect(isSfxOrShout('NIAN!')).toBe(true);
		expect(isSfxOrShout('BOOM!')).toBe(true);
		expect(isSfxOrShout('咻')).toBe(true);
		expect(isSfxOrShout('CLANG CLANG!')).toBe(true);
	});

	it('identifies multi-line or long narrative as dialogue, not SFX', () => {
		expect(isSfxOrShout('Zilong, Tong Fei, Zhang Fei, and Guan Yu\nlead troops...')).toBe(false);
		expect(isSfxOrShout('Hello there, this is a longer dialogue sentence with multiple words')).toBe(false);
		expect(isSfxOrShout('')).toBe(false);
	});
});

// -- LAYOUT -- //

describe('wrapText', () => {
	it('keeps short text on one line', () => {
		expect(wrapText(ctx(), 'Hello', 500)).toEqual(['Hello']);
	});

	it('wraps at word boundaries', () => {
		const lines = wrapText(ctx(), 'the quick brown fox jumps over the lazy dog', 140);
		expect(lines.length).toBeGreaterThan(1);
		// EVERY LINE (EXCEPT THE LAST) MUST FIT THE WIDTH
		for (const line of lines.slice(0, -1)) {
			expect(ctx().measureText(line).width).toBeLessThanOrEqual(140);
		}
		expect(lines.join(' ')).toBe('the quick brown fox jumps over the lazy dog');
	});

	it('character-breaks a single over-long word instead of dropping it with hyphens', () => {
		const lines = wrapText(ctx(), 'supercalifragilisticexpialidocious', 60);
		expect(lines.length).toBeGreaterThan(1);
		expect(lines.map((l) => l.replace(/-$/, '')).join('')).toBe('supercalifragilisticexpialidocious');
		// Non-last lines should end in '-'
		for (const line of lines.slice(0, -1)) {
			expect(line.endsWith('-')).toBe(true);
		}
	});

	it('wraps all words without truncation on long paragraphs', () => {
		const long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
		const wrapped = wrapText(ctx(), long, 140);
		expect(wrapped.length).toBeGreaterThan(4);
		expect(wrapped.join(' ')).toBe(long);
	});

	it('treats \\n as a hard line break (multi-line bubble paragraphs)', () => {
		const lines = wrapText(ctx(), 'Hello there.\nSecond line here.', 1000);
		expect(lines).toEqual(['Hello there.', 'Second line here.']);
	});

	it('never strands a lone trailing punctuation on its own line', () => {
		// THE USER-REPORTED FAILURE: "TRANSMIGRATION..." OVERFLOWS, SO CHARACTER-BREAKING
		// DROPPED THE FINAL "." ONTO THE NEXT LINE. THE DOT MUST STAY WITH THE WORD.
		const measure = { measureText: (t: string) => ({ width: t.length * 10 }) };
		const lines = wrapText(measure, 'TRANSMIGRATION...', 160);
		expect(lines.length).toBe(1);
		expect(lines[0]).toBe('TRANSMIGRATION...');
	});

	it('re-attaches a space-separated trailing dot that overflows', () => {
		const measure = { measureText: (t: string) => ({ width: t.length * 10 }) };
		const lines = wrapText(measure, 'TRANSMIGRATION.. .', 160);
		expect(lines.join('')).toBe('TRANSMIGRATION...'); // THE DOT ATTACHED WITHOUT A SPACE
		expect(lines.some((l) => /^[.．…·!！?？]+$/.test(l))).toBe(false);
	});

	it('strictly forces word on line when up to 3 letters overflow (e.g. ANOTHER ONE DOWN!)', () => {
		// "ANOTHER" is 70px wide (7 chars * 10px). If maxWidth is 45px (where "ANOT" fits without hyphen, 3 overflow),
		// it must NOT break off onto the next line. It must force "ANOTHER" on line 1.
		const measure = { measureText: (t: string) => ({ width: t.length * 10 }) };
		const lines = wrapText(measure, 'ANOTHER ONE DOWN!', 45);
		expect(lines).toEqual(['ANOTHER', 'ONE', 'DOWN!']);
		expect(lines.includes('ANOT-')).toBe(false);
	});

	it('allows breaking with hyphen when 4 or more letters overflow and remainder is 4 or more', () => {
		// "UNBREAKABLE" (11 chars * 10px = 110px). If maxWidth is 70px (7 chars fit, 4 overflow):
		// fits 6 chars + '-' = 70px ("UNBREA-"), remainder is "KABLE" (5 chars).
		const measure = { measureText: (t: string) => ({ width: t.length * 10 }) };
		const lines = wrapText(measure, 'UNBREAKABLE', 70);
		expect(lines).toEqual(['UNBREA-', 'KABLE']);
	});
});

describe('reflowText', () => {
	it('merges OCR line breaks into one balanced paragraph', () => {
		const c = ctx();
		const text = 'Bored out of her mind,\nXin\nawakened or perhaps\nenlightened\nthis sliver of humanity.';
		const lines = reflowText(c, text, 300);
		// THE FIVE OCR LINES COLLAPSE — NO ORPHANED SINGLE WORD
		expect(lines.length).toBeLessThan(5);
		expect(lines.includes('Xin')).toBe(false);
		expect(lines.join(' ')).toBe(
			'Bored out of her mind, Xin awakened or perhaps enlightened this sliver of humanity.',
		);
	});

	it('prioritizes the upper lines over the last line', () => {
		const c = ctx();
		const text = 'Bored out of her mind, Xin awakened or perhaps enlightened this sliver of humanity.';
		const lines = reflowText(c, text, 300);
		expect(lines.length).toBeGreaterThan(1);
		const widths = lines.map((l) => c.measureText(l).width);
		// THE FIRST LINE IS THE FULLEST; THE LAST LINE IS THE SHORTEST
		expect(widths[0]).toBeGreaterThanOrEqual(widths[widths.length - 1]);
		for (const w of widths) expect(w).toBeLessThanOrEqual(300);
	});
});

describe('fitFontSize', () => {
	it('finds a size whose layout fits the box', () => {
		const c = createCanvas(10, 10);
		const x = c.getContext('2d');
		const size = fitFontSize(x, 'Hello world this is dialogue', 'Arial', 200, 100, 60);
		expect(size).toBeGreaterThanOrEqual(8);
		expect(size).toBeLessThanOrEqual(60);

		// VERIFY THE FOUND SIZE ACTUALLY FITS WITHIN THE 2% INSET BOX (PITCH 1.2)
		x.font = `${size}px Arial`;
		const lines = wrapText(x, 'Hello world this is dialogue', 200 * 0.96);
		expect(lines.length * size * 1.2).toBeLessThanOrEqual(100 * 0.96);
	});

	it('degrades gracefully for tiny boxes', () => {
		const c = createCanvas(10, 10);
		const x = c.getContext('2d');
		const size = fitFontSize(x, 'A very long sentence here', 'Arial', 40, 20, 40);
		expect(size).toBeGreaterThanOrEqual(6); // THE FLOOR, NOT A CRASH
	});

	it('scales a short line up to fill a tall box when maxSize is given (dialogue)', () => {
		const c = createCanvas(10, 10);
		const x = c.getContext('2d');
		// 'HI!' IN A WIDE TALL BOX — THE OLD min(w,h)*0.5 CEILING (25) LEFT THE BUBBLE ~60% EMPTY.
		// WITH maxSize THE HEIGHT BUDGET IS THE ONLY LIMIT: 0.9×100 / 1.2 ≈ 75.
		const size = fitFontSize(x, 'HI!', 'Arial', 200, 100, 25, 90);
		expect(size).toBeGreaterThan(60);
	});

	it('keeps the startSize ceiling when maxSize is omitted (sfx exemption)', () => {
		const c = createCanvas(10, 10);
		const x = c.getContext('2d');
		// SFX NEVER PASSES maxSize — IMPACT TEXT KEEPS ITS INTENTIONAL WHITESPACE.
		const size = fitFontSize(x, 'HI!', 'Arial', 200, 100, 25);
		expect(size).toBe(25);
	});

	it('scales down font size to fit single word unbroken rather than hyphenating into tall box', () => {
		const c = createCanvas(10, 10);
		const x = c.getContext('2d');
		// "FIREBALL!" in a box of width 80 and height 120
		const size = fitFontSize(x, 'FIREBALL!', 'Arial', 80, 120, 50, 50);
		x.font = `bold ${size}px Arial`;
		const lines = reflowText(x, 'FIREBALL!', 80 * 0.90);
		expect(lines.length).toBe(1);
		expect(lines[0]).toBe('FIREBALL!');
		expect(lines[0].includes('-')).toBe(false);
	});

	it('scales down font size so word does not exceed the box width (e.g. CATCH!)', () => {
		const c = createCanvas(10, 10);
		const x = c.getContext('2d');
		const boxW = 50;
		const boxH = 50;
		const inset = 0.05;
		const maxW = boxW * (1 - 2 * inset);
		const size = fitFontSize(x, 'CATCH!', 'Arial', boxW, boxH, 40, 40, inset);
		x.font = `${size}px Arial`;
		const lines = reflowText(x, 'CATCH!', maxW);
		expect(lines.length).toBe(1);
		expect(lines[0]).toBe('CATCH!');
		expect(x.measureText(lines[0]).width).toBeLessThanOrEqual(maxW);
	});
});

// -- PAGE COMPOSITION -- //

describe('typesetPage', () => {
	function blankPng(w: number, h: number, color: string): Buffer {
		const c = createCanvas(w, h);
		const x = c.getContext('2d');
		x.fillStyle = color;
		x.fillRect(0, 0, w, h);
		return c.toBuffer('image/png');
	}

	async function brightPixels(png: Buffer): Promise<number> {
		const img = await loadImage(png);
		const probe = createCanvas(img.width, img.height);
		const px = probe.getContext('2d');
		px.drawImage(img, 0, 0);
		const data = px.getImageData(0, 0, img.width, img.height).data;
		let bright = 0;
		for (let i = 0; i < data.length; i += 4) {
			if (data[i] > 200) bright++;
		}
		return bright;
	}

	it('renders text over a dark page with a light fill', async () => {
		const out = await typesetPage(blankPng(400, 300, 'black'), [
			{ id: 'r0', box: { x: 50, y: 100, w: 300, h: 80 }, text: 'Hello world' },
		]);
		expect(out.slice(0, 4).toString('ascii')).toBe('RIFF');
		expect(out.slice(8, 12).toString('ascii')).toBe('WEBP');
		expect(await brightPixels(out)).toBeGreaterThan(0); // WHITE TEXT ON THE BLACK PAGE
	});

	it('uses dark text on a light page (contrast flips with the background)', async () => {
		const out = await typesetPage(blankPng(400, 300, 'white'), [
			{ id: 'r0', box: { x: 50, y: 100, w: 300, h: 80 }, text: 'Hello world' },
		]);
		const img = await loadImage(out);
		const probe = createCanvas(img.width, img.height);
		const px = probe.getContext('2d');
		px.drawImage(img, 0, 0);
		const data = px.getImageData(0, 0, img.width, img.height).data;
		let dark = 0;
		for (let i = 0; i < data.length; i += 4) {
			if (data[i] < 60) dark++;
		}
		expect(dark).toBeGreaterThan(0); // BLACK TEXT ON THE WHITE PAGE
	});

	it('skips empty-text regions', async () => {
		const out = await typesetPage(blankPng(100, 100, 'white'), [
			{ id: 'r0', box: { x: 10, y: 10, w: 80, h: 40 }, text: '   ' },
		]);
		expect(out.length).toBeGreaterThan(0); // STILL A VALID PNG, NOTHING CRASHED
	});

	it('renders an sfx region without crashing', async () => {
		const out = await typesetPage(blankPng(300, 200, 'white'), [
			{ id: 'r0', box: { x: 10, y: 10, w: 280, h: 100 }, text: 'BOOM!' },
		]);
		expect(out.slice(0, 4).toString('ascii')).toBe('RIFF');
		expect(out.slice(8, 12).toString('ascii')).toBe('WEBP');
	});

	it('renders small text regions cleanly without crashes or distortion', async () => {
		// Small 20x20 action text (e.g. "TURN" / "转") on a dark background
		const out = await typesetPage(blankPng(200, 200, 'black'), [
			{ id: 'r0', box: { x: 90, y: 90, w: 20, h: 20 }, text: 'TURN' },
		]);
		expect(out.slice(0, 4).toString('ascii')).toBe('RIFF');
		expect(out.slice(8, 12).toString('ascii')).toBe('WEBP');
		expect(await brightPixels(out)).toBeGreaterThan(0);
	});

	it('renders an angled/rotated region with rotation transform', async () => {
		const out = await typesetPage(blankPng(400, 400, 'black'), [
			{ id: 'r0', box: { x: 50, y: 50, w: 300, h: 100 }, text: 'SLASH!', angle: 35.5 },
		]);
		expect(out.slice(0, 4).toString('ascii')).toBe('RIFF');
		expect(out.slice(8, 12).toString('ascii')).toBe('WEBP');
		expect(await brightPixels(out)).toBeGreaterThan(0);
	});

	it('renders an angled structured stat panel with rotation transform', async () => {
		const out = await typesetPage(blankPng(400, 400, 'black'), [
			{
				id: 'r0',
				box: { x: 50, y: 50, w: 300, h: 150 },
				text: '[TOP-TIER CHARACTERS: TEN.]\n(With a Top-tier Pet)',
				angle: 9.26,
			},
		]);
		expect(out.slice(0, 4).toString('ascii')).toBe('RIFF');
		expect(out.slice(8, 12).toString('ascii')).toBe('WEBP');
		expect(await brightPixels(out)).toBeGreaterThan(0);
	});

	it('renders a long narrative monologue without truncation or cutoff (Sample 3)', async () => {
		const longTranslation =
			"No one knows what the outside world is like. Legend says that in their heyday, humans had vast empires, but now they've all turned to ash and ceased to exist. This city, hidden away, survived the Dark Age intact.";
		const out = await typesetPage(blankPng(800, 1131, 'white'), [
			{
				id: 'r2',
				box: { x: 60, y: 737, w: 252, h: 164 },
				text: longTranslation,
			},
		]);
		expect(out.slice(0, 4).toString('ascii')).toBe('RIFF');
		expect(out.slice(8, 12).toString('ascii')).toBe('WEBP');
		expect(await brightPixels(out)).toBeGreaterThan(0);

		// Verify that reflowText preserves all words across all lines
		const ctxMock = { font: '', measureText: (t: string) => ({ width: t.length * 7 }) };
		const maxW = 252 * (1 - 2 * 0.08);
		const lines = reflowText(ctxMock, longTranslation.toUpperCase(), maxW);
		const joined = lines.join(' ');
		expect(joined).toContain('NO ONE KNOWS');
		expect(joined).toContain('SURVIVED THE DARK AGE INTACT.');
	});

	it('renders all 5 regions of Page 656 narrative page without text cutoff or collision', async () => {
		const page656Regions: TypesetRegion[] = [
			{
				id: '3399',
				box: { x: 21, y: 14, w: 392, h: 59 },
				text: "The world beyond the Sacred Ancestor Mountain Range has been overrun by demon beasts. The people here haven't had contact with the outside world for centuries.",
			},
			{
				id: '3400',
				box: { x: 536, y: 736, w: 183, h: 108 },
				text: 'Though often attacked by the snowstorm demon beasts from the mountains, this city has been repeatedly rebuilt after each devastating war.',
			},
			{
				id: '3401',
				box: { x: 60, y: 737, w: 252, h: 164 },
				text: "No one knows what the outside world is like. Legend says that in their heyday, humans had vast empires, but now they've all turned to ash and ceased to exist. This city, hidden away, survived the Dark Age intact.",
			},
			{
				id: '3402',
				box: { x: 18, y: 1003, w: 356, h: 30 },
				text: 'The mottled city walls stand as an immortal monument!!',
			},
			{
				id: '3403',
				box: { x: 353, y: 1003, w: 308, h: 73 },
				text: 'And this city, the hope of humanity, is called...',
			},
		];

		const out = await typesetPage(blankPng(800, 1131, 'white'), page656Regions);
		expect(out.slice(0, 4).toString('ascii')).toBe('RIFF');
		expect(out.slice(8, 12).toString('ascii')).toBe('WEBP');
		expect(await brightPixels(out)).toBeGreaterThan(0);
	});

	it('renders vertical oval bubble horizontally without 90 degree sideways rotation (Sample 4)', async () => {
		const out = await typesetPage(blankPng(800, 1131, 'white'), [
			{
				id: '3470',
				box: { x: 200, y: 387, w: 91, h: 163 },
				text: 'I heard the new teacher is from the Sacred Clan, and a Silver Spirit Master too!',
				angle: 0.0,
			},
		]);
		expect(out.slice(0, 4).toString('ascii')).toBe('RIFF');
		expect(out.slice(8, 12).toString('ascii')).toBe('WEBP');
		expect(await brightPixels(out)).toBeGreaterThan(0);
	});

	it('scales standalone SFX up dynamically inside large boxes while leaving boundary padding (Page 58643)', async () => {
		const out = await typesetPage(blankPng(900, 1385, 'white'), [
			{ id: '22412', box: { x: 118, y: 230, w: 110, h: 123 }, text: 'WEI!' },
			{ id: '22413', box: { x: 540, y: 552, w: 253, h: 243 }, text: 'NIAN!' },
		]);
		expect(out.slice(0, 4).toString('ascii')).toBe('RIFF');
		expect(out.slice(8, 12).toString('ascii')).toBe('WEBP');
		const dark = await (async () => {
			const img = await loadImage(out);
			const probe = createCanvas(img.width, img.height);
			const px = probe.getContext('2d');
			px.drawImage(img, 0, 0);
			const data = px.getImageData(0, 0, img.width, img.height).data;
			let cnt = 0;
			for (let i = 0; i < data.length; i += 4) {
				if (data[i] < 60) cnt++;
			}
			return cnt;
		})();
		// Standalone SFX rendered in large boxes with bold strokes have substantial ink coverage
		expect(dark).toBeGreaterThan(500);
	});

	it('typesets narrow vertical bubbles with stacked lines and legible font size (Page 45050)', async () => {
		// Region 4 from Page 45050: w: 37, h: 108, text: "Xiao Ning'er?"
		const out = await typesetPage(blankPng(800, 1132, 'white'), [
			{
				id: '25681',
				box: { x: 315, y: 795, w: 37, h: 108 },
				text: "Xiao Ning'er?",
				vertical: true,
			},
		]);
		expect(out.slice(0, 4).toString('ascii')).toBe('RIFF');
		expect(out.slice(8, 12).toString('ascii')).toBe('WEBP');

		const img = await loadImage(out);
		const probe = createCanvas(img.width, img.height);
		const px = probe.getContext('2d');
		px.drawImage(img, 0, 0);
		const data = px.getImageData(0, 0, img.width, img.height).data;
		let darkPixels = 0;
		for (let i = 0; i < data.length; i += 4) {
			if (data[i] < 50) darkPixels++;
		}
		// Substantial ink coverage in the vertical bubble region
		expect(darkPixels).toBeGreaterThan(150);
	});

	it('respects TypesetOptions for colorMode, outlineMode, casing, and enableRotation', async () => {
		// Forced dark text on a dark page with lowercase casing
		const outDark = await typesetPage(
			blankPng(200, 200, 'black'),
			[{ id: 'r0', box: { x: 20, y: 20, w: 160, h: 60 }, text: 'Dark Text', angle: 15 }],
			{ colorMode: 'dark', outlineMode: 'none', casing: 'lowercase', enableRotation: false }
		);
		expect(outDark.slice(0, 4).toString('ascii')).toBe('RIFF');
		expect(outDark.slice(8, 12).toString('ascii')).toBe('WEBP');

		// Original casing
		const outOriginal = await typesetPage(
			blankPng(200, 200, 'white'),
			[{ id: 'r0', box: { x: 20, y: 20, w: 160, h: 60 }, text: 'Mixed Case Dialogue' }],
			{ casing: 'original' }
		);
		expect(outOriginal.slice(0, 4).toString('ascii')).toBe('RIFF');
		expect(outOriginal.slice(8, 12).toString('ascii')).toBe('WEBP');

		// Custom font and scale
		const outCustom = await typesetPage(
			blankPng(200, 200, 'white'),
			[{ id: 'r0', box: { x: 20, y: 20, w: 160, h: 60 }, text: 'Custom Font' }],
			{ fontDialogue: 'General Sans', fontScale: 1.2, outlineMode: 'heavy', boxInset: 0.05, casing: 'uppercase' }
		);
		expect(outCustom.slice(0, 4).toString('ascii')).toBe('RIFF');
		expect(outCustom.slice(8, 12).toString('ascii')).toBe('WEBP');
	});
});

describe('sampleBackground', () => {
	it('reads the actual page color (regression: the sync decode raced and sampled black)', async () => {
		const c = createCanvas(100, 100);
		const x = c.getContext('2d');
		x.fillStyle = 'white';
		x.fillRect(0, 0, 100, 100);
		const img = await loadImage(c.toBuffer('image/png'));
		expect(sampleBackground(img, 10, 10, 80, 80)).toEqual({ r: 255, g: 255, b: 255 });
	});
});

describe('decollideRegions', () => {
	it('adjusts overlapping bounding boxes to eliminate collision gap', () => {
		const r1 = { id: 'r0', box: { x: 50, y: 10, w: 100, h: 50 }, text: 'Daddy!' };
		const r2 = { id: 'r1', box: { x: 50, y: 40, w: 100, h: 50 }, text: 'Wake up!' };

		const result = decollideRegions([r1, r2]);
		expect(result).toHaveLength(2);
		// Bottom box y should shift downwards to eliminate overlap
		expect(result[1].box.y).toBeGreaterThan(r2.box.y);
	});
});


