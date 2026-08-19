// SHARED INTERFACES & SCHEMAS FOR XIANSCAN EXTENSION

export interface ScannedImage {
	url: string;
	width: number;
	height: number;
	top: number;
	left: number;
	alt?: string;
	selected?: boolean;
}

export interface ChapterMetadata {
	seriesTitle?: string;
	chapterTitle?: string;
	chapterNumber?: number;
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

export interface ImportJobPayload {
	bookId: string | number;
	chapterId: number;
	imageUrls: string[];
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
