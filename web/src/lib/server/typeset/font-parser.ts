// TRUETYPE & OPENTYPE FONT BINARY PARSER WITHOUT EXTERNAL DEPENDENCIES
// IMPORTED MODULES
import type { Script } from '$lib/languages';

// -- TYPES -- //

export interface ParsedFontMeta {
	familyName: string;
	subfamilyName: string;
	postScriptName?: string;
	format: 'truetype' | 'opentype';
	supportedWeights: ('normal' | 'bold')[];
	allCapsOnly?: boolean;
	lowercaseOnly?: boolean;
	supportedCasings?: ('uppercase' | 'original' | 'lowercase')[];
	weightClass?: number;
	weightNumeric: number;
	weightLabel: string;
	style: 'normal' | 'italic';
	isVariable: boolean;
	/** SCRIPTS WHOSE PROBE CHARACTERS ALL HAVE GLYPHS IN THE cmap (FEAT-006). */
	scripts: Script[];
}

export interface ParsedFontVariantItem {
	fileName: string;
	buffer: Buffer;
	meta: ParsedFontMeta;
}

export interface ParsedFontFamilyGroup {
	familyName: string;
	format: 'truetype' | 'opentype';
	isVariable: boolean;
	supportedWeights: ('normal' | 'bold')[];
	allCapsOnly?: boolean;
	lowercaseOnly?: boolean;
	supportedCasings?: ('uppercase' | 'original' | 'lowercase')[];
	variants: ParsedFontVariantItem[];
}

// -- CONSTANTS -- //

const TTF_MAGIC = 0x00010000;
const TRUE_MAGIC = 0x74727565; // ASCII 'TRUE' IDENTIFIER
const OTTO_MAGIC = 0x4f54544f; // ASCII 'OTTO' IDENTIFIER
const TTCF_MAGIC = 0x74746366; // ASCII 'ttcf' (TRUETYPE COLLECTION)

/**
 * CHARACTERS A FONT MUST HAVE (ALL OF THEM) TO COUNT AS COVERING A SCRIPT. SMALL, BUT THEY INCLUDE THE VOWEL
 * SIGNS / MARKS A PARTIAL FONT USUALLY LACKS.
 */
export const SCRIPT_PROBES: Record<Script, string> = {
	latin: 'AZaz',
	han: '一的人国',
	kana: 'あアン',
	hangul: '가한다',
	devanagari: 'करा्ि',
	thai: 'กา่ั',
	arabic: 'المي',
	cyrillic: 'АЯая',
	greek: 'ΑΩαω',
	hebrew: 'אש',
	bengali: 'কা',
	tamil: 'கா',
};

// FAMILY / FILE NAMES OF PRE-UNICODE HINDI FONTS: THEY PUT DEVANAGARI SHAPES ON LATIN CODE POINTS
const LEGACY_HINDI_NAMES = /kruti|devlys|chanakya|walkman/i;

// NAME IDS IN TRUETYPE / OPENTYPE 'name' TABLE
const NAME_ID_FAMILY = 1;
const NAME_ID_SUBFAMILY = 2;
const NAME_ID_POSTSCRIPT = 6;
const NAME_ID_TYPOGRAPHIC_FAMILY = 16;
const NAME_ID_TYPOGRAPHIC_SUBFAMILY = 17;

// -- FUNCTIONS -- //

function decodeUtf16Be(buf: Buffer, start: number, length: number): string {
	let s = '';
	for (let i = 0; i < length; i += 2) {
		if (start + i + 1 >= buf.length) break;
		const code = buf.readUInt16BE(start + i);
		if (code !== 0) {
			s += String.fromCharCode(code);
		}
	}
	return s.trim();
}

/** SORTED, MERGED CODE POINT RANGES WITH A BINARY-SEARCH LOOKUP (A CJK FONT MAPS 20 000+ CODE POINTS). */
export class CodepointSet {
	readonly ranges: readonly [number, number][];

	constructor(ranges: [number, number][]) {
		const sorted = ranges.filter(([a, b]) => a <= b).sort((x, y) => x[0] - y[0]);
		const merged: [number, number][] = [];
		for (const [a, b] of sorted) {
			const last = merged[merged.length - 1];
			if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
			else merged.push([a, b]);
		}
		this.ranges = merged;
	}

	has(cp: number): boolean {
		let lo = 0;
		let hi = this.ranges.length - 1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			const [a, b] = this.ranges[mid];
			if (cp < a) hi = mid - 1;
			else if (cp > b) lo = mid + 1;
			else return true;
		}
		return false;
	}

	hasAll(text: string): boolean {
		for (const ch of text) {
			if (!this.has(ch.codePointAt(0) as number)) return false;
		}
		return true;
	}

	/** TRUE WHEN ANY CODE POINT IN [start, end] IS PRESENT. */
	hasAnyIn(start: number, end: number): boolean {
		return this.ranges.some(([a, b]) => a <= end && b >= start);
	}
}

/** TABLE DIRECTORY OFFSETS: ONE PER FONT IN A .ttc COLLECTION, OR [0] FOR A SINGLE FONT FILE. */
export function splitFontCollection(buf: Buffer): number[] {
	if (buf.length < 12 || buf.readUInt32BE(0) !== TTCF_MAGIC) return [0];
	const numFonts = buf.readUInt32BE(8);
	const offsets: number[] = [];
	for (let i = 0; i < numFonts; i++) {
		const at = 12 + i * 4;
		if (at + 4 > buf.length) break;
		offsets.push(buf.readUInt32BE(at));
	}
	return offsets.length > 0 ? offsets : [0];
}

/** ABSOLUTE OFFSET AND LENGTH OF A TABLE FROM THE DIRECTORY AT `dirOffset`, OR NULL. */
function findTable(buf: Buffer, dirOffset: number, tag: string): { offset: number; length: number } | null {
	if (dirOffset + 12 > buf.length) return null;
	const numTables = buf.readUInt16BE(dirOffset + 4);
	for (let i = 0; i < numTables; i++) {
		const entry = dirOffset + 12 + i * 16;
		if (entry + 16 > buf.length) break;
		if (buf.toString('ascii', entry, entry + 4) === tag) {
			return { offset: buf.readUInt32BE(entry + 8), length: buf.readUInt32BE(entry + 12) };
		}
	}
	return null;
}

function readFormat4(buf: Buffer, sub: number): [number, number][] {
	const segCountX2 = buf.readUInt16BE(sub + 6);
	const segCount = segCountX2 >> 1;
	const endCodes = sub + 14;
	const startCodes = endCodes + 2 + segCountX2;
	const idDeltas = startCodes + segCountX2;
	const idRangeOffsets = idDeltas + segCountX2;
	if (idRangeOffsets + segCountX2 > buf.length) return [];
	const ranges: [number, number][] = [];
	for (let s = 0; s < segCount; s++) {
		const end = buf.readUInt16BE(endCodes + s * 2);
		const start = buf.readUInt16BE(startCodes + s * 2);
		const delta = buf.readInt16BE(idDeltas + s * 2);
		const rangeOffsetAt = idRangeOffsets + s * 2;
		const rangeOffset = buf.readUInt16BE(rangeOffsetAt);
		if (start === 0xffff) continue;
		let runStart = -1;
		for (let cp = start; cp <= end; cp++) {
			let glyph: number;
			if (rangeOffset === 0) {
				glyph = (cp + delta) & 0xffff;
			} else {
				const at = rangeOffsetAt + rangeOffset + 2 * (cp - start);
				const raw = at + 2 <= buf.length ? buf.readUInt16BE(at) : 0;
				glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
			}
			// GLYPH 0 IS .notdef: THE CODE POINT IS LISTED BUT HAS NO REAL GLYPH
			if (glyph !== 0) {
				if (runStart < 0) runStart = cp;
			} else if (runStart >= 0) {
				ranges.push([runStart, cp - 1]);
				runStart = -1;
			}
		}
		if (runStart >= 0) ranges.push([runStart, end]);
	}
	return ranges;
}

function readFormat12(buf: Buffer, sub: number): [number, number][] {
	const numGroups = buf.readUInt32BE(sub + 12);
	const ranges: [number, number][] = [];
	for (let g = 0; g < numGroups; g++) {
		const at = sub + 16 + g * 12;
		if (at + 12 > buf.length) break;
		const startChar = buf.readUInt32BE(at);
		const endChar = buf.readUInt32BE(at + 4);
		const startGlyph = buf.readUInt32BE(at + 8);
		// A GROUP STARTING AT .notdef ONLY LOSES ITS FIRST CODE POINT
		ranges.push([startGlyph === 0 ? startChar + 1 : startChar, endChar]);
	}
	return ranges;
}

/**
 * THE CODE POINTS THAT HAVE A REAL GLYPH, FROM THE BEST UNICODE cmap SUBTABLE: FULL-REPERTOIRE FORMAT 12 FIRST
 * (PLATFORM 3 ENCODING 10, OR PLATFORM 0), THEN BMP FORMAT 4 (PLATFORM 3 ENCODING 1, OR PLATFORM 0). AN EMPTY SET
 * WHEN THERE IS NO READABLE UNICODE cmap.
 */
export function readCmapCoverage(buf: Buffer, dirOffset = 0): CodepointSet {
	const cmap = findTable(buf, dirOffset, 'cmap');
	if (!cmap || cmap.length < 4 || cmap.offset + cmap.length > buf.length) return new CodepointSet([]);
	try {
		const numSubtables = buf.readUInt16BE(cmap.offset + 2);
		const candidates: { rank: number; sub: number; format: number }[] = [];
		for (let i = 0; i < numSubtables; i++) {
			const rec = cmap.offset + 4 + i * 8;
			if (rec + 8 > buf.length) break;
			const platform = buf.readUInt16BE(rec);
			const encoding = buf.readUInt16BE(rec + 2);
			const sub = cmap.offset + buf.readUInt32BE(rec + 4);
			if (sub + 16 > buf.length) continue;
			const format = buf.readUInt16BE(sub);
			const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
			if (!unicode) continue;
			if (format === 12) candidates.push({ rank: platform === 3 && encoding === 10 ? 0 : 1, sub, format });
			else if (format === 4) candidates.push({ rank: platform === 3 && encoding === 1 ? 2 : 3, sub, format });
		}
		candidates.sort((a, b) => a.rank - b.rank);
		const best = candidates[0];
		if (!best) return new CodepointSet([]);
		return new CodepointSet(best.format === 12 ? readFormat12(buf, best.sub) : readFormat4(buf, best.sub));
	} catch {
		// CORRUPT cmap: REPORT NOTHING RATHER THAN THROWING
		return new CodepointSet([]);
	}
}

/** EVERY SCRIPT WHOSE PROBE CHARACTERS ARE ALL PRESENT IN `set`. */
export function scriptsCoveredBy(set: CodepointSet): Script[] {
	return (Object.keys(SCRIPT_PROBES) as Script[]).filter((script) => set.hasAll(SCRIPT_PROBES[script]));
}

/**
 * A WARNING FOR FONTS THAT LOOK RIGHT IN WORD BUT RENDER AS TOFU HERE: PRE-UNICODE HINDI FONTS (KRUTI DEV,
 * DEVLYS, CHANAKYA, WALKMAN), OR A FONT NAMED FOR HINDI / DEVANAGARI THAT HAS NO DEVANAGARI GLYPHS.
 */
export function detectLegacyEncoding(
	meta: { familyName: string; postScriptName?: string; fileName?: string },
	scripts: Script[],
): string | null {
	const names = [meta.familyName, meta.postScriptName ?? '', meta.fileName ?? ''].join(' ');
	if (LEGACY_HINDI_NAMES.test(names)) {
		return `"${meta.familyName}" is a legacy (pre-Unicode) Hindi font. Its letters sit on Latin code points, so translated Hindi text would not use it. Use a Unicode Devanagari font instead.`;
	}
	if (/hindi|devanagari/i.test(names) && !scripts.includes('devanagari')) {
		return `"${meta.familyName}" is named for Hindi but has no Devanagari characters, so Hindi text would show as boxes.`;
	}
	return null;
}

function checkCmapCasingCoverage(buf: Buffer, dirOffset: number): { hasUpper: boolean; hasLower: boolean } | null {
	const set = readCmapCoverage(buf, dirOffset);
	if (set.ranges.length === 0) return null;
	return { hasUpper: set.hasAnyIn(65, 90), hasLower: set.hasAnyIn(97, 122) };
}

/**
 * PARSES FONT FILE HEADER AND EXTRACTS METADATA (FAMILY NAME, WEIGHTS, FORMAT)
 */
export function parseFontBuffer(buf: Buffer, dirOffset = 0): ParsedFontMeta {
	if (buf.length < dirOffset + 12) {
		throw new Error('INVALID FONT BUFFER: FILE TOO SMALL');
	}
	// A COLLECTION WITHOUT AN EXPLICIT FONT: READ ITS FIRST FACE
	if (dirOffset === 0 && buf.readUInt32BE(0) === TTCF_MAGIC) {
		dirOffset = splitFontCollection(buf)[0];
	}

	const sfntVersion = buf.readUInt32BE(dirOffset);
	let format: 'truetype' | 'opentype';

	if (sfntVersion === TTF_MAGIC || sfntVersion === TRUE_MAGIC) {
		format = 'truetype';
	} else if (sfntVersion === OTTO_MAGIC) {
		format = 'opentype';
	} else {
		throw new Error(`UNSUPPORTED FONT FORMAT SIGNATURE: 0x${sfntVersion.toString(16)}`);
	}

	const numTables = buf.readUInt16BE(dirOffset + 4);
	if (buf.length < dirOffset + 12 + numTables * 16) {
		throw new Error('CORRUPTED FONT HEADER: TABLE DIRECTORY TRUNCATED');
	}

	let nameTableOffset = 0;
	let nameTableLength = 0;
	let os2TableOffset = 0;
	let os2TableLength = 0;
	let fvarTableOffset = 0;
	let fvarTableLength = 0;

	for (let i = 0; i < numTables; i++) {
		const entryOffset = dirOffset + 12 + i * 16;
		const tag = buf.toString('ascii', entryOffset, entryOffset + 4);
		const offset = buf.readUInt32BE(entryOffset + 8);
		const length = buf.readUInt32BE(entryOffset + 12);

		if (tag === 'name') {
			nameTableOffset = offset;
			nameTableLength = length;
		} else if (tag === 'OS/2') {
			os2TableOffset = offset;
			os2TableLength = length;
		} else if (tag === 'fvar') {
			fvarTableOffset = offset;
			fvarTableLength = length;
		}
	}

	if (!nameTableOffset || nameTableLength < 6) {
		throw new Error('REQUIRED TABLE "name" NOT FOUND IN FONT');
	}

	// PARSE 'name' TABLE
	const nameTableEnd = nameTableOffset + nameTableLength;
	if (buf.length < nameTableEnd) {
		throw new Error('CORRUPTED FONT: "name" TABLE EXTENDS BEYOND FILE SIZE');
	}

	const nameRecordCount = buf.readUInt16BE(nameTableOffset + 2);
	const stringStorageOffset = nameTableOffset + buf.readUInt16BE(nameTableOffset + 4);

	let familyName = '';
	let subfamilyName = '';
	let typographicFamily = '';
	let typographicSubfamily = '';
	let postScriptName = '';

	// COLLECT ALL CANDIDATE NAMES BY PRIORITY (WINDOWS UNICODE > MAC ROMAN)
	let bestFamilyPriority = -1;
	let bestSubfamilyPriority = -1;
	let bestTypoFamilyPriority = -1;
	let bestTypoSubfamilyPriority = -1;
	let bestPostScriptPriority = -1;

	for (let i = 0; i < nameRecordCount; i++) {
		const recordOffset = nameTableOffset + 6 + i * 12;
		if (recordOffset + 12 > stringStorageOffset) break;

		const platformId = buf.readUInt16BE(recordOffset);
		const encodingId = buf.readUInt16BE(recordOffset + 2);
		const nameId = buf.readUInt16BE(recordOffset + 6);
		const strLength = buf.readUInt16BE(recordOffset + 8);
		const strOffset = buf.readUInt16BE(recordOffset + 10);

		const absStrOffset = stringStorageOffset + strOffset;
		if (absStrOffset + strLength > buf.length) continue;

		let strVal = '';
		let priority = 0;

		// WINDOWS (PLATFORM 3) UTF-16BE; THE en-US RECORD WINS, SO A CJK FONT GETS THE NAME SKIA REGISTERS IT UNDER
		if (platformId === 3) {
			strVal = decodeUtf16Be(buf, absStrOffset, strLength);
			const languageId = buf.readUInt16BE(recordOffset + 4);
			priority = encodingId === 1 ? (languageId === 0x0409 ? 3 : 2) : 1;
		} else if (platformId === 0) {
			// UNICODE (PLATFORM 0) UTF-16BE
			strVal = decodeUtf16Be(buf, absStrOffset, strLength);
			priority = 1;
		} else if (platformId === 1 && encodingId === 0) {
			// MAC ROMAN (PLATFORM 1) ASCII
			strVal = buf.toString('latin1', absStrOffset, absStrOffset + strLength).replace(/\0/g, '').trim();
			priority = 0;
		}

		if (!strVal) continue;

		if (nameId === NAME_ID_FAMILY && priority > bestFamilyPriority) {
			familyName = strVal;
			bestFamilyPriority = priority;
		} else if (nameId === NAME_ID_SUBFAMILY && priority > bestSubfamilyPriority) {
			subfamilyName = strVal;
			bestSubfamilyPriority = priority;
		} else if (nameId === NAME_ID_TYPOGRAPHIC_FAMILY && priority > bestTypoFamilyPriority) {
			typographicFamily = strVal;
			bestTypoFamilyPriority = priority;
		} else if (nameId === NAME_ID_TYPOGRAPHIC_SUBFAMILY && priority > bestTypoSubfamilyPriority) {
			typographicSubfamily = strVal;
			bestTypoSubfamilyPriority = priority;
		} else if (nameId === NAME_ID_POSTSCRIPT && priority > bestPostScriptPriority) {
			postScriptName = strVal;
			bestPostScriptPriority = priority;
		}
	}

	const resolvedFamily = typographicFamily || familyName;
	const resolvedSubfamily = typographicSubfamily || subfamilyName;

	if (!resolvedFamily) {
		throw new Error('COULD NOT EXTRACT VALID FONT FAMILY NAME');
	}

	// DETECT WEIGHT CLASS FROM OS/2 TABLE, SUBFAMILY NAME, OR POSTSCRIPT NAME
	let weightClass: number | undefined;
	let isBold =
		/bold|black|heavy|w[789]/i.test(resolvedSubfamily) ||
		/bold|black|heavy|w[789]/i.test(subfamilyName) ||
		/bold|black|heavy/i.test(postScriptName);

	if (os2TableOffset > 0 && os2TableLength >= 6) {
		weightClass = buf.readUInt16BE(os2TableOffset + 4);
		if (weightClass >= 600) {
			isBold = true;
		}
		if (os2TableLength >= 64) {
			const fsSelection = buf.readUInt16BE(os2TableOffset + 62);
			if ((fsSelection & 0x0020) !== 0) {
				isBold = true;
			}
		}
	}

	let weightNumeric = 400;
	if (weightClass && weightClass >= 100 && weightClass <= 1000) {
		weightNumeric = weightClass;
	} else if (/black|heavy/i.test(resolvedSubfamily) || /black|heavy/i.test(postScriptName)) {
		weightNumeric = 900;
	} else if (/extrabold|ultra\s*bold/i.test(resolvedSubfamily)) {
		weightNumeric = 800;
	} else if (/bold/i.test(resolvedSubfamily) || /bold/i.test(postScriptName)) {
		weightNumeric = 700;
	} else if (/semibold|demi/i.test(resolvedSubfamily)) {
		weightNumeric = 600;
	} else if (/medium/i.test(resolvedSubfamily)) {
		weightNumeric = 500;
	} else if (/light/i.test(resolvedSubfamily)) {
		weightNumeric = 300;
	} else if (/thin/i.test(resolvedSubfamily)) {
		weightNumeric = 100;
	} else if (isBold) {
		weightNumeric = 700;
	}

	let isItalic = /italic|oblique/i.test(resolvedSubfamily) || /italic|oblique/i.test(postScriptName);
	if (os2TableOffset > 0 && os2TableLength >= 64) {
		const fsSelection = buf.readUInt16BE(os2TableOffset + 62);
		if ((fsSelection & 0x0001) !== 0) {
			isItalic = true;
		}
	}

	const isVariable = fvarTableOffset > 0 && fvarTableLength >= 16;
	const supportedWeights: ('normal' | 'bold')[] = isVariable
		? ['normal', 'bold']
		: isBold
			? ['bold']
			: ['normal'];

	// DETECT CASING RESTRICTIONS (ALL-CAPS OR LOWERCASE ONLY)
	const isAllCapsName =
		/all[\s-_]?caps|allcaps|uppercase/i.test(resolvedFamily) ||
		/all[\s-_]?caps|allcaps|uppercase/i.test(resolvedSubfamily) ||
		/all[\s-_]?caps|allcaps|uppercase/i.test(postScriptName) ||
		/cc\s*wild\s*words/i.test(resolvedFamily);

	const isLowercaseName =
		/lowercase/i.test(resolvedFamily) ||
		/lowercase/i.test(resolvedSubfamily) ||
		/lowercase/i.test(postScriptName);

	const cmapCoverage = checkCmapCasingCoverage(buf, dirOffset);
	const allCapsOnly = isAllCapsName || (cmapCoverage !== null && cmapCoverage.hasUpper && !cmapCoverage.hasLower);
	const lowercaseOnly = isLowercaseName || (cmapCoverage !== null && !cmapCoverage.hasUpper && cmapCoverage.hasLower);
	const supportedCasings: ('uppercase' | 'original' | 'lowercase')[] = allCapsOnly
		? ['uppercase']
		: lowercaseOnly
			? ['lowercase']
			: ['uppercase', 'original', 'lowercase'];

	const weightLabel = deriveWeightLabel(weightNumeric);
	const style: 'normal' | 'italic' = isItalic ? 'italic' : 'normal';

	return {
		familyName: resolvedFamily,
		subfamilyName: resolvedSubfamily || (isBold ? 'Bold' : 'Regular'),
		postScriptName: postScriptName || undefined,
		format,
		supportedWeights,
		allCapsOnly,
		lowercaseOnly,
		supportedCasings,
		weightClass,
		weightNumeric,
		weightLabel,
		style,
		isVariable,
		scripts: scriptsCoveredBy(readCmapCoverage(buf, dirOffset)),
	};
}

export function deriveWeightLabel(numeric: number): string {
	if (numeric <= 150) return 'thin';
	if (numeric <= 250) return 'extralight';
	if (numeric <= 350) return 'light';
	if (numeric <= 450) return 'regular';
	if (numeric <= 550) return 'medium';
	if (numeric <= 650) return 'semibold';
	if (numeric <= 750) return 'bold';
	if (numeric <= 850) return 'extrabold';
	return 'black';
}

/**
 * GROUPS MULTIPLE FONT VARIANT FILES BY RESOLVED TYPOGRAPHIC FAMILY NAME
 */
export function groupFontFilesByFamily(
	files: Array<{ fileName: string; buffer: Buffer }>,
): Map<string, ParsedFontFamilyGroup> {
	const groups = new Map<string, ParsedFontFamilyGroup>();

	for (const file of files) {
		const meta = parseFontBuffer(file.buffer);
		const key = meta.familyName.toLowerCase();

		let group = groups.get(key);
		if (!group) {
			group = {
				familyName: meta.familyName,
				format: meta.format,
				isVariable: meta.isVariable,
				supportedWeights: [...meta.supportedWeights],
				allCapsOnly: meta.allCapsOnly,
				lowercaseOnly: meta.lowercaseOnly,
				supportedCasings: meta.supportedCasings ? [...meta.supportedCasings] : undefined,
				variants: [],
			};
			groups.set(key, group);
		} else {
			if (meta.isVariable) {
				group.isVariable = true;
			}
			if (meta.allCapsOnly) {
				group.allCapsOnly = true;
			}
			if (meta.lowercaseOnly) {
				group.lowercaseOnly = true;
			}
			for (const w of meta.supportedWeights) {
				if (!group.supportedWeights.includes(w)) {
					group.supportedWeights.push(w);
				}
			}
		}

		group.variants.push({
			fileName: file.fileName,
			buffer: file.buffer,
			meta,
		});
	}

	return groups;
}
