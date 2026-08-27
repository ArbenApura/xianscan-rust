// -- TYPES -- //

export type Gender = 'neuter' | 'masculine' | 'feminine';
export type GlossaryScope = 'global' | 'book';

// THE KIND OF ENTITY A GLOSSARY TERM NAMES — STRUCTURES THE EDITOR (GROUP / FILTER / COLOUR) AND HELPS
// EXTRACTION STAY CONSISTENT. NOT FED TO THE TRANSLATION PROMPT (THE target RENDERING ALREADY ENCODES IT).
export type TermCategory =
	| 'character'
	| 'location'
	| 'organization'
	| 'technique'
	| 'item'
	| 'realm'
	| 'creature'
	| 'title'
	| 'concept'
	| 'other';
export const TERM_CATEGORIES: TermCategory[] = [
	'character',
	'location',
	'organization',
	'technique',
	'item',
	'realm',
	'creature',
	'title',
	'concept',
	'other',
];

// WHO CREATED / LAST CONFIRMED A TERM — 'ai' = AUTO-EXTRACTED (UNREVIEWED), 'user' = HUMAN-ADDED OR EDITED.
// A 'user' TERM IS AUTHORITATIVE AND NEVER DOWNGRADED BY EXTRACTION.
export type TermStatus = 'ai' | 'user';

/** A SOURCE/TARGET LANGUAGE PAIR (BCP-47-ISH CODES FROM $lib/languages) */
export interface LangPair {
	sourceLang: string;
	targetLang: string;
}

/** A GLOSSARY TERM AS EXTRACTED OR EDITED (BEFORE PERSISTENCE) */
export interface TermDraft {
	source: string;
	target: string;
	gender: Gender;
	// WHEN THE TERM WAS FIRST SAVED (MS EPOCH) — POPULATED WHEN READING FROM THE DB SO THE UI CAN FLAG
	// RECENTLY-DISCOVERED TERMS. UNSET ON FRESHLY-EXTRACTED DRAFTS THAT AREN'T PERSISTED YET.
	createdAt?: number;
	// A SHORT TRANSLATOR-FACING NOTE (WHO/WHAT THE TERM IS) — DISAMBIGUATES THE TERM DURING TRANSLATION
	context?: string | null;
	tags?: string | null;
	// WHAT KIND OF ENTITY THIS NAMES (character / location / technique / …). null = UNCATEGORISED.
	category?: TermCategory | null;
	// HIGH-PRIORITY: LISTED FIRST AND EMPHASISED IN THE TRANSLATION PROMPT, NEVER TRUNCATED.
	pinned?: boolean;
	// 'ai' (AUTO-EXTRACTED) vs 'user' (HUMAN-CONFIRMED). UNSET ON A FRESH DRAFT.
	status?: TermStatus;
	// ALTERNATE SOURCE-LANGUAGE FORMS OF THE SAME ENTITY (EPITHETS / SHORT FORMS) — ALL RENDER TO `target`
	// AND ALL MATCH IN A CHAPTER. EMPTY / null = NONE.
	aliases?: string[] | null;
	// THE chapters.id WHERE THIS TERM WAS FIRST EXTRACTED — ITS FIRST APPEARANCE. null FOR GLOBAL TERMS.
	firstChapterId?: number | null;
}

/** ONE PERSISTED GLOSSARY ROW AS THE EDITOR CONSUMES IT — aliases PARSED TO AN ARRAY, firstSeq RESOLVED */
export interface GlossaryRow {
	id: number;
	source: string;
	target: string;
	gender: Gender;
	context: string | null;
	tags: string | null;
	category: TermCategory | null;
	pinned: boolean;
	status: TermStatus;
	aliases: string[];
	firstChapterId: number | null;
	// THE seq OF THE first-appearance CHAPTER (RESOLVED VIA JOIN) — null FOR GLOBAL TERMS OR A DELETED CHAPTER.
	firstSeq: number | null;
	// THE first-appearance CHAPTER'S TITLE(S).
	firstChapterTitle: string | null;
	firstChapterTitleTarget: string | null;
	createdAt: number;
}

/** TOKEN USAGE FOR ONE TRANSLATION CALL */
export interface TranslationUsage {
	model: string;
	promptTokens: number;
	cachedTokens: number;
	completionTokens: number;
}

export type JobEventType =
	| 'start'
	| 'phase-change'
	| 'page-added'
	| 'page-cancelled'
	| 'page-step-start'
	| 'page-step-end'
	| 'term-extract-step'
	| 'page-done'
	| 'usage'
	| 'done'
	| 'error'
	| 'paused';

export type PipelineStep =
	| 'queued'
	| 'preprocess'
	| 'analyze'
	| 'persist_regions'
	| 'term_extract'
	| 'match_glossary'
	| 'translate'
	| 'persist_translations'
	| 'clean'
	| 'typeset'
	| 'save_output'
	| 'done'
	| 'error';

export const PIPELINE_STEP_LABELS: Record<PipelineStep, string> = {
	queued: 'Queued',
	preprocess: 'Watermark Clean',
	analyze: 'Detect & OCR',
	persist_regions: 'Save Regions',
	term_extract: 'Glossary AI Extract',
	match_glossary: 'Glossary Match',
	translate: 'AI Translation',
	persist_translations: 'Save Translations',
	clean: 'Inpaint Artwork (LaMa)',
	typeset: 'Typeset & Wrap',
	save_output: 'Save Output',
	done: 'Completed',
	error: 'Failed',
};

export interface StepTiming {
	step: PipelineStep;
	status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
	startedAt?: number;
	completedAt?: number;
	durationMs?: number;
	details?: {
		regionsCount?: number;
		textCount?: number;
		matchedCount?: number;
		skipped?: boolean;
		cacheHit?: boolean;
		model?: string;
		tokens?: number;
		error?: string;
	};
}

export interface PageProgressState {
	pageIndex: number;
	pageId: number;
	seq: number;
	status: 'pending' | 'processing' | 'done' | 'error' | 'skipped';
	currentStep?: PipelineStep;
	currentStepLabel?: string;
	timings: Partial<Record<PipelineStep, StepTiming>>;
	totalDurationMs?: number;
	failedStep?: PipelineStep;
	errorMessage?: string;
	outputPath?: string | null;
	cleanedRev?: number;
	outputRev?: number;
}

export type PipelinePhase = 'phase1_analyze' | 'phase2_extract' | 'phase3_typeset' | 'completed';

export interface ChapterJobSnapshot {
	chapterId: number;
	status: 'running' | 'done' | 'failed' | 'superseded';
	currentPhase: PipelinePhase;
	startedAt: number;
	completedAt?: number;
	totalDurationMs?: number;
	totalPages: number;
	completedPages: number;
	failedPages: number;
	targetPageIds?: number[];
	phase2Stats?: {
		termCount?: number;
		durationMs?: number;
	};
	totalPromptTokens: number;
	totalCompletionTokens: number;
	cacheHitCount: number;
	pages: PageProgressState[];
}

export interface BatchChapterItem {
	id: number;
	bookId?: string;
	bookTitle?: string | null;
	seq: number;
	title: string;
	titleTarget?: string | null;
	pageCount: number;
	pageIds?: number[];
	status: 'queued' | 'reslicing' | 'processing' | 'done' | 'error' | 'skipped' | 'cancelled';
	error?: string | null;
	translatedPages?: number;
	totalPages?: number;
	resliceMessage?: string | null;
}

export interface BatchTranslationState {
	active: boolean;
	status: 'idle' | 'running' | 'paused' | 'completed' | 'cancelled';
	bookId: string | null;
	bookTitle: string | null;
	queue: BatchChapterItem[];
	currentIndex: number;
	currentPhase?: 'reslice' | 'translate';
	force: boolean;
	startedAt: number | null;
	completedAt: number | null;
	totalPromptTokens: number;
	totalCompletionTokens: number;
}

export type RegionKind = 'dialogue_bubble' | 'free_text' | 'sound_effect';

export interface PageRegion {
	id: string;
	seq: number;
	box: { x: number; y: number; w: number; h: number };
	polygon: [number, number][];
	bubble_box?: { x: number; y: number; w: number; h: number } | null;
	bubble_polygon?: [number, number][] | null;
	centroid?: { x: number; y: number } | null;
	kind?: RegionKind;
	textSource: string;
	textTarget?: string | null;
	originalTarget?: string | null;
	conf?: number | null;
	angle?: number | null;
	vertical?: boolean;
}export interface Chapter {
	id: number;
	bookId?: string;
	seq: number;
	title: string;
	titleTarget?: string | null;
	status: 'pending' | 'processing' | 'done' | 'error';
	coverPageId?: number | null;
	coverHasOutput?: boolean;
	pageCount: number;
	translatedPageCount?: number;
	createdAt?: number;
	updatedAt?: number;
	translatedAt?: number | null;
}
