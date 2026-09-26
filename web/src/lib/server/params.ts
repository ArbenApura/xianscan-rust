// QUERY PARAMETER PARSING THAT NEVER LETS NaN OR AN OUT-OF-RANGE VALUE REACH A SIZE CALCULATION.

/** INTEGER QUERY PARAM: `fallback` WHEN MISSING OR NOT A PLAIN INTEGER, OTHERWISE CLAMPED TO [min, max]. */
export function intParam(url: URL, name: string, fallback: number, min: number, max: number): number {
	const raw = url.searchParams.get(name);
	if (raw === null || !/^-?\d+$/.test(raw.trim())) return fallback;
	const value = Number(raw.trim());
	if (!Number.isSafeInteger(value)) return value < 0 ? min : max;
	return Math.min(max, Math.max(min, value));
}
