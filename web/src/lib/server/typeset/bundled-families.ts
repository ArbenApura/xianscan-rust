// FONTS THAT SHIP WITH XIANSCAN (web/static/fonts). THEY ARE REGISTERED IN THE CANVAS ENGINE LIKE OS FONTS,
// SO THIS LIST KEEPS THEM OUT OF THE "SYSTEM FONTS" BROWSER AND LETS THE SYSTEM FONT FILE ROUTE SERVE THEM.
// KEPT FREE OF IMPORTS SO settings-service CAN USE IT WITHOUT AN IMPORT CYCLE.

// -- CONSTANTS -- //

/** FILE PER BUNDLED FAMILY NAME (ALIASES SHARE A FILE). */
export const BUNDLED_FONT_FILES: [string, string[]][] = [
	['CCWildWords-Roman.ttf', ['CC Wild Words']],
	['FriendlySans-Regular.ttf', ['Friendly Sans']],
	['GeneralSans-Regular.ttf', ['General Sans', 'General Sans Bold']],
	['Poppins-Bold.ttf', ['Poppins', 'Poppins Bold']],
	['Montserrat-Bold.ttf', ['Montserrat', 'Montserrat Bold']],
	['Lexend-Bold.ttf', ['Lexend', 'Lexend Bold']],
	['wqy-microhei.ttc', ['WenQuanYi Micro Hei', 'WenQuanYi Micro Hei Bold']],
	['NotoSansDevanagari-Regular.ttf', ['Noto Sans Devanagari']],
	['NotoSansThai-Regular.ttf', ['Noto Sans Thai']],
	['Tajawal-Regular.ttf', ['Tajawal']],
	// DEFAULT LATIN ACCENT FONT (FEAT-010, SIL OFL 1.1)
	['SigmarOne-Regular.ttf', ['Sigmar One']],
];

const BUNDLED_FILE_BY_FAMILY = new Map<string, string>(
	BUNDLED_FONT_FILES.flatMap(([file, families]) => families.map((family) => [family.toLowerCase(), file] as [string, string])),
);

// -- FUNCTIONS -- //

export function isBundledFontFamily(family: string): boolean {
	return BUNDLED_FILE_BY_FAMILY.has(family.trim().toLowerCase());
}

/** FILE NAME INSIDE THE BUNDLED FONT DIR, OR null WHEN THE FAMILY DOES NOT SHIP WITH THE APP. */
export function bundledFontFileFor(family: string): string | null {
	return BUNDLED_FILE_BY_FAMILY.get(family.trim().toLowerCase()) ?? null;
}
