declare module 'ahocorasick' {
	export default class AhoCorasick {
		constructor(keywords: string[]);
		/** RETURNS [endIndex, matchedKeywords[]] TUPLES */
		search(text: string): [number, string[]][];
	}
}
