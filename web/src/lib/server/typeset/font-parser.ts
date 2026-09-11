// TRUETYPE & OPENTYPE FONT BINARY PARSER WITHOUT EXTERNAL DEPENDENCIES

// -- TYPES -- //

export interface ParsedFontMeta {
	familyName: string;
	subfamilyName: string;
	postScriptName?: string;
	format: 'truetype' | 'opentype';
	supportedWeights: ('normal' | 'bold')[];
	weightClass?: number;
	weightNumeric: number;
	weightLabel: string;
	style: 'normal' | 'italic';
	isVariable: boolean;
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
	variants: ParsedFontVariantItem[];
}

// -- CONSTANTS -- //

const TTF_MAGIC = 0x00010000;
const TRUE_MAGIC = 0x74727565; // ASCII 'TRUE' IDENTIFIER
const OTTO_MAGIC = 0x4f54544f; // ASCII 'OTTO' IDENTIFIER

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

/**
 * PARSES FONT FILE HEADER AND EXTRACTS METADATA (FAMILY NAME, WEIGHTS, FORMAT)
 */
export function parseFontBuffer(buf: Buffer): ParsedFontMeta {
	if (buf.length < 12) {
		throw new Error('INVALID FONT BUFFER: FILE TOO SMALL');
	}

	const sfntVersion = buf.readUInt32BE(0);
	let format: 'truetype' | 'opentype';

	if (sfntVersion === TTF_MAGIC || sfntVersion === TRUE_MAGIC) {
		format = 'truetype';
	} else if (sfntVersion === OTTO_MAGIC) {
		format = 'opentype';
	} else {
		throw new Error(`UNSUPPORTED FONT FORMAT SIGNATURE: 0x${sfntVersion.toString(16)}`);
	}

	const numTables = buf.readUInt16BE(4);
	if (buf.length < 12 + numTables * 16) {
		throw new Error('CORRUPTED FONT HEADER: TABLE DIRECTORY TRUNCATED');
	}

	let nameTableOffset = 0;
	let nameTableLength = 0;
	let os2TableOffset = 0;
	let os2TableLength = 0;
	let fvarTableOffset = 0;
	let fvarTableLength = 0;

	for (let i = 0; i < numTables; i++) {
		const entryOffset = 12 + i * 16;
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

		// WINDOWS (PLATFORM 3) UTF-16BE
		if (platformId === 3) {
			strVal = decodeUtf16Be(buf, absStrOffset, strLength);
			priority = encodingId === 1 ? 2 : 1;
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

	const weightLabel = deriveWeightLabel(weightNumeric);
	const style: 'normal' | 'italic' = isItalic ? 'italic' : 'normal';

	return {
		familyName: resolvedFamily,
		subfamilyName: resolvedSubfamily || (isBold ? 'Bold' : 'Regular'),
		postScriptName: postScriptName || undefined,
		format,
		supportedWeights,
		weightClass,
		weightNumeric,
		weightLabel,
		style,
		isVariable,
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
				variants: [],
			};
			groups.set(key, group);
		} else {
			if (meta.isVariable) {
				group.isVariable = true;
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
