/**
 * Aho-Corasick multi-pattern string search automaton.
 * Native TypeScript implementation without outdated UMD/window dependencies.
 */

export default class AhoCorasick {
	private gotoFn: Record<number, Record<string, number>> = { 0: {} };
	private output: Record<number, string[]> = { 0: [] };
	private failure: Record<number, number> = {};

	constructor(keywords: string[]) {
		this._buildTables(keywords);
	}

	private _buildTables(keywords: string[]): void {
		let state = 0;
		for (const word of keywords) {
			let curr = 0;
			for (let i = 0; i < word.length; i++) {
				const l = word[i];
				if (this.gotoFn[curr] && l in this.gotoFn[curr]) {
					curr = this.gotoFn[curr][l];
				} else {
					state++;
					this.gotoFn[curr] = this.gotoFn[curr] || {};
					this.gotoFn[curr][l] = state;
					this.gotoFn[state] = {};
					curr = state;
					this.output[state] = [];
				}
			}
			this.output[curr] = this.output[curr] || [];
			this.output[curr].push(word);
		}

		const xs: number[] = [];
		for (const l in this.gotoFn[0]) {
			const st = this.gotoFn[0][l];
			this.failure[st] = 0;
			xs.push(st);
		}

		while (xs.length > 0) {
			const r = xs.shift()!;
			for (const l in this.gotoFn[r]) {
				const s = this.gotoFn[r][l];
				xs.push(s);

				let st = this.failure[r];
				while (st > 0 && !(l in this.gotoFn[st])) {
					st = this.failure[st];
				}

				if (l in this.gotoFn[st]) {
					const fs = this.gotoFn[st][l];
					this.failure[s] = fs;
					this.output[s] = (this.output[s] || []).concat(this.output[fs] || []);
				} else {
					this.failure[s] = 0;
				}
			}
		}
	}

	search(text: string): [number, string[]][] {
		let state = 0;
		const results: [number, string[]][] = [];

		for (let i = 0; i < text.length; i++) {
			const l = text[i];
			while (state > 0 && !(l in this.gotoFn[state])) {
				state = this.failure[state] ?? 0;
			}
			if (!(l in this.gotoFn[state])) {
				continue;
			}

			state = this.gotoFn[state][l];

			if (this.output[state] && this.output[state].length > 0) {
				results.push([i, this.output[state]]);
			}
		}

		return results;
	}
}
