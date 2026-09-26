// PRESET GLOSSARY PACKS NEVER FALL BACK TO ENGLISH (FEAT-007 PHASE 6)
import { describe, it, expect } from 'vitest';
import { PACK_LANGUAGES, getActivePackTerms, hasPresetPacks, loadAllPacks, resolvePackTerm } from '$lib/server/glossary-packs';
import MASTER_GLOSSARY from '$lib/server/glossary-packs/data/master-glossary.json';

describe('preset pack languages', () => {
	it('lists the 20 pack languages, matching the master entities', () => {
		expect(PACK_LANGUAGES).toHaveLength(20);
		const first = (MASTER_GLOSSARY as { translations: Record<string, string> }[])[0];
		expect(Object.keys(first.translations).sort()).toEqual([...PACK_LANGUAGES].sort());
	});

	it('an Arabic target gets no preset terms (never English stand-ins)', () => {
		expect(getActivePackTerms({ sourceLang: 'zh-Hans', targetLang: 'ar' }, null)).toEqual([]);
		expect(hasPresetPacks({ sourceLang: 'zh-Hans', targetLang: 'ar' })).toBe(false);
		expect(hasPresetPacks({ sourceLang: 'zh-Hans', targetLang: 'en' })).toBe(true);
	});

	it('zh-Hans to English keeps every term (no regression)', () => {
		const terms = getActivePackTerms({ sourceLang: 'zh-Hans', targetLang: 'en' }, null);
		expect(terms.length).toBe((MASTER_GLOSSARY as unknown[]).length);
		expect(terms.every((t) => t.term.source && t.term.target)).toBe(true);
	});

	it('an entity missing the target translation is skipped', () => {
		const entity = { theme: 'xianxia', category: 'term', translations: { 'zh-Hans': '灵气', en: 'Qi' } } as never;
		expect(resolvePackTerm(entity, 'zh-Hans', 'en')).toMatchObject({ source: '灵气', target: 'Qi' });
		expect(resolvePackTerm(entity, 'zh-Hans', 'fr')).toBeNull();
	});

	it('the pack map still covers every pack-language pair', () => {
		const packs = loadAllPacks();
		expect(packs.has('zh-Hans-en-xianxia')).toBe(true);
		expect([...packs.keys()].some((id) => id.includes('-ar-'))).toBe(false);
	});
});
