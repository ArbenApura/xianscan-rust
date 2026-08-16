// SMART CHAPTER LABELLING
// DERIVE THE REAL CHAPTER NUMBER FROM A TITLE (e.g. 第555章 / "Chapter 555") INSTEAD OF THE ROW
// POSITION, AND RECOGNISE NON-CHAPTER ENTRIES (PROLOGUES, SIDE STORIES, AUTHOR NOTES) SO THE
// LISTING DOESN'T FORCE A STRICT 1..N SEQUENCE. A CHAPTER NUMBER ALWAYS WINS OVER A "NOTE" HINT —
// SO "Chapter 555 … [Requesting Monthly Tickets]" IS CHAPTER 555, NOT A NOTE.

// -- TYPES -- //

export type ChapterLabel = { kind: 'chapter'; number: number } | { kind: 'special'; tag: string } | { kind: 'plain' };

// -- CONSTANTS -- //

const CN_DIGIT: Record<string, number> = {
	〇: 0,
	零: 0,
	一: 1,
	二: 2,
	兩: 2,
	两: 2,
	三: 3,
	四: 4,
	五: 5,
	六: 6,
	七: 7,
	八: 8,
	九: 9,
};

const CN_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 萬: 10000, 万: 10000 };

const ZH_NUM = '〇零一二三四五六七八九十百千萬万兩两';

// CJK CHAPTER MARKER — CHINESE 第N章/回/節/卷 AND JAPANESE 第N話/章. KOREAN USES 제N장/화 (HANDLED BELOW).
const ZH_CHAPTER_RE = new RegExp(`第\\s*(\\d{1,7}|[${ZH_NUM}]{1,12})\\s*[章回節节卷話话]`);

const KO_CHAPTER_RE = /제\s*(\d{1,7})\s*[장화권부편]/;

const EN_CHAPTER_RE = /\bchapter\s+(\d{1,7})\b/i;

// KOREAN / GENERIC LEADING-NUMBER TITLES — MANY KOREAN WEB-NOVEL SITES NUMBER A CHAPTER WITH A BARE LEADING
// NUMBER ("1 - 각성이니라", "1 첫만남", "123화 제목"), NOT A 제N화 MARKER. THE NUMBER MUST BE DELIMITED FROM THE
// REST (AN OPTIONAL KOREAN MARKER THEN A SEPARATOR/SPACE/END) SO A TITLE LIKE "5분 후" ISN'T READ AS CHAPTER 5.
// CONSULTED LAST (AFTER 第N章 / 제N화 / Chapter N), SO IT NEVER OVERRIDES AN EXPLICIT MARKER.
const KO_MARK = '화話장회권부편';
const LEADING_NUM_RE = new RegExp(`^\\s*제?\\s*0*(\\d{1,7})(?:\\s*[${KO_MARK}])?(?=[\\s\\-–—.:、)\\]]|$)`);

// NON-CHAPTER ENTRIES — ONLY CONSULTED WHEN NO CHAPTER NUMBER IS PRESENT (CN · JP · KO · EN)
const SPECIAL: { re: RegExp; tag: string }[] = [
	{ re: /楔子|序章|序言|引子|プロローグ|프롤로그/, tag: 'Prologue' },
	{ re: /\bprologue\b/i, tag: 'Prologue' },
	{ re: /尾聲|尾声|大結局|大结局|終章|终章/, tag: 'Finale' },
	{ re: /\bepilogue\b|エピローグ|에필로그/i, tag: 'Epilogue' },
	{ re: /番外|閑話|外伝|외전/, tag: 'Extra' },
	{ re: /\bside[\s-]?story\b|\bextra\b/i, tag: 'Extra' },
	{
		re: /後記|后记|後話|后话|完本感言|感言|作者的?[話话]|上架|請假|请假|通知|公告|あとがき|작가의?\s*말/,
		tag: 'Note',
	},
	{ re: /author.?s?\s*note|\bafterword\b/i, tag: 'Note' },
];

const STRIP_ZH = new RegExp(`^\\s*第\\s*(?:\\d{1,7}|[${ZH_NUM}]{1,12})\\s*[章回節节卷][\\s:：、.\\-—]*`);

const STRIP_EN = /^\s*chapter\s+\d{1,7}\s*[:：.\-—]*\s*/i;

// STRIP A LEADING-NUMBER PREFIX ("1 - ", "1 ", "123화 ") FOR DISPLAY — THE NUMBER IS SHOWN SEPARATELY. THE
// TRAILING DELIMITER (SEP/SPACE/END) IS REQUIRED SO "5분 후" KEEPS ITS "5" (MIRRORS LEADING_NUM_RE'S GUARD).
const STRIP_LEADING_NUM = new RegExp(`^\\s*제?\\s*0*\\d{1,7}(?:\\s*[${KO_MARK}])?(?:[\\s\\-–—.:、)\\]]+|$)`);

// A LEADING "第N章…" / "Chapter N…" LINE (OPTIONALLY MARKDOWN "# ") IS A REDUNDANT HEADING IN THESE
// NOVELS — THE BODY NEVER REALLY OPENS THAT WAY, SO THIS SIGNAL ALONE IS ENOUGH TO CUT IT.
const HEADING_LIKE = new RegExp(
	`^\\s*#{0,6}\\s*(?:第\\s*(?:\\d{1,7}|[${ZH_NUM}]{1,12})\\s*[章回節节卷]|chapter\\s+\\d)`,
	'i',
);

// -- FUNCTIONS -- //

/** PARSE A CHINESE NUMERAL (e.g. 五百五十五) → 555. RETURNS null IF ANY CHAR ISN'T A NUMERAL. */
function chineseToNumber(s: string): number | null {
	let total = 0;
	let current = 0;
	for (const ch of s) {
		if (ch in CN_DIGIT) {
			current = CN_DIGIT[ch];
		} else if (ch in CN_UNIT) {
			total += (current === 0 ? 1 : current) * CN_UNIT[ch];
			current = 0;
		} else {
			return null;
		}
	}
	return total + current;
}

function numberFrom(title: string | null | undefined): number | null {
	if (!title) return null;
	const zh = ZH_CHAPTER_RE.exec(title);
	if (zh) {
		const raw = zh[1];
		const n = /^\d+$/.test(raw) ? parseInt(raw, 10) : chineseToNumber(raw);
		if (n != null && n >= 0) return n;
	}
	const ko = KO_CHAPTER_RE.exec(title);
	if (ko) return parseInt(ko[1], 10);
	const en = EN_CHAPTER_RE.exec(title);
	if (en) return parseInt(en[1], 10);
	// LAST RESORT — A BARE LEADING NUMBER (KOREAN "1 - 제목" / "1 제목" / "123화 제목").
	const lead = LEADING_NUM_RE.exec(title);
	if (lead) return parseInt(lead[1], 10);
	return null;
}

function specialFrom(title: string | null | undefined): string | null {
	if (!title) return null;
	for (const s of SPECIAL) if (s.re.test(title)) return s.tag;
	return null;
}

/** SMART LABEL: A REAL CHAPTER NUMBER IF ONE IS IN THE TITLE, ELSE A SPECIAL TAG, ELSE plain. */
export function chapterLabel(titleSource: string, titleTarget?: string | null): ChapterLabel {
	const n = numberFrom(titleSource) ?? numberFrom(titleTarget);
	if (n != null) return { kind: 'chapter', number: n };
	const tag = specialFrom(titleSource) ?? specialFrom(titleTarget);
	if (tag) return { kind: 'special', tag };
	return { kind: 'plain' };
}

/**
 * REMOVE A LEADING "第555章" / "Chapter 555:" PREFIX, RETURNING THE *SUBTITLE* THAT FOLLOWS IT (THE NUMBER IS
 * SHOWN SEPARATELY VIA chapterLabel). RETURNS '' WHEN THE TITLE IS ONLY A CHAPTER MARKER ("第一章" / "Chapter 1")
 * WITH NO SUBTITLE — SO A CALLER THAT ALSO RENDERS THE "Chapter N" LABEL DOESN'T REPEAT IT ("Chapter 1: Chapter 1").
 * A CALLER THAT SHOWS THIS AS THE SOLE TITLE (NO SEPARATE NUMBER) SHOULD FALL BACK: `stripChapterPrefix(t) || t`.
 */
export function stripChapterPrefix(title: string): string {
	return title.replace(STRIP_ZH, '').replace(STRIP_EN, '').replace(STRIP_LEADING_NUM, '').trim();
}

function normalizeForCompare(s: string): string {
	// DROP WHITESPACE, BRACKETS, AND PUNCTUATION SO MINOR FORMATTING DIFFERENCES STILL MATCH
	return s.replace(/[\s【】[\]()（）:：、，,.。!！?？\-—~～'"""·#*]/g, '').toLowerCase();
}

/** TRUE WHEN A BODY'S FIRST PARAGRAPH IS REALLY A REPEAT OF THE CHAPTER TITLE / A CHAPTER HEADING. */
function isTitleDuplicate(firstPara: string, title: string): boolean {
	if (HEADING_LIKE.test(firstPara)) return true; // LEADING "第N章…" / "Chapter N…" HEADING LINE
	const nt = normalizeForCompare(title);
	return !!nt && normalizeForCompare(firstPara) === nt; // EXACT TITLE REPEAT WITHOUT A HEADING MARKER
}

/**
 * SCRAPERS OFTEN REPEAT THE CHAPTER TITLE AS THE FIRST PARAGRAPH OF THE BODY. STRIP THAT REDUNDANT
 * LEADING LINE SO THE SOURCE (AND ITS TRANSLATION) START AT THE ACTUAL PROSE. IDEMPOTENT + SAFE:
 * ONLY REMOVES A FIRST PARAGRAPH THAT TRULY MIRRORS THE TITLE.
 */
export function stripLeadingTitle(content: string, title: string | null | undefined): string {
	if (!content) return content;
	const paras = content.split(/\n{2,}/);
	if (paras.length <= 1) return content;
	if (!isTitleDuplicate(paras[0], (title ?? '').trim())) return content;
	return paras.slice(1).join('\n\n').replace(/^\s+/, '');
}
