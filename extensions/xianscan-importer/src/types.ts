// -- SHARED TYPES & SCHEMAS FOR XIANSCAN EXTENSION -- //

export interface ScannedImage {
	url: string;
	canonicalUrl?: string;
	dhash?: string;
	width: number;
	height: number;
	top: number;
	left: number;
	alt?: string;
	selected?: boolean;
}

export interface ChapterMetadata {
	bookTitle?: string;
	seriesTitle?: string;
	chapterTitle?: string;
	chapterNumber?: number;
	hasExplicitChapter?: boolean;
	sourceLang?: string;
	pageCount?: number;
}

export interface ScanPageResponse {
	images: ScannedImage[];
	metadata: ChapterMetadata;
}

export interface BookSummary {
	id: string | number;
	title: string;
	titleTarget?: string | null;
	sourceLang: string;
	targetLang: string;
	pinned?: boolean;
	chapterCount?: number;
}

export interface ChapterSummary {
	id: number;
	bookId?: string | number;
	title: string;
	titleTarget?: string | null;
	chapterNumber: number;
	pageCount?: number;
}

export interface ChapterReaderPage {
	id: number;
	seq: number;
	filePath: string;
	cleanedPath: string | null;
	outputPath: string | null;
	cleanedRev: number;
	outputRev: number;
	originalRev: number;
	status: 'pending' | 'processing' | 'done' | 'error';
	error: string | null;
	width?: number | null;
	height?: number | null;
}

export interface ChapterReaderResult {
	chapter: {
		id: number;
		bookId: string | number;
		bookTitle?: string;
		seq: number;
		title: string | null;
		titleTarget?: string | null;
		sourceLang: string;
		targetLang: string;
		status?: 'pending' | 'processing' | 'done' | 'error';
		translatedAt?: number | null;
	};
	pages: ChapterReaderPage[];
	isTranslating?: boolean;
	jobStatus?: string;
}

export interface ImportJobPayload {
	bookId: string | number;
	chapterId: number;
	imageUrls: string[];
	excludedImageUrls?: string[];
	includedImageUrls?: string[];
	autoReslice?: boolean;
	autoTranslate?: boolean;
}

export interface ImportProgressEvent {
	type: 'progress' | 'complete' | 'error';
	current: number;
	total: number;
	currentUrl?: string;
	error?: string;
	chapterId?: number;
	bookId?: string | number;
}

export interface ChapterMappingEntry {
	url: string;
	bookId: string | number;
	bookTitle?: string;
	chapterId: number;
	chapterTitle?: string;
	isResliced: boolean;
	pageCount: number;
	excludedImageUrls?: string[];
	includedImageUrls?: string[];
	enabled: boolean;
	lastSyncedAt: number;
}

export interface ExtensionSettings {
	serverUrl: string;
	autoReslice: boolean;
	autoTranslate: boolean;
	inPlaceReplacement: boolean;
	liveSwapOnTranslate: boolean;
}

export interface PageTranslatedMessage {
	type: 'PAGE_TRANSLATED';
	chapterId: number;
	pageSeq: number;
	pageId: number;
	outputRev: number;
	outputPath: string;
	total: number;
}

export interface ChapterSyncMessage {
	type: 'CHAPTER_SYNC_UPDATE';
	chapterId: number;
	status: 'pending' | 'processing' | 'done' | 'error';
	pages: Array<{
		id: number;
		seq: number;
		outputRev: number;
		hasOutput: boolean;
	}>;
}

export interface HudState {
	mode: 'translated' | 'raw';
	status: 'idle' | 'translating' | 'ready' | 'error';
	completedPages: number;
	totalPages: number;
	chapterTitle?: string;
}

export interface FetchImageDataResponse {
	ok: boolean;
	dataUrl?: string;
	arrayBuffer?: number[];
	mimeType?: string;
	error?: string;
}

export interface KeepAliveMessage {
	type: 'KEEPALIVE_PING' | 'KEEPALIVE_PONG';
	chapterId?: number;
	timestamp: number;
}
