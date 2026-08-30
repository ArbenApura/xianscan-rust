// SYSTEM DEFAULT GLOSSARY PACKS REGISTRY AND PROVIDER
// IMPORTED TYPES
import type { LangPair, TermDraft } from '$lib/types';
import fs from 'fs';
import path from 'path';

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

// -- CONSTANTS -- //

const PACKS_DIR = path.resolve(process.cwd(), 'src/lib/server/glossary-packs/data');
const ALT_PACKS_DIR = path.resolve(process.cwd(), 'web/src/lib/server/glossary-packs/data');

const PACK_METAS: Record<string, Omit<GlossaryPackMeta, 'termCount'>> = {
	'zh-en-xianxia': {
		id: 'zh-en-xianxia',
		name: 'Wuxia & Cultivation (Xianxia)',
		theme: 'xianxia',
		description: 'Standard terminology for Cultivation realms, meridians, sects, alchemy, and items.',
		sourceLang: 'zh-Hans',
		targetLang: 'en',
		enabledByDefault: true,
	},
	'ko-en-murim-hunter': {
		id: 'ko-en-murim-hunter',
		name: 'Murim & Martial Arts (Korean)',
		theme: 'murim',
		description: 'Standard terminology for Murim clans, martial sects, internal energy, and Qi deviation.',
		sourceLang: 'ko',
		targetLang: 'en',
		enabledByDefault: true,
	},
	'zh-en-murim': {
		id: 'zh-en-murim',
		name: 'Murim & Martial Arts (Chinese)',
		theme: 'murim',
		description: 'Traditional & Simplified Chinese martial arts terminology for Murim sects, factions, and Neigong.',
		sourceLang: 'zh-Hant',
		targetLang: 'en',
		enabledByDefault: true,
	},
	'ko-en-system': {
		id: 'ko-en-system',
		name: 'Hunter & System Leveling',
		theme: 'system',
		description: 'Standard terminology for Awakened hunters, gates, status windows, constellations, and regressors.',
		sourceLang: 'ko',
		targetLang: 'en',
		enabledByDefault: true,
	},
	'ja-en-fantasy': {
		id: 'ja-en-fantasy',
		name: 'Fantasy & Isekai Guilds',
		theme: 'fantasy',
		description: 'Standard terminology for Adventurers\' Guilds, Demon Lords, Heroes, Saintesses, and magic arrays.',
		sourceLang: 'ja',
		targetLang: 'en',
		enabledByDefault: true,
	},
	'ko-en-rofan': {
		id: 'ko-en-rofan',
		name: 'Romance Fantasy & Otome Isekai',
		theme: 'rofan',
		description: 'Standard terminology for Villainesses, Grand Dukes, Crown Princes, debutantes, and white lotuses.',
		sourceLang: 'ko',
		targetLang: 'en',
		enabledByDefault: true,
	},
	'zh-en-palace': {
		id: 'zh-en-palace',
		name: 'Imperial Palace & Court Drama',
		theme: 'palace',
		description: 'Standard terminology for Emperors, Imperial Consorts, Cold Palace, and royal court etiquette.',
		sourceLang: 'zh-Hans',
		targetLang: 'en',
		enabledByDefault: true,
	},
	'zh-en-scifi': {
		id: 'zh-en-scifi',
		name: 'Sci-Fi, Mecha & Sentinelverse',
		theme: 'scifi',
		description: 'Standard terminology for Sentinels, Guides, mental landscapes, Mecha synchronization, and Zerg.',
		sourceLang: 'zh-Hans',
		targetLang: 'en',
		enabledByDefault: true,
	},
};

// CACHED PACKS MAP
let cachedPacks: Map<string, GlossaryPack> | null = null;

export function clearPacksCache(): void {
	cachedPacks = null;
}

// -- FUNCTIONS -- //

function getResolvedPacksDir(): string {
	if (fs.existsSync(PACKS_DIR)) return PACKS_DIR;
	if (fs.existsSync(ALT_PACKS_DIR)) return ALT_PACKS_DIR;
	return PACKS_DIR;
}

export function loadAllPacks(): Map<string, GlossaryPack> {
	if (cachedPacks) return cachedPacks;
	const dir = getResolvedPacksDir();
	const packs = new Map<string, GlossaryPack>();

	if (!fs.existsSync(dir)) {
		cachedPacks = packs;
		return packs;
	}

	const manifestPath = path.join(dir, 'packs-manifest.json');
	const THEME_TITLES: Record<string, string> = {
		xianxia: 'Wuxia & Cultivation (Xianxia)',
		murim: 'Murim & Martial Arts',
		system: 'Hunter & System Leveling',
		fantasy: 'Fantasy & Isekai Guilds',
		rofan: 'Romance Fantasy & Otome Isekai',
		palace: 'Imperial Palace & Court Drama',
		scifi: 'Sci-Fi, Mecha & Sentinelverse',
	};

	if (fs.existsSync(manifestPath)) {
		try {
			const manifest: Record<string, TermDraft[]> = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
			for (const [packId, terms] of Object.entries(manifest)) {
				let meta = PACK_METAS[packId];
				if (!meta) {
					const parts = packId.split('-');
					if (parts.length >= 3) {
						const src = parts[0] === 'zh' ? `${parts[0]}-${parts[1]}` : parts[0];
						const rem = parts[0] === 'zh' ? parts.slice(2) : parts.slice(1);
						const tgt = rem[0] === 'zh' ? `${rem[0]}-${rem[1]}` : rem[0];
						const theme = rem[0] === 'zh' ? rem.slice(2).join('-') : rem.slice(1).join('-');

						meta = {
							id: packId,
							name: THEME_TITLES[theme] || theme,
							theme,
							description: `Preset terms for ${THEME_TITLES[theme] || theme}`,
							sourceLang: src,
							targetLang: tgt,
							enabledByDefault: true,
						};
					} else {
						meta = {
							id: packId,
							name: packId.replace(/[-_]/g, ' '),
							theme: 'other',
							description: 'Preset glossary pack',
							sourceLang: 'zh-Hans',
							targetLang: 'en',
							enabledByDefault: true,
						};
					}
				}

				packs.set(packId, {
					...meta,
					termCount: terms.length,
					terms,
				});
			}

			cachedPacks = packs;
			return packs;
		} catch (err) {
			console.error('Failed to load packs-manifest.json:', err);
		}
	}

	const files = fs.readdirSync(dir);
	for (const file of files) {
		if (!file.endsWith('.json') || file === 'packs-manifest.json') continue;
		const packId = file.replace(/\.json$/, '');
		
		let meta = PACK_METAS[packId];
		if (!meta) {
			const parts = packId.split('-');
			if (parts.length >= 3) {
				const src = parts[0] === 'zh' ? `${parts[0]}-${parts[1]}` : parts[0];
				const rem = parts[0] === 'zh' ? parts.slice(2) : parts.slice(1);
				const tgt = rem[0] === 'zh' ? `${rem[0]}-${rem[1]}` : rem[0];
				const theme = rem[0] === 'zh' ? rem.slice(2).join('-') : rem.slice(1).join('-');

				meta = {
					id: packId,
					name: THEME_TITLES[theme] || theme,
					theme,
					description: `Preset terms for ${THEME_TITLES[theme] || theme}`,
					sourceLang: src,
					targetLang: tgt,
					enabledByDefault: true,
				};
			} else {
				meta = {
					id: packId,
					name: packId.replace(/[-_]/g, ' '),
					theme: 'other',
					description: 'Preset glossary pack',
					sourceLang: 'zh-Hans',
					targetLang: 'en',
					enabledByDefault: true,
				};
			}
		}

		try {
			const fullPath = path.join(dir, file);
			const raw = fs.readFileSync(fullPath, 'utf8');
			const terms: TermDraft[] = JSON.parse(raw);
			packs.set(packId, {
				...meta,
				termCount: terms.length,
				terms,
			});
		} catch (err) {
			console.error(`Failed to load glossary pack ${file}:`, err);
		}
	}

	cachedPacks = packs;
	return packs;
}

export interface UniversalThemeMeta {
	id: string;
	name: string;
	theme: string;
	description: string;
	termCount: number;
	enabledByDefault?: boolean;
}

export const UNIVERSAL_THEMES: UniversalThemeMeta[] = [
	{
		id: 'xianxia',
		theme: 'xianxia',
		name: 'Wuxia & Cultivation (Xianxia)',
		description: 'Standard terminology for Cultivation realms, meridians, sects, alchemy, and items.',
		termCount: 189,
		enabledByDefault: true,
	},
	{
		id: 'murim',
		theme: 'murim',
		name: 'Murim & Martial Arts',
		description: 'Standard terminology for Murim clans, martial sects, internal energy, and Qi deviation.',
		termCount: 195,
		enabledByDefault: true,
	},
	{
		id: 'system',
		theme: 'system',
		name: 'Hunter & System Leveling',
		description: 'Standard terminology for Awakened hunters, gates, status windows, constellations, and regressors.',
		termCount: 150,
		enabledByDefault: true,
	},
	{
		id: 'fantasy',
		theme: 'fantasy',
		name: 'Fantasy & Isekai Guilds',
		description: 'Standard terminology for Adventurers\' Guilds, Demon Lords, Heroes, Saintesses, and magic arrays.',
		termCount: 120,
		enabledByDefault: true,
	},
	{
		id: 'rofan',
		theme: 'rofan',
		name: 'Romance Fantasy & Otome Isekai',
		description: 'Standard terminology for Villainesses, Grand Dukes, Crown Princes, debutantes, and white lotuses.',
		termCount: 140,
		enabledByDefault: true,
	},
	{
		id: 'palace',
		theme: 'palace',
		name: 'Imperial Palace & Court Drama',
		description: 'Standard terminology for Emperors, Imperial Consorts, Cold Palace, and royal court etiquette.',
		termCount: 130,
		enabledByDefault: true,
	},
	{
		id: 'scifi',
		theme: 'scifi',
		name: 'Sci-Fi, Mecha & Sentinelverse',
		description: 'Standard terminology for Sentinels, Guides, mental landscapes, Mecha synchronization, and Zerg.',
		termCount: 115,
		enabledByDefault: true,
	},
];

export function listAvailablePacks(): UniversalThemeMeta[] {
	const packs = loadAllPacks();
	
	return UNIVERSAL_THEMES.map((themeMeta) => {
		let maxCount = 0;
		for (const pack of packs.values()) {
			if (pack.theme === themeMeta.theme) {
				if (pack.termCount > maxCount) maxCount = pack.termCount;
			}
		}
		return {
			...themeMeta,
			termCount: maxCount,
		};
	});
}

export function getPack(packId: string): GlossaryPack | null {
	const packs = loadAllPacks();
	return packs.get(packId) ?? null;
}

/**
 * Returns all terms for enabled packs matching the given language pair.
 * If enabledPackIds is null/undefined, returns all packs that are enabled by default.
 */
export function getActivePackTerms(
	pair: LangPair,
	enabledPackIds?: string[] | null,
): { term: TermDraft; packId: string }[] {
	const packs = loadAllPacks();
	const results: { term: TermDraft; packId: string }[] = [];

	for (const pack of packs.values()) {
		// EXACT SOURCE AND TARGET LANGUAGE MATCH (PREVENTS zh-Hans and zh-Hant DUPLICATION)
		const srcMatch = pack.sourceLang === pair.sourceLang;
		const tgtMatch = pack.targetLang === pair.targetLang;
		if (!srcMatch || !tgtMatch) continue;

		// PACK ENABLEMENT CHECK: IF AN ARRAY IS PASSED, STRICTLY FOLLOW THE ARRAY (MATCHES EITHER pack.id OR pack.theme)
		const isEnabled = Array.isArray(enabledPackIds)
			? enabledPackIds.includes(pack.id) || enabledPackIds.includes(pack.theme)
			: pack.enabledByDefault ?? true;
		if (!isEnabled) continue;

		for (const t of pack.terms) {
			results.push({ term: t, packId: pack.id });
		}
	}

	return results;
}
