// CURATED UI FONTS (SELF-HOSTED VIA @fontsource, IMPORTED IN fonts.css)

// -- TYPES -- //

export interface FontOption {
	key: string;
	label: string;
	stack: string;
}

// -- CONSTANTS -- //

export const LATIN_FONTS: FontOption[] = [
	{ key: 'wildwords', label: 'Wild Words', stack: "'CC Wild Words', 'WildWorld', sans-serif" },
	{ key: 'lora', label: 'Lora', stack: "'Lora', Georgia, serif" },
	{ key: 'inter', label: 'Inter (sans)', stack: "'Inter', system-ui, sans-serif" },
];

// -- FUNCTIONS -- //

export function latinStack(key: string): string {
	return (LATIN_FONTS.find((f) => f.key === key) ?? LATIN_FONTS[0]).stack;
}
