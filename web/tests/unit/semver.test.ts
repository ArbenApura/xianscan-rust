import { describe, it, expect } from 'vitest';
import { parseSemver, compareSemver, isNewerVersion } from '$lib/utils/semver';

describe('semver parsing and comparison', () => {
	it('parses standard semver versions', () => {
		const parsed = parseSemver('0.5.0');
		expect(parsed).toEqual({
			major: 0,
			minor: 5,
			patch: 0,
			prerelease: [],
			raw: '0.5.0',
		});
	});

	it('parses versions with v prefix', () => {
		const parsed = parseSemver('v1.2.3');
		expect(parsed).toEqual({
			major: 1,
			minor: 2,
			patch: 3,
			prerelease: [],
			raw: 'v1.2.3',
		});
	});

	it('parses versions with pre-release tags', () => {
		const parsed = parseSemver('0.5.0-beta.1');
		expect(parsed).toEqual({
			major: 0,
			minor: 5,
			patch: 0,
			prerelease: ['beta', 1],
			raw: '0.5.0-beta.1',
		});
	});

	it('correctly compares version increments', () => {
		expect(compareSemver('0.5.0', '0.5.1')).toBe(-1);
		expect(compareSemver('0.5.1', '0.5.0')).toBe(1);
		expect(compareSemver('0.5.0', '0.5.0')).toBe(0);
		expect(compareSemver('1.0.0', '0.9.9')).toBe(1);
	});

	it('correctly compares pre-releases with release versions', () => {
		// 0.5.0 IS NEWER THAN 0.5.0-beta.1
		expect(compareSemver('0.5.0', '0.5.0-beta.1')).toBe(1);
		expect(compareSemver('0.5.0-beta.1', '0.5.0')).toBe(-1);

		// 0.5.0-beta.2 IS NEWER THAN 0.5.0-beta.1
		expect(compareSemver('0.5.0-beta.2', '0.5.0-beta.1')).toBe(1);
		expect(compareSemver('0.5.0-beta.1', '0.5.0-beta.2')).toBe(-1);
	});

	it('evaluates isNewerVersion helper accurately', () => {
		expect(isNewerVersion('0.5.0-beta.1', '0.5.0-beta.2')).toBe(true);
		expect(isNewerVersion('0.5.0-beta.1', '0.5.0')).toBe(true);
		expect(isNewerVersion('0.5.0', '0.5.0-beta.1')).toBe(false);
		expect(isNewerVersion('0.5.0', '0.5.0')).toBe(false);
		expect(isNewerVersion('0.5.0', 'v0.5.1')).toBe(true);
	});
});
