// CHARSET-AWARE DECODING FOR INGESTED CJK/EAST-ASIAN TEXT.
// NOVEL FILES (.txt, EPUB XHTML) ARE FREQUENTLY NOT UTF-8 — TRADITIONAL CHINESE USES Big5, SIMPLIFIED
// USES GB2312/GBK/GB18030, JAPANESE USES Shift_JIS/EUC-JP, KOREAN USES EUC-KR. DECODING THOSE BYTES AS
// UTF-8 YIELDS MOJIBAKE. Node SHIPS FULL-ICU, SO ITS BUILT-IN TextDecoder DECODES THESE NATIVELY — NO
// THIRD-PARTY DEPENDENCY NEEDED. WE DETECT THE ENCODING FROM (IN PRIORITY ORDER):
//   1. A UTF-8 / UTF-16 BYTE-ORDER MARK,
//   2. A DECLARED CHARSET IN THE MARKUP (XML PROLOG `encoding=` OR HTML `<meta charset>`),
//   3. A STRICT UTF-8 VALIDITY CHECK,
//   4. A SCORING HEURISTIC THAT TRIES EACH CANDIDATE LEGACY ENCODING (FROM THE SOURCE LANGUAGE'S HINTS,
//      DEFAULTING TO THE CHINESE PAIR) AND KEEPS WHICHEVER YIELDS THE MOST EAST-ASIAN CHARACTERS WITH
//      THE FEWEST REPLACEMENT CHARS.

// -- CONSTANTS -- //

const SAMPLE_BYTES = 64 * 1024;

// DEFAULT CANDIDATE LEGACY ENCODINGS WHEN THE CALLER PASSES NO LANGUAGE HINTS (PRESERVES THE ORIGINAL
// CHINESE-FIRST BEHAVIOUR FOR PRE-EXISTING zh→en IMPORTS).
const DEFAULT_LEGACY = ['gb18030', 'big5'];

// -- FUNCTIONS -- //

function hasBom(b: Uint8Array, sig: number[]): boolean {
	if (b.length < sig.length) return false;
	for (let i = 0; i < sig.length; i++) if (b[i] !== sig[i]) return false;
	return true;
}

/** STRICT UTF-8 VALIDITY: RETURNS THE DECODED STRING IF THE BYTES ARE VALID UTF-8, ELSE null. */
function tryUtf8(bytes: Uint8Array): string | null {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return null;
	}
}

// SCORE A DECODING: REWARD EAST-ASIAN CODEPOINTS (CJK IDEOGRAPHS, KANA, HANGUL), HEAVILY PENALISE
// U+FFFD REPLACEMENT CHARS (THE SIGNATURE OF DECODING WITH THE WRONG LEGACY CHARSET).
function score(text: string): number {
	let good = 0;
	let bad = 0;
	for (const ch of text) {
		const c = ch.codePointAt(0)!;
		if (c === 0xfffd) bad++;
		else if (
			(c >= 0x4e00 && c <= 0x9fff) || // CJK UNIFIED
			(c >= 0x3400 && c <= 0x4dbf) || // CJK EXT-A
			(c >= 0xf900 && c <= 0xfaff) || // CJK COMPATIBILITY
			(c >= 0x3040 && c <= 0x30ff) || // HIRAGANA + KATAKANA
			(c >= 0xac00 && c <= 0xd7a3) // HANGUL SYLLABLES
		)
			good++;
	}
	return good - bad * 8;
}

function normalizeLabel(label: string): string {
	const e = label.trim().toLowerCase();
	if (e === 'gb2312' || e === 'gbk' || e === 'gb_2312-80' || e === 'csgb2312') return 'gb18030';
	if (e === 'big5-hkscs' || e === 'cn-big5' || e === 'csbig5') return 'big5';
	if (e === 'shift-jis' || e === 'sjis' || e === 'ms_kanji' || e === 'x-sjis') return 'shift_jis';
	if (e === 'euc_jp' || e === 'x-euc-jp') return 'euc-jp';
	if (e === 'euc_kr' || e === 'ks_c_5601-1987' || e === 'csksc56011987' || e === 'korean') return 'euc-kr';
	if (e === 'utf8') return 'utf-8';
	return e;
}

function safeDecode(bytes: Uint8Array, label: string): string | null {
	try {
		return new TextDecoder(label).decode(bytes);
	} catch {
		return null;
	}
}

// LOOK FOR AN EXPLICIT ENCODING DECLARATION IN THE FIRST FEW KB (ASCII-COMPATIBLE PREFIX).
function declaredLabel(bytes: Uint8Array): string | null {
	const head = Buffer.from(bytes.subarray(0, 2048)).toString('latin1');
	const xml = head.match(/<\?xml[^>]*encoding=["']([\w-]+)["']/i)?.[1];
	if (xml) return xml;
	const metaCharset = head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
	if (metaCharset) return metaCharset;
	const httpEquiv = head.match(/<meta[^>]+content=["'][^"']*charset=([\w-]+)/i)?.[1];
	return httpEquiv ?? null;
}

/**
 * DECODE RAW FILE BYTES TO A STRING, AUTO-DETECTING THE CHARSET.
 * @param sniffMarkup WHEN true, HONOUR AN XML/HTML ENCODING DECLARATION IN THE BYTE PREFIX (USE FOR
 *        EPUB XHTML / OPF); LEAVE false FOR PLAIN .txt WHICH HAS NO MARKUP DECLARATION.
 * @param hints CANDIDATE LEGACY ENCODINGS FOR THE SOURCE LANGUAGE (e.g. ['shift_jis','euc-jp'] FOR
 *        JAPANESE). DEFAULTS TO THE CHINESE PAIR SO PRE-EXISTING zh IMPORTS ARE UNCHANGED.
 */
export function decodeTextBytes(bytes: Uint8Array, sniffMarkup = false, hints: string[] = []): string {
	if (bytes.length === 0) return '';
	if (hasBom(bytes, [0xef, 0xbb, 0xbf])) return new TextDecoder('utf-8').decode(bytes.subarray(3));
	if (hasBom(bytes, [0xff, 0xfe])) return new TextDecoder('utf-16le').decode(bytes);
	if (hasBom(bytes, [0xfe, 0xff])) return new TextDecoder('utf-16be').decode(bytes);

	// A DECLARED CHARSET (EPUB/HTML) IS AUTHORITATIVE — TRUST IT IF THE DECODER ACCEPTS THE LABEL.
	if (sniffMarkup) {
		const label = declaredLabel(bytes);
		if (label) {
			const norm = normalizeLabel(label);
			const decoded = safeDecode(bytes, norm);
			if (decoded != null) return decoded;
		}
	}

	const utf8 = tryUtf8(bytes);
	if (utf8 != null) return utf8;

	// LEGACY EAST-ASIAN ENCODING — TRY EACH CANDIDATE (LANGUAGE HINTS, OR THE CHINESE DEFAULT) AND KEEP
	// WHICHEVER SCORES BEST (MOST EAST-ASIAN CHARS, FEWEST REPLACEMENT CHARS).
	const candidates = [...new Set([...hints.map(normalizeLabel), ...DEFAULT_LEGACY])];
	const sample = bytes.length > SAMPLE_BYTES ? bytes.subarray(0, SAMPLE_BYTES) : bytes;
	let best = candidates[0] ?? 'gb18030';
	let bestScore = -Infinity;
	for (const label of candidates) {
		const probe = safeDecode(sample, label);
		if (probe == null) continue;
		const s = score(probe);
		if (s > bestScore) {
			bestScore = s;
			best = label;
		}
	}
	return safeDecode(bytes, best) ?? new TextDecoder('utf-8').decode(bytes);
}
