// OS FONT TABLES AND TOLERANT FILE LOOKUP (FEAT-006 PHASE 4)
import { describe, it, expect, vi } from 'vitest';
import { SYSTEM_SCRIPT_FAMILIES, systemFamiliesFor } from '$lib/server/typeset/system-script-fonts';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

describe('systemFamiliesFor', () => {
	it('returns the table for the given platform', () => {
		expect(systemFamiliesFor('devanagari', 'win32')[0]).toBe('Nirmala UI');
		expect(systemFamiliesFor('thai', 'darwin')).toContain('Thonburi');
		expect(systemFamiliesFor('arabic', 'linux')).toContain('Noto Sans Arabic');
	});

	it('defaults to the running platform and is empty for unknown ones', () => {
		expect(systemFamiliesFor('han')).toEqual(SYSTEM_SCRIPT_FAMILIES[process.platform]?.han ?? []);
		expect(systemFamiliesFor('han', 'aix')).toEqual([]);
	});
});

describe('font directory index', () => {
	it('finds a file whatever the case of its name', async () => {
		const { fontDirIndex } = await import('$lib/server/typeset/fonts');
		const index = fontDirIndex('fake-dir-for-test', () => ['NIRMALA.TTC', 'LeelaUIb.ttf']);
		expect(index.get('nirmala.ttc')).toBe('NIRMALA.TTC');
		expect(index.get('leelauib.ttf')).toBe('LeelaUIb.ttf');
		expect(index.get('mangal.ttf')).toBeUndefined();
	});
});

describe('resolveSystemFontFilePath', () => {
	it.runIf(process.platform === 'win32')('returns the real Arial face, not Arial Narrow', async () => {
		const { resolveSystemFontFilePath } = await import('$lib/server/typeset/fonts');
		const { parseFontBuffer } = await import('$lib/server/typeset/font-parser');
		const { readFileSync } = await import('node:fs');
		const path = resolveSystemFontFilePath('Arial');
		expect(path).not.toBeNull();
		expect(parseFontBuffer(readFileSync(path as string)).familyName).toBe('Arial');
	});
});
