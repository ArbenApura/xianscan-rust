// SEMANTIC VERSION COMPARISON UTILITIES
// Handles core semver (major.minor.patch), pre-releases (beta.1, rc.2), and build metadata.

export interface ParsedSemver {
	major: number;
	minor: number;
	patch: number;
	prerelease: Array<string | number>;
	raw: string;
}

/**
 * Parses a semantic version string (e.g. '0.5.0-beta.1', 'v1.2.3', '0.5.0').
 */
export function parseSemver(version: string): ParsedSemver | null {
	if (!version || typeof version !== 'string') return null;

	const clean = version.trim().replace(/^[vV]/, '');
	const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;
	const match = clean.match(semverRegex);

	if (!match) {
		// FALLBACK FOR PARTIAL VERSIONS LIKE '0.5'
		const partialMatch = clean.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
		if (!partialMatch) return null;
		return {
			major: parseInt(partialMatch[1] || '0', 10),
			minor: parseInt(partialMatch[2] || '0', 10),
			patch: parseInt(partialMatch[3] || '0', 10),
			prerelease: [],
			raw: version,
		};
	}

	const major = parseInt(match[1], 10);
	const minor = parseInt(match[2], 10);
	const patch = parseInt(match[3], 10);
	const prereleaseRaw = match[4];

	const prerelease: Array<string | number> = prereleaseRaw
		? prereleaseRaw.split('.').map((part) => {
				const num = parseInt(part, 10);
				return isNaN(num) || num.toString() !== part ? part : num;
		  })
		: [];

	return {
		major,
		minor,
		patch,
		prerelease,
		raw: version,
	};
}

/**
 * Compares two semantic versions.
 * Returns:
 *   1 if a > b (a is newer)
 *  -1 if a < b (b is newer)
 *   0 if a === b
 */
export function compareSemver(a: string, b: string): number {
	const parsedA = parseSemver(a);
	const parsedB = parseSemver(b);

	if (!parsedA && !parsedB) return 0;
	if (!parsedA) return -1;
	if (!parsedB) return 1;

	// COMPARE MAJOR.MINOR.PATCH
	if (parsedA.major !== parsedB.major) {
		return parsedA.major > parsedB.major ? 1 : -1;
	}
	if (parsedA.minor !== parsedB.minor) {
		return parsedA.minor > parsedB.minor ? 1 : -1;
	}
	if (parsedA.patch !== parsedB.patch) {
		return parsedA.patch > parsedB.patch ? 1 : -1;
	}

	// WHEN CORE VERSIONS ARE EQUAL:
	// A VERSION WITHOUT PRERELEASE HAS HIGHER PRECEDENCE THAN ONE WITH PRERELEASE
	// e.g. 1.0.0 > 1.0.0-beta.1
	if (parsedA.prerelease.length === 0 && parsedB.prerelease.length > 0) {
		return 1;
	}
	if (parsedA.prerelease.length > 0 && parsedB.prerelease.length === 0) {
		return -1;
	}
	if (parsedA.prerelease.length === 0 && parsedB.prerelease.length === 0) {
		return 0;
	}

	// COMPARE PRERELEASE IDENTIFIERS STEP BY STEP
	const maxLen = Math.max(parsedA.prerelease.length, parsedB.prerelease.length);
	for (let i = 0; i < maxLen; i++) {
		const partA = parsedA.prerelease[i];
		const partB = parsedB.prerelease[i];

		if (partA === undefined) return -1;
		if (partB === undefined) return 1;

		if (partA === partB) continue;

		const isANum = typeof partA === 'number';
		const isBNum = typeof partB === 'number';

		// NUMERIC IDENTIFIERS HAVE LOWER PRECEDENCE THAN STRING IDENTIFIERS
		if (isANum && !isBNum) return -1;
		if (!isANum && isBNum) return 1;

		if (isANum && isBNum) {
			return (partA as number) > (partB as number) ? 1 : -1;
		}

		return (partA as string).localeCompare(partB as string) > 0 ? 1 : -1;
	}

	return 0;
}

/**
 * Checks if candidate version is strictly newer than current version.
 */
export function isNewerVersion(current: string, candidate: string): boolean {
	return compareSemver(candidate, current) > 0;
}
