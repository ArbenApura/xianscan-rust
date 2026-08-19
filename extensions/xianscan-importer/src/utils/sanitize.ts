// WINDOWS & CROSS-PLATFORM PATH & FILENAME SANITIZER

const WINDOWS_RESERVED_NAMES = new Set([
	'con', 'prn', 'aux', 'nul',
	'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
	'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
]);

export function sanitizeFileName(raw: string, maxLength = 120): string {
	if (!raw) return 'untitled';

	// 1. Remove illegal characters: \ / : * ? " < > | and control characters (0-31)
	let clean = raw
		// eslint-disable-next-line no-control-regex
		.replace(/[\x00-\x1f\\/:*?"<>|]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	// 2. Strip trailing dots and spaces (illegal in Windows)
	clean = clean.replace(/[. ]+$/, '');

	if (!clean) return 'untitled';

	// 3. Check for Windows reserved device names (e.g. CON, AUX, COM1)
	const dotIndex = clean.indexOf('.');
	const baseName = (dotIndex === -1 ? clean : clean.substring(0, dotIndex)).toLowerCase();
	if (WINDOWS_RESERVED_NAMES.has(baseName)) {
		if (dotIndex === -1) {
			clean = `${clean}_file`;
		} else {
			clean = `${clean.substring(0, dotIndex)}_file${clean.substring(dotIndex)}`;
		}
	}

	// 4. Enforce max length
	if (clean.length > maxLength) {
		clean = clean.substring(0, maxLength).trim();
	}

	return clean || 'untitled';
}

export function sanitizeDirectoryName(raw: string, maxLength = 120): string {
	return sanitizeFileName(raw, maxLength);
}
