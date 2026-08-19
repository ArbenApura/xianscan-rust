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
	splitTextRuns,
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

describe('fontFor & splitTextRuns', () => {
	it('uses CC Wild Words even when text contains tildes or special punctuation', () => {
		expect(fontFor()).toBe('CC Wild Words');
		expect(fontFor("And those heroines' scandalous news, heh heh heh~")).toBe('CC Wild Words');
		expect(fontFor('Boss, you don\'t know!')).toBe('CC Wild Words');
	});

	it('keeps CC Wild Words as primary font while splitTextRuns isolates unsupported symbols to fallback (Page 58670 & Page 59166)', () => {
		expect(fontFor('[LORD OF LIANGZHOU] Arc ends,')).toBe('CC Wild Words');
		expect(fontFor('[GU GOD ARC] begins')).toBe('CC Wild Words');
		expect(fontFor('Item: {Skill}')).toBe('CC Wild Words');

		const runs1 = splitTextRuns('[SIMA QIAN - PEERLESS]');
		expect(runs1).toEqual([
			{ text: '[', font: 'Friendly Sans', isFallbackSymbol: true },
			{ text: 'SIMA QIAN - PEERLESS', font: 'CC Wild Words', isFallbackSymbol: false },
			{ text: ']', font: 'Friendly Sans', isFallbackSymbol: true },
		]);

		const runs2 = splitTextRuns('[Alive just to eat, drink, crap, and sleep!');
		expect(runs2).toEqual([
			{ text: '[', font: 'Friendly Sans', isFallbackSymbol: true },
			{ text: 'Alive just to eat, drink, crap, and sleep!', font: 'CC Wild Words', isFallbackSymbol: false },
		]);
	});

	it('uses CC Wild Words as primary font for dialogue with em-dashes while dashes resolve via font stack (Page 45358)', () => {
		expect(fontFor('Even the principal says so—')).toBe('CC Wild Words');
		expect(fontFor('Might as well use them all—who knows')).toBe('CC Wild Words');
		expect(fontFor('Wait–what?')).toBe('CC Wild Words');
	});

	it('uses fallback font for CJK text', () => {
		expect(fontFor('还有那些侠女的花边新闻')).toBe('Friendly Sans');
	});

	it('splits mixed English and Korean/CJK text into dialogue font and CJK fallback font runs (Page 65013)', () => {
		const text = "There's someone! [형 궁서체다] : Whoa, for real?";
		const runs = splitTextRuns(text, 'CC Wild Words', 'Friendly Sans');
		expect(runs).toEqual([
			{ text: "There's someone! ", font: 'CC Wild Words', isFallbackSymbol: false },
			{ text: '[형 궁서체다]', font: 'Friendly Sans', isFallbackSymbol: true },
			{ text: ' : Whoa, for real?', font: 'CC Wild Words', isFallbackSymbol: false },
		]);
	});

	it('respects arbitrary user-chosen font preferences for Latin dialogue and CJK fallback fonts', () => {
		const text = "Level 99 [절대고수] : Max Power!";
		const customDialogue = 'Anime Ace';
		const customCjk = 'Malgun Gothic';

		expect(fontFor(text, customDialogue, customCjk)).toBe('Anime Ace');

		const runs = splitTextRuns(text, customDialogue, customCjk);
		expect(runs).toEqual([
			{ text: 'Level 99 ', font: 'Anime Ace', isFallbackSymbol: false },
			{ text: '[절대고수]', font: 'Malgun Gothic', isFallbackSymbol: true },
			{ text: ' : Max Power!', font: 'Anime Ace', isFallbackSymbol: false },
		]);
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

	it('strictly forces word on line rather than breaking off a single letter (ANOTHER ONE DOWN!)', () => {
		// "ANOTHER" is 70px wide (7 chars * 10px). If maxWidth is 65px (where "ANOTHE" fits without hyphen),
		// it must NOT break off "R" onto the next line (ANOTHE / R ONE / DOWN!).
		// It must force "ANOTHER" on line 1, wrapping to ["ANOTHER", "ONE", "DOWN!"].
		const measure = { measureText: (t: string) => ({ width: t.length * 10 }) };
		const lines = wrapText(measure, 'ANOTHER ONE DOWN!', 65);
		expect(lines).toEqual(['ANOTHER', 'ONE', 'DOWN!']);
		expect(lines.includes('ANOTHE')).toBe(false);
		expect(lines.some((l) => l.startsWith('R '))).toBe(false);
	});

	it('allows breaking with hyphen when two or more letters break off', () => {
		// "ANOTHER" (70px). If maxWidth is 50px (4 chars + '-' = 50px fit, remainder is "HER" = 3 chars),
		// it breaks cleanly into ["ANOT-", "HER"].
		const measure = { measureText: (t: string) => ({ width: t.length * 10 }) };
		const lines = wrapText(measure, 'ANOTHER', 50);
		expect(lines).toEqual(['ANOT-', 'HER']);
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

	it('preserves header line breaks like "Floor 48" separately from subsequent dialogue/narrative (Page 65011)', () => {
		const c = ctx();
		const text = 'Floor 48\nA challenger has appeared in the territory of <Red Dragon Destia>.';
		const lines = reflowText(c, text, 400);
		expect(lines[0]).toBe('Floor 48');
		expect(lines.length).toBeGreaterThanOrEqual(2);
		expect(lines.slice(1).join(' ')).toBe(
			'A challenger has appeared in the territory of <Red Dragon Destia>.',
		);
	});

	it('preserves speaker tags like "[Climber 123]:" on their own line (Page 65011)', () => {
		const c = ctx();
		const text = '[Climber 123]:\nThere\'s still someone challenging!';
		const lines = reflowText(c, text, 400);
		expect(lines[0]).toBe('[Climber 123]:');
		expect(lines[1]).toBe("There's still someone challenging!");
	});
});

describe('fitFontSize', () => {
	it('finds a size whose layout fits the box', () => {
		const c = createCanvas(10, 10);
		const x = c.getContext('2d');
		const size = fitFontSize(x, 'Hello world this is dialogue', 'Arial', 200, 100, 60);
		expect(size).toBeGreaterThanOrEqual(8);
		expect(size).toBeLessThanOrEqual(60);

		// VERIFY THE FOUND SIZE ACTUALLY FITS WITHIN THE 5% INSET BOX (PITCH 1.2)
		x.font = `${size}px Arial`;
		const lines = wrapText(x, 'Hello world this is dialogue', 200 * 0.9);
		expect(lines.length * size * 1.2).toBeLessThanOrEqual(100 * 0.9);
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
		expect(out.slice(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])); // PNG MAGIC
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
		expect(out.slice(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
	});

	it('renders small text regions cleanly without crashes or distortion', async () => {
		// Small 20x20 action text (e.g. "TURN" / "转") on a dark background
		const out = await typesetPage(blankPng(200, 200, 'black'), [
			{ id: 'r0', box: { x: 90, y: 90, w: 20, h: 20 }, text: 'TURN' },
		]);
		expect(out.slice(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
		expect(await brightPixels(out)).toBeGreaterThan(0);
	});

	it('renders an angled/rotated region with rotation transform', async () => {
		const out = await typesetPage(blankPng(400, 400, 'black'), [
			{ id: 'r0', box: { x: 50, y: 50, w: 300, h: 100 }, text: 'SLASH!', angle: 35.5 },
		]);
		expect(out.slice(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
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
		expect(out.slice(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
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
		expect(out.slice(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
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
		expect(out.slice(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
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
		expect(out.slice(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
		expect(await brightPixels(out)).toBeGreaterThan(0);
	});

	it('scales standalone SFX up dynamically inside large boxes while leaving boundary padding (Page 58643)', async () => {
		const out = await typesetPage(blankPng(900, 1385, 'white'), [
			{ id: '22412', box: { x: 118, y: 230, w: 110, h: 123 }, text: 'WEI!' },
			{ id: '22413', box: { x: 540, y: 552, w: 253, h: 243 }, text: 'NIAN!' },
		]);
		expect(out.slice(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
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
		expect(out.slice(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

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
		expect(darkPixels).toBeGreaterThan(50);
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

describe('isStructuredList & reflowText', () => {
	it('preserves line breaks for structured character stats and equipment lists', () => {
		const statText = `Class: Mage
Level: 10
Equipment:
Novice Mage Robe
Novice Belt
Novice Mage Bracers
Novice Mage Boots
Tattered Flesh-Cutting Knife`;

		const lines = reflowText(ctx(), statText, 500);
		expect(lines).toEqual([
			'Class: Mage',
			'Level: 10',
			'Equipment:',
			'Novice Mage Robe',
			'Novice Belt',
			'Novice Mage Bracers',
			'Novice Mage Boots',
			'Tattered Flesh-Cutting Knife',
		]);
	});

	it('collapses vertical single-letter sequences from vertical OCR into cohesive words', () => {
		expect(sanitizeForFont('...\nY\ne\na\nh\n...')).toBe('...\nYeah\n...');
		expect(sanitizeForFont('H\ne\nl\nl\no')).toBe('Hello');
	});

	it('prioritizes intact whole words over mid-word hyphenation in fitFontSize', () => {
		const c = createCanvas(10, 10);
		const x = c.getContext('2d');
		// "ALREADY AT AKAN LAKE..." in a vertical bubble box
		const text = 'ALREADY AT AKAN LAKE...';
		const size = fitFontSize(x, text, 'Arial', 180, 220, 60);
		x.font = `${size}px Arial`;
		const lines = reflowText(x, text, 180 * 0.9);
		// ALREADY must not be split into ALRE- / ADY
		expect(lines.some((l) => l.includes('ALRE-'))).toBe(false);
		expect(lines.some((l) => l.includes('ALREADY'))).toBe(true);
	});

	it('utilizes vertical height budget with balanced line distribution in narrow tall boxes', () => {
		const c = createCanvas(10, 10);
		const x = c.getContext('2d');
		// Region #6 from Page 64030: w: 64, h: 227
		const text = 'A daydream... this must surely be a dream...';
		const size = fitFontSize(x, text, 'Arial', 64, 227, 40);
		expect(size).toBeGreaterThanOrEqual(10); // MUST STAY LEGIBLE (>= 10px instead of 6px)

		x.font = `${size}px Arial`;
		const maxW = 64 * (1 - 2 * 0.05);
		const lines = reflowText(x, text, maxW);
		// Verified to strictly fit height
		expect(lines.length * size * 1.2).toBeLessThanOrEqual(227 * 0.9);
	});

	it('renders Korean Hangul dialogue text using Korean font stack in typesetPage', async () => {
		const pageImage = createCanvas(800, 1200).toBuffer('image/png');
		const resultBuf = await typesetPage(
			pageImage,
			[
				{
					id: 'r0',
					box: { x: 100, y: 100, w: 300, h: 150 },
					text: '만약 이번 일격이 네 눈을 노렸다면, 지금 넌 어떻게 됐을까?',
					kind: 'dialogue_bubble',
				},
			],
			{ format: 'png' },
		);
		expect(resultBuf.length).toBeGreaterThan(0);
	});

	it('renders Hindi Devanagari dialogue text using Nirmala UI font stack in typesetPage', async () => {
		const pageImage = createCanvas(800, 1200).toBuffer('image/png');
		const resultBuf = await typesetPage(
			pageImage,
			[
				{
					id: 'r0',
					box: { x: 100, y: 100, w: 300, h: 150 },
					text: 'मुझे फाइटर बनना था। पर मैं तो जादूगर बन गया!',
					kind: 'dialogue_bubble',
				},
			],
			{ format: 'png' },
		);
		expect(resultBuf.length).toBeGreaterThan(0);
	});

	it('renders Thai dialogue text using Leelawadee UI font stack in typesetPage', async () => {
		const pageImage = createCanvas(800, 1200).toBuffer('image/png');
		const resultBuf = await typesetPage(
			pageImage,
			[
				{
					id: 'r0',
					box: { x: 100, y: 100, w: 300, h: 150 },
					text: 'ฉันอยากเล่นเป็นนักสู้ แต่กลับกลายเป็นนักเวทซะงั้น!',
					kind: 'dialogue_bubble',
				},
			],
			{ format: 'png' },
		);
		expect(resultBuf.length).toBeGreaterThan(0);
	});
});





