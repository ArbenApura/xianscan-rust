// PAGE IMAGE FORMATS THE SERVER ACCEPTS ON UPLOAD. SHARED BY SERVER AND CLIENT, SO A FOLDER DROP NEVER PICKS UP
// A FILE THE UPLOAD WOULD REJECT (ONE REJECTED FILE FAILS THE WHOLE ALL-OR-NOTHING BATCH).

// -- CONSTANTS -- //

/** LOWERCASE EXTENSIONS WITHOUT THE DOT. */
export const PAGE_IMAGE_EXTENSIONS: readonly string[] = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'heic', 'heif'];

/** VALUE FOR AN `<input type="file" accept>` ATTRIBUTE. */
export const PAGE_IMAGE_ACCEPT = PAGE_IMAGE_EXTENSIONS.map((ext) => `.${ext}`).join(',');

// -- FUNCTIONS -- //

/** TRUE WHEN THE FILE NAME HAS A SUPPORTED PAGE IMAGE EXTENSION. */
export function hasPageImageExtension(fileName: string): boolean {
	const dot = fileName.lastIndexOf('.');
	return dot !== -1 && PAGE_IMAGE_EXTENSIONS.includes(fileName.slice(dot + 1).toLowerCase());
}
