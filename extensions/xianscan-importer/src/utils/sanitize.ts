// WINDOWS & CROSS-PLATFORM PATH & FILENAME SANITIZER

const WINDOWS_RESERVED_NAMES = new Set([
	'con', 'prn', 'aux', 'nul',
	'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
	'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
]);

export function sanitizeFileName(raw: string, maxLength = 120): string {
	if (!raw) return 'untitled';

	// 1. REMOVE ILLEGAL CHARACTERS: \ / : * ? " < > | AND CONTROL CHARACTERS (0-31)
	let clean = raw
		// eslint-disable-next-line no-control-regex
		.replace(/[\x00-\x1f\\/:*?"<>|]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	// 2. STRIP TRAILING DOTS AND SPACES (ILLEGAL IN WINDOWS)
	clean = clean.replace(/[. ]+$/, '');

	if (!clean) return 'untitled';

	// 3. SEPARATE BASE NAME AND EXTENSION (LAST DOT)
	const lastDotIndex = clean.lastIndexOf('.');
	let baseName = clean;
	let ext = '';

	if (lastDotIndex > 0) {
		baseName = clean.substring(0, lastDotIndex);
		ext = clean.substring(lastDotIndex);
	} else if (lastDotIndex === 0) {
		// HIDDEN / LEADING DOT FILE LIKE .png OR .gitignore
		baseName = 'untitled';
		ext = clean;
	}

	// 4. CHECK FOR WINDOWS RESERVED DEVICE NAMES (E.G. CON, AUX, COM1, COM1.PAGE.PNG)
	const firstDotIndex = clean.indexOf('.');
	const rootName = (firstDotIndex === -1 ? clean : clean.substring(0, firstDotIndex)).toLowerCase();
	if (WINDOWS_RESERVED_NAMES.has(rootName)) {
		if (firstDotIndex === -1) {
			baseName = `${baseName}_file`;
		} else {
			const rest = clean.substring(firstDotIndex);
			baseName = `${clean.substring(0, firstDotIndex)}_file${rest.substring(0, rest.lastIndexOf('.'))}`;
		}
	}

	let result = `${baseName}${ext}`;

	// 5. ENFORCE MAX LENGTH WHILE PRESERVING EXTENSION IF POSSIBLE
	if (result.length > maxLength) {
		if (ext.length < maxLength) {
			baseName = baseName.substring(0, maxLength - ext.length).trim();
			result = `${baseName}${ext}`;
		} else {
			result = result.substring(0, maxLength).trim();
		}
	}

	return result || 'untitled';
}

export function sanitizeDirectoryName(raw: string, maxLength = 120): string {
	return sanitizeFileName(raw, maxLength);
}
