// -- CONSTANTS -- //
const VALID_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp']);

// -- TYPES -- //
export interface DiscoveredChapter {
	folderName: string;
	title: string;
	seqHint: number | null;
	files: File[];
}

export interface FolderDropResult {
	rootFolderName?: string;
	isMultiChapter: boolean;
	totalImages: number;
	chapters: DiscoveredChapter[];
	flatFiles: File[];
}

// -- FUNCTIONS -- //

// NATURAL ALPHANUMERIC COMPARATOR (E.G. page_1.webp BEFORE page_2.webp BEFORE page_10.webp)
export function naturalCompare(a: string, b: string): number {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// CHECK IF A FILE IS A VALID IMAGE BASED ON MIME TYPE OR EXTENSION
export function isImageFile(file: File): boolean {
	if (file.type && file.type.startsWith('image/')) {
		return true;
	}
	const ext = file.name.split('.').pop()?.toLowerCase() || '';
	return VALID_IMAGE_EXTENSIONS.has(ext);
}

// PARSE CHAPTER SEQUENCE HINT FROM FOLDER NAME (E.G. "Ch. 05", "第3话", "01 - Intro")
export function parseChapterSeqHint(name: string): { title: string; seqHint: number | null } {
	const trimmed = name.trim();
	// MATCH CJK CHAPTER NUMBERS (第N章/话/回)
	const cjkMatch = trimmed.match(/第\s*(\d{1,6})\s*[章話话回節节卷]/);
	if (cjkMatch) {
		return { title: trimmed, seqHint: parseInt(cjkMatch[1], 10) };
	}

	// MATCH EN CHAPTER NUMBERS (Chapter 5, Ch. 05, Ch 5)
	const enMatch = trimmed.match(/\b(?:chapter|ch|ep|episode)\.?\s*(\d{1,6})\b/i);
	if (enMatch) {
		return { title: trimmed, seqHint: parseInt(enMatch[1], 10) };
	}

	// MATCH LEADING DIGITS ("01 - Start", "005")
	const leadingMatch = trimmed.match(/^(\d{1,6})(?:[\s\-_.:]|$)/);
	if (leadingMatch) {
		return { title: trimmed, seqHint: parseInt(leadingMatch[1], 10) };
	}

	return { title: trimmed, seqHint: null };
}

// ASYNCHRONOUSLY READ ALL ENTRIES FROM A DIRECTORY READER IN BATCHES
async function readAllDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
	const entries: FileSystemEntry[] = [];
	while (true) {
		const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
			reader.readEntries(resolve, reject);
		});
		if (!batch || batch.length === 0) break;
		entries.push(...batch);
	}
	return entries;
}

// RECURSIVELY SCAN A DIRECTORY ENTRY TO GATHER ALL IMAGE FILES
async function scanDirectoryForImages(
	dirEntry: FileSystemDirectoryEntry,
	prefixPath = ''
): Promise<{ relativePath: string; file: File }[]> {
	const results: { relativePath: string; file: File }[] = [];
	const reader = dirEntry.createReader();
	const entries = await readAllDirectoryEntries(reader);

	for (const entry of entries) {
		if (entry.isFile) {
			const fileEntry = entry as FileSystemFileEntry;
			const file = await new Promise<File>((resolve, reject) => {
				fileEntry.file(resolve, reject);
			});
			if (isImageFile(file)) {
				results.push({
					relativePath: prefixPath ? `${prefixPath}/${entry.name}` : entry.name,
					file,
				});
			}
		} else if (entry.isDirectory) {
			const subDir = entry as FileSystemDirectoryEntry;
			const subResults = await scanDirectoryForImages(
				subDir,
				prefixPath ? `${prefixPath}/${entry.name}` : entry.name
			);
			results.push(...subResults);
		}
	}

	return results;
}

// PROCESS DRAGGED DATA TRANSFER ITEMS WITH RECURSIVE FOLDER SUPPORT
export async function parseDataTransferItems(
	items: DataTransferItemList,
	onProgress?: (scannedCount: number) => void
): Promise<FolderDropResult> {
	const rawEntries: { name: string; isDir: boolean; entry?: FileSystemEntry; file?: File }[] = [];

	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (item.kind !== 'file') continue;

		// ATTEMPT TO GET AS ENTRY (CHROME/FIREFOX/SAFARI/EDGE)
		const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
		if (entry) {
			rawEntries.push({ name: entry.name, isDir: entry.isDirectory, entry });
		} else {
			const file = item.getAsFile();
			if (file && isImageFile(file)) {
				rawEntries.push({ name: file.name, isDir: false, file });
			}
		}
	}

	return processScannedEntries(rawEntries, onProgress);
}

// PROCESS DIRECTORY / FILES SCANNED FROM INPUT ELEMENTS (E.G. WEBKitDIRECTORY)
export async function parseFileList(
	fileList: FileList | File[],
	onProgress?: (scannedCount: number) => void
): Promise<FolderDropResult> {
	const allFiles = Array.from(fileList);
	const files: File[] = [];
	for (let i = 0; i < allFiles.length; i++) {
		if (isImageFile(allFiles[i])) {
			files.push(allFiles[i]);
		}
		if (onProgress && i % 50 === 0) {
			onProgress(files.length);
		}
	}
	if (onProgress) onProgress(files.length);
	// GROUP BY TOP-LEVEL RELATIVE DIRECTORY IF webkitRelativePath EXISTS
	const dirGroups = new Map<string, File[]>();
	const looseFiles: File[] = [];
	let rootFolderName: string | undefined = undefined;

	for (const file of files) {
		const relPath = (file as any).webkitRelativePath as string | undefined;
		if (relPath && relPath.includes('/')) {
			const parts = relPath.split('/').filter(Boolean);
			if (!rootFolderName && parts.length > 0) {
				rootFolderName = parts[0];
			}
			// IF PATH IS "MyManga/Ch01/01.jpg", TOP-LEVEL DIR IS MyManga, SUB IS Ch01
			// IF PATH IS "Ch01/01.jpg", TOP-LEVEL DIR IS Ch01
			const chapterDir = parts.length >= 3 ? parts[1] : parts[0];
			if (!dirGroups.has(chapterDir)) {
				dirGroups.set(chapterDir, []);
			}
			dirGroups.get(chapterDir)!.push(file);
		} else {
			looseFiles.push(file);
		}
	}

	if (dirGroups.size > 1) {
		const chapters: DiscoveredChapter[] = [];
		let totalImages = 0;

		for (const [folderName, grpFiles] of dirGroups.entries()) {
			grpFiles.sort((a, b) => naturalCompare(a.name, b.name));
			const { title, seqHint } = parseChapterSeqHint(folderName);
			chapters.push({
				folderName,
				title,
				seqHint,
				files: grpFiles,
			});
			totalImages += grpFiles.length;
		}

		// SORT CHAPTERS BY SEQUENCE HINT OR FOLDER NAME
		chapters.sort((a, b) => {
			if (a.seqHint !== null && b.seqHint !== null) {
				return a.seqHint - b.seqHint;
			}
			return naturalCompare(a.folderName, b.folderName);
		});

		return {
			rootFolderName,
			isMultiChapter: true,
			totalImages,
			chapters,
			flatFiles: chapters.flatMap((c) => c.files),
		};
	}

	looseFiles.sort((a, b) => naturalCompare(a.name, b.name));
	return {
		rootFolderName,
		isMultiChapter: false,
		totalImages: files.length,
		chapters: [],
		flatFiles: files.sort((a, b) => naturalCompare(a.name, b.name)),
	};
}

// PROCESS RAW SCANNED FILE SYSTEM ENTRIES
async function processScannedEntries(
	rawEntries: { name: string; isDir: boolean; entry?: FileSystemEntry; file?: File }[],
	onProgress?: (scannedCount: number) => void
): Promise<FolderDropResult> {
	// IF DROPPED SINGLE TOP-LEVEL DIRECTORY, INSPECT ITS SUB-ENTRIES FOR MULTI-CHAPTER STRUCTURE
	if (rawEntries.length === 1 && rawEntries[0].isDir && rawEntries[0].entry) {
		const rootFolderName = rawEntries[0].name;
		const topDir = rawEntries[0].entry as FileSystemDirectoryEntry;
		const reader = topDir.createReader();
		const topChildren = await readAllDirectoryEntries(reader);

		const subDirs = topChildren.filter((e) => e.isDirectory) as FileSystemDirectoryEntry[];
		const looseInTop = topChildren.filter((e) => e.isFile) as FileSystemFileEntry[];

		// IF THERE ARE 2 OR MORE SUBDIRECTORIES (OR 1 SUBDIR AND NO DIRECT LOOSE IMAGES)
		if (subDirs.length >= 2 || (subDirs.length === 1 && looseInTop.length === 0)) {
			const chapters: DiscoveredChapter[] = [];
			let totalImages = 0;

			for (const subDir of subDirs) {
				const images = await scanDirectoryForImages(subDir);
				if (images.length > 0) {
					const files = images.map((i) => i.file).sort((a, b) => naturalCompare(a.name, b.name));
					const { title, seqHint } = parseChapterSeqHint(subDir.name);
					chapters.push({
						folderName: subDir.name,
						title,
						seqHint,
						files,
					});
					totalImages += files.length;
				}
			}

			if (chapters.length >= 2) {
				chapters.sort((a, b) => {
					if (a.seqHint !== null && b.seqHint !== null) {
						return a.seqHint - b.seqHint;
					}
					return naturalCompare(a.folderName, b.folderName);
				});

				return {
					rootFolderName,
					isMultiChapter: true,
					totalImages,
					chapters,
					flatFiles: chapters.flatMap((c) => c.files),
				};
			}
		}

		// OTHERWISE, TREAT ENTIRE TOP-LEVEL DIRECTORY AS A SINGLE CHAPTER FLAT DROP
		const allImages = await scanDirectoryForImages(topDir);
		const files = allImages.map((i) => i.file).sort((a, b) => naturalCompare(a.name, b.name));
		return {
			rootFolderName,
			isMultiChapter: false,
			totalImages: files.length,
			chapters: [],
			flatFiles: files,
		};
	}

	// IF MULTIPLE DIRECTORIES WERE DROPPED DIRECTLY
	const dirEntries = rawEntries.filter((e) => e.isDir && e.entry);
	if (dirEntries.length >= 2) {
		const chapters: DiscoveredChapter[] = [];
		let totalImages = 0;

		for (const d of dirEntries) {
			const dir = d.entry as FileSystemDirectoryEntry;
			const images = await scanDirectoryForImages(dir);
			if (images.length > 0) {
				const files = images.map((i) => i.file).sort((a, b) => naturalCompare(a.name, b.name));
				const { title, seqHint } = parseChapterSeqHint(dir.name);
				chapters.push({
					folderName: dir.name,
					title,
					seqHint,
					files,
				});
				totalImages += files.length;
			}
		}

		if (chapters.length >= 2) {
			chapters.sort((a, b) => {
				if (a.seqHint !== null && b.seqHint !== null) {
					return a.seqHint - b.seqHint;
				}
				return naturalCompare(a.folderName, b.folderName);
			});

			return {
				isMultiChapter: true,
				totalImages,
				chapters,
				flatFiles: chapters.flatMap((c) => c.files),
			};
		}
	}

	// FLAT LIST OF LOOSE FILES AND/OR SINGLE DIRECTORY
	const flatFiles: File[] = [];
	for (const e of rawEntries) {
		if (e.file) {
			flatFiles.push(e.file);
		} else if (e.entry && e.isDir) {
			const dir = e.entry as FileSystemDirectoryEntry;
			const images = await scanDirectoryForImages(dir);
			flatFiles.push(...images.map((i) => i.file));
		}
	}

	flatFiles.sort((a, b) => naturalCompare(a.name, b.name));
	return {
		isMultiChapter: false,
		totalImages: flatFiles.length,
		chapters: [],
		flatFiles,
	};
}
