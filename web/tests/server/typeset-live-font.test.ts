// LIVE CUSTOM FONT TYPESETTING INTEGRATION TEST
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { GlobalFonts } from '@napi-rs/canvas';
import { getTestDb, resetDb } from '../helpers/db';
import { customFonts, customFontFiles } from '$lib/server/db/schema';
import {
	typesetPage,
	getUserFontsDir,
	ensureFontRegistered,
	fontSpec,
	LATIN_DIALOGUE_FONTS,
} from '$lib/server/typeset';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

describe('Live Custom Font Typesetting Without Server Restart', () => {
	const fontDir = join(process.cwd(), 'static/fonts');
	const testFontName = 'LiveImportedTestFont';
	const testFontFileName = 'test-live-font-uuid.ttf';
	let writtenFilePath: string | null = null;

	beforeEach(() => {
		resetDb();
	});

	afterEach(() => {
		if (writtenFilePath && existsSync(writtenFilePath)) {
			try {
				unlinkSync(writtenFilePath);
			} catch {}
		}
		LATIN_DIALOGUE_FONTS.delete(testFontName);
	});

	it('fontSpec does not misclassify newly introduced dialogue fonts as CJK', () => {
		const spec = fontSpec(20, testFontName, 'Hello Comic World');
		expect(spec).toContain(testFontName);
		expect(spec).not.toContain('bold 20px Microsoft YaHei');
 });

 it('typesetPage immediately registers and renders an un-restarted custom font from DB', async () => {
 const db = getTestDb();
 const userFontsDir = getUserFontsDir();
 writtenFilePath = join(userFontsDir, testFontFileName);

 // 1. WRITE FONT FILE TO USER FONTS DIRECTORY
 const sampleFont = readFileSync(join(fontDir, 'GeneralSans-Regular.ttf'));
 writeFileSync(writtenFilePath, sampleFont);

 // 2. INSERT RECORD DIRECTLY INTO SQLITE (SIMULATES DATABASE WRITE FROM ANOTHER WORKER OR BACKGROUND TASK)
 const fontId = 'live-font-id-123';
 db.insert(customFonts).values({
 id: fontId,
 name: testFontName,
 fileName: testFontFileName,
 format: 'truetype',
 scriptType: 'dialogue',
 fileSize: sampleFont.length,
 supportedWeights: JSON.stringify(['normal']),
 isVariable: false,
 createdAt: Date.now(),
 }).run();

 // 3. VERIFY ensureFontRegistered LOCATES AND REGISTERS FONT ON DEMAND
 const registered = ensureFontRegistered(testFontName, db);
 expect(registered).toBe(true);
 expect(GlobalFonts.has(testFontName)).toBe(true);
 expect(LATIN_DIALOGUE_FONTS.has(testFontName)).toBe(true);

 // 4. RENDER PAGE VIA typesetPage USING THIS LIVE IMPORTED FONT
 const dummyPng = Buffer.from(
 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
 'base64'
 );
 const typesetBuffer = await typesetPage(
 dummyPng,
 [
 {
 id: 'live-region-1',
 box: { x: 0, y: 0, w: 200, h: 80 },
 text: 'LIVE TYPESETTING TEXT IN IMPORTED FONT',
 kind: 'dialogue_bubble',
 },
 ],
 {
 fontDialogue: testFontName,
 }
 );

 expect(typesetBuffer).toBeInstanceOf(Buffer);
 expect(typesetBuffer.length).toBeGreaterThan(0);
 });
});
