// SUGGESTED ACCENT FONTS (FEAT-010 ADR-011): OPEN-LICENCE DISPLAY FONTS PER SCRIPT, SHOWN IN THE FONT LIBRARY WITH A
// LINK. XIANSCAN SHIPS NONE OF THEM; THE USER DOWNLOADS ONE AND IMPORTS IT. EVERY ENTRY'S LICENCE WAS CONFIRMED FROM
// ITS google/fonts METADATA.pb (license: "OFL") ON 2026-09-26; SEE docs/features/accent-font/REFERENCES.md.
// IMPORTED TYPES
import type { Script } from '$lib/languages';

// -- TYPES -- //

export interface SuggestedAccentFont {
	family: string;
	/** THE SCRIPT ROW IT IS SUGGESTED FOR IN THE FONTS TABLE. */
	script: Script;
	license: string;
	url: string;
	note: string;
}

// -- CONSTANTS -- //

const OFL = 'SIL Open Font License 1.1';

export const SUGGESTED_ACCENT_FONTS: readonly SuggestedAccentFont[] = [
	{ family: 'Bangers', script: 'latin', license: OFL, url: 'https://fonts.google.com/specimen/Bangers', note: 'Comic shout lettering; also has accented letters (French, Spanish, German, Polish)' },
	{ family: 'Zhi Mang Xing', script: 'han', license: OFL, url: 'https://fonts.google.com/specimen/Zhi+Mang+Xing', note: 'Brush calligraphy, Simplified Chinese' },
	{ family: 'Ma Shan Zheng', script: 'han', license: OFL, url: 'https://fonts.google.com/specimen/Ma+Shan+Zheng', note: 'Brush calligraphy, Simplified Chinese' },
	{ family: 'Yuji Boku', script: 'kana', license: OFL, url: 'https://fonts.google.com/specimen/Yuji+Boku', note: 'Brush lettering, Japanese' },
	{ family: 'Dela Gothic One', script: 'kana', license: OFL, url: 'https://fonts.google.com/specimen/Dela+Gothic+One', note: 'Heavy display gothic, Japanese' },
	{ family: 'Black Han Sans', script: 'hangul', license: OFL, url: 'https://fonts.google.com/specimen/Black+Han+Sans', note: 'Heavy display, Korean' },
	{ family: 'Nanum Brush Script', script: 'hangul', license: OFL, url: 'https://fonts.google.com/specimen/Nanum+Brush+Script', note: 'Brush lettering, Korean' },
	{ family: 'Rozha One', script: 'devanagari', license: OFL, url: 'https://fonts.google.com/specimen/Rozha+One', note: 'High-contrast display, Hindi' },
	{ family: 'Kalam', script: 'devanagari', license: OFL, url: 'https://fonts.google.com/specimen/Kalam', note: 'Handwritten, Hindi' },
	{ family: 'Kanit', script: 'thai', license: OFL, url: 'https://fonts.google.com/specimen/Kanit', note: 'Use a heavy weight for callouts, Thai' },
	{ family: 'Lalezar', script: 'arabic', license: OFL, url: 'https://fonts.google.com/specimen/Lalezar', note: 'Bold display, Arabic' },
	{ family: 'Reem Kufi', script: 'arabic', license: OFL, url: 'https://fonts.google.com/specimen/Reem+Kufi', note: 'Geometric Kufi, Arabic' },
	{ family: 'Aref Ruqaa', script: 'arabic', license: OFL, url: 'https://fonts.google.com/specimen/Aref+Ruqaa', note: 'Ruqaa calligraphy, Arabic' },
	{ family: 'Russo One', script: 'cyrillic', license: OFL, url: 'https://fonts.google.com/specimen/Russo+One', note: 'Bold display, Russian' },
];
