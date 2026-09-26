// FEAT-006 REGRESSION TESTS (VALIDATION T1 TO T6): NON-LATIN TEXT MUST RENDER REAL GLYPHS, NOT .notdef BOXES
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

import {
	BUNDLED_SCRIPT_FONTS,
	drawTextLineWithRuns,
	fontFor,
	registerFonts,
	splitTextRuns,
	typesetPage,
} from '$lib/server/typeset';
import type { ScriptFontContext } from '$lib/server/typeset/script-fonts';

// -- HELPERS -- //

const ZWNJ = String.fromCodePoint(0x200c);
// PRIVATE USE CODE POINTS: NO FONT HAS GLYPHS FOR THEM, SO THEY ALWAYS DRAW AS .notdef
const PUA = String.fromCodePoint(0xe000, 0xe001, 0xe002);

function ctxFor(dialogue: string, targetScript: ScriptFontContext['targetScript'], scriptFonts: ScriptFontContext['scriptFonts'] = {}): ScriptFontContext {
	return { dialogue, scriptFonts, targetScript, bundled: BUNDLED_SCRIPT_FONTS };
}

function drawLine(text: string, sctx: ScriptFontContext): Buffer {
	const canvas = createCanvas(240, 80);
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, 240, 80);
	drawTextLineWithRuns(ctx, text, 120, 56, 40, sctx.dialogue, '', { fill: 'black', stroke: 'white' }, 0, false, undefined, 'center', 'normal', 'normal', sctx);
	return canvas.data();
}

beforeAll(() => {
	registerFonts();
});

// -- TESTS -- //

describe('script-aware typesetting (FEAT-006)', () => {
	it('T1: Devanagari with a Latin dialogue font draws real, distinct glyphs', () => {
		const sctx = ctxFor('General Sans', 'devanagari');
		const a = drawLine('कमल', sctx);
		const b = drawLine('नयन', sctx);
		const boxes = drawLine(PUA, sctx);
		expect(a.equals(b)).toBe(false);
		expect(a.equals(boxes)).toBe(false);
		expect(b.equals(boxes)).toBe(false);
	});

	it('T2: typesetPage output differs for two different Hindi words', async () => {
		const page = createCanvas(400, 300).toBuffer('image/png');
		const render = (text: string) =>
			typesetPage(page, [{ id: 'r0', box: { x: 50, y: 50, w: 300, h: 200 }, text, kind: 'dialogue_bubble' }], {
				fontDialogue: 'General Sans',
				targetScript: 'devanagari',
			});
		const [a, b] = await Promise.all([render('कमल'), render('नयन')]);
		expect(a.equals(b)).toBe(false);
	});

	it('T3: a dialogue font that covers the script is used for it', () => {
		expect(fontFor('नमस्ते', 'Poppins', undefined, ctxFor('Poppins', 'devanagari'))).toBe('Poppins');
	});

	it('T4: an explicit script slot wins over a covering dialogue font', () => {
		const sctx = ctxFor('Poppins', 'devanagari', { devanagari: 'Noto Sans Devanagari' });
		expect(fontFor('नमस्ते', 'Poppins', undefined, sctx)).toBe('Noto Sans Devanagari');
	});

	it('T5: a mixed line splits by script, and a ZWNJ never starts a run', () => {
		const sctx = ctxFor('CC Wild Words', 'devanagari');
		const runs = splitTextRuns('OK नमस्ते', 'CC Wild Words', undefined, sctx);
		expect(runs.map((r) => r.script)).toEqual(['latin', 'devanagari']);
		expect(runs[0].font).toBe('CC Wild Words');
		expect(runs[1].stack?.[0]).toBe('Noto Sans Devanagari');

		const word = `क्${ZWNJ}ष`;
		const joined = splitTextRuns(word, 'CC Wild Words', undefined, sctx);
		expect(joined).toHaveLength(1);
		expect(joined[0].text).toBe(word);
	});

	it('T6: a line with Arabic stays one run (single-run RTL guard)', () => {
		const runs = splitTextRuns('مرحبا Ali', 'CC Wild Words', undefined, ctxFor('CC Wild Words', 'arabic'));
		expect(runs).toHaveLength(1);
		expect(runs[0].script).toBe('arabic');
		expect(runs[0].stack?.[0]).toBe('Tajawal');
	});

	it('keeps the old splitting when no script context is given', () => {
		expect(splitTextRuns('Hello')).toEqual([{ text: 'Hello', font: 'CC Wild Words', isFallbackSymbol: false }]);
	});
});
