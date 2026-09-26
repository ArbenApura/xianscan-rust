// SYSTEM DEFAULT GLOSSARY PACKS REGISTRY AND PROVIDER
// IMPORTED TYPES
import type { LangPair, TermDraft } from '$lib/types';
import MASTER_GLOSSARY from './data/master-glossary.json';
// THE LANGUAGES EVERY MASTER ENTITY HAS A TRANSLATION FOR (SHARED WITH scripts/compile_glossary_packs.js)
import PACK_LANGUAGES_JSON from './data/pack-languages.json';

export const PACK_LANGUAGES: readonly string[] = PACK_LANGUAGES_JSON;

// -- TYPES -- //

export interface GlossaryPackMeta {
	id: string;
	name: string;
	theme: string;
	description: string;
	sourceLang: string;
	targetLang: string;
	termCount: number;
	enabledByDefault?: boolean;
}

export interface GlossaryPack extends GlossaryPackMeta {
	terms: TermDraft[];
}

export interface MasterGlossaryEntity {
	theme: string;
	category: string;
	gender?: string;
	context: string;
	translations: Record<string, string>;
}

export interface UniversalThemeMeta {
	id: string;
	name: string;
	theme: string;
	description: string;
	termCount: number;
	enabledByDefault?: boolean;
}

// -- CONSTANTS -- //

const THEME_TITLES: Record<string, string> = {
	xianxia: 'Wuxia & Cultivation (Xianxia)',
	murim: 'Murim & Martial Arts',
	system: 'Hunter & System Leveling',
	fantasy: 'Fantasy & Isekai Guilds',
	rofan: 'Romance Fantasy & Otome Isekai',
	palace: 'Imperial Palace & Court Drama',
	scifi: 'Sci-Fi, Mecha & Sentinelverse',
};

const THEME_DESCRIPTIONS: Record<string, string> = {
	xianxia: 'Standard terminology for Cultivation realms, meridians, sects, alchemy, and items.',
	murim: 'Standard terminology for Murim clans, martial sects, internal energy, and Qi deviation.',
	system: 'Standard terminology for Awakened hunters, gates, status windows, constellations, and regressors.',
	fantasy: 'Standard terminology for Adventurers\' Guilds, Demon Lords, Heroes, Saintesses, and magic arrays.',
	rofan: 'Standard terminology for Villainesses, Grand Dukes, Crown Princes, debutantes, and white lotuses.',
	palace: 'Standard terminology for Emperors, Imperial Consorts, Cold Palace, and royal court etiquette.',
	scifi: 'Standard terminology for Sentinels, Guides, mental landscapes, Mecha synchronization, and Zerg.',
};

export const UNIVERSAL_THEMES: UniversalThemeMeta[] = Object.keys(THEME_TITLES).map((theme) => {
	const count = (MASTER_GLOSSARY as MasterGlossaryEntity[]).filter((e) => e.theme === theme).length;
	return {
		id: theme,
		theme,
		name: THEME_TITLES[theme],
		description: THEME_DESCRIPTIONS[theme] || 'Preset terms',
		termCount: count,
		enabledByDefault: true,
	};
});

// CACHED PACKS MAP
let cachedPacks: Map<string, GlossaryPack> | null = null;

export function clearPacksCache(): void {
	cachedPacks = null;
}

// -- FUNCTIONS -- //

/**
 * Builds and returns all 2,660 multilingual theme packs derived dynamically in memory (<1ms).
 */
/**
 * ONE PACK TERM FOR A LANGUAGE PAIR, OR NULL WHEN THE ENTITY HAS NO TRANSLATION ON EITHER SIDE. NEVER FALLS BACK TO
 * ENGLISH OR CHINESE: A WRONG-LANGUAGE "TRANSLATION" IN THE GLOSSARY IS WORSE THAN NONE (FEAT-007 ADR-006).
 */
export function resolvePackTerm(entity: MasterGlossaryEntity, src: string, tgt: string): TermDraft | null {
	const source = entity.translations[src];
	const target = entity.translations[tgt];
	if (!source || !target) return null;
	return {
		source,
		target,
		category: entity.category as any,
		gender: (entity.gender || 'neuter') as any,
		aliases: [],
		context: entity.context,
		pinned: false,
	};
}

/** TRUE WHEN THE PRESET PACKS HAVE TERMS FOR THIS LANGUAGE PAIR. */
export function hasPresetPacks(pair: LangPair): boolean {
	return PACK_LANGUAGES.includes(pair.sourceLang) && PACK_LANGUAGES.includes(pair.targetLang);
}

export function loadAllPacks(): Map<string, GlossaryPack> {
	if (cachedPacks) return cachedPacks;
	const packs = new Map<string, GlossaryPack>();
	const entities = MASTER_GLOSSARY as MasterGlossaryEntity[];

	for (const src of PACK_LANGUAGES) {
		for (const tgt of PACK_LANGUAGES) {
			if (src === tgt) continue;

			for (const theme of Object.keys(THEME_TITLES)) {
				const packId = `${src}-${tgt}-${theme}`;
				const themeEntities = entities.filter((e) => e.theme === theme);

				const terms: TermDraft[] = themeEntities
					.map((entity) => resolvePackTerm(entity, src, tgt))
					.filter((term): term is TermDraft => term !== null);

				packs.set(packId, {
					id: packId,
					name: THEME_TITLES[theme] || theme,
					theme,
					description: THEME_DESCRIPTIONS[theme] || 'Preset glossary pack',
					sourceLang: src,
					targetLang: tgt,
					termCount: terms.length,
					enabledByDefault: true,
					terms,
				});
			}
		}
	}

	cachedPacks = packs;
	return packs;
}

export function listAvailablePacks(): UniversalThemeMeta[] {
	return UNIVERSAL_THEMES;
}

export function getPack(packId: string): GlossaryPack | null {
	const packs = loadAllPacks();
	return packs.get(packId) ?? null;
}

/**
 * Returns all terms for enabled packs matching the given language pair.
 * Directly filters the lean master dataset for maximum efficiency.
 */
export function getActivePackTerms(
	pair: LangPair,
	enabledPackIds?: string[] | null,
): { term: TermDraft; packId: string }[] {
	const results: { term: TermDraft; packId: string }[] = [];
	const entities = MASTER_GLOSSARY as MasterGlossaryEntity[];
	const { sourceLang: src, targetLang: tgt } = pair;
	// NO PRESET TERMS FOR A PAIR OUTSIDE THE PACK LANGUAGES (E.G. ARABIC): NEVER SUBSTITUTE ENGLISH
	if (!hasPresetPacks(pair)) return results;

	for (const theme of Object.keys(THEME_TITLES)) {
		const packId = `${src}-${tgt}-${theme}`;
		const isEnabled = Array.isArray(enabledPackIds)
			? enabledPackIds.includes(packId) || enabledPackIds.includes(theme)
			: true;
		if (!isEnabled) continue;

		const themeEntities = entities.filter((e) => e.theme === theme);
		for (const entity of themeEntities) {
			const term = resolvePackTerm(entity, src, tgt);
			if (term) results.push({ term, packId });
		}
	}

	return results;
}
