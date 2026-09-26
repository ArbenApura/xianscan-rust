import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	__resetAccessTokenCacheForTests,
	getAccessToken,
	regenerateAccessToken,
	resolveTokenPath,
	sessionCookieValue,
	verifySessionCookie,
	verifyToken,
} from '$lib/server/access/token';

describe('access token', () => {
	let dir: string;
	const previous = process.env.ACCESS_TOKEN_PATH;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'xianscan-token-'));
		process.env.ACCESS_TOKEN_PATH = join(dir, 'access-token');
		__resetAccessTokenCacheForTests();
	});

	afterEach(() => {
		if (previous === undefined) delete process.env.ACCESS_TOKEN_PATH;
		else process.env.ACCESS_TOKEN_PATH = previous;
		__resetAccessTokenCacheForTests();
		rmSync(dir, { recursive: true, force: true });
	});

	it('generates on first call and persists 43 base64url chars', () => {
		const token = getAccessToken();
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(readFileSync(resolveTokenPath(), 'utf8')).toBe(token);
	});

	it('reuses an existing file', () => {
		const existing = 'A'.repeat(43);
		writeFileSync(resolveTokenPath(), existing);
		expect(getAccessToken()).toBe(existing);
	});

	it('replaces a malformed file', () => {
		writeFileSync(resolveTokenPath(), 'too-short');
		const token = getAccessToken();
		expect(token).not.toBe('too-short');
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(readFileSync(resolveTokenPath(), 'utf8')).toBe(token);
	});

	it('regenerateAccessToken changes the token and invalidates the old session cookie', () => {
		const first = getAccessToken();
		const oldCookie = sessionCookieValue();
		expect(verifySessionCookie(oldCookie)).toBe(true);

		const second = regenerateAccessToken();
		expect(second).not.toBe(first);
		expect(verifyToken(first)).toBe(false);
		expect(verifyToken(second)).toBe(true);
		expect(verifySessionCookie(oldCookie)).toBe(false);
		expect(verifySessionCookie(sessionCookieValue())).toBe(true);
	});

	it('verifyToken rejects wrong length, empty and null', () => {
		const token = getAccessToken();
		expect(verifyToken(token)).toBe(true);
		expect(verifyToken(token.slice(0, 10))).toBe(false);
		expect(verifyToken('')).toBe(false);
		expect(verifyToken(null)).toBe(false);
		expect(verifyToken(undefined)).toBe(false);
	});

	it.skipIf(process.platform === 'win32')('writes the file with mode 0600', () => {
		getAccessToken();
		expect(statSync(resolveTokenPath()).mode & 0o777).toBe(0o600);
	});

	it('an unwritable path keeps an in-memory token and does not throw', () => {
		// A FILE STANDS WHERE THE PARENT DIRECTORY SHOULD BE, SO mkdir AND write BOTH FAIL
		const blocker = join(dir, 'blocker');
		writeFileSync(blocker, 'x');
		process.env.ACCESS_TOKEN_PATH = join(blocker, 'nested', 'access-token');
		__resetAccessTokenCacheForTests();

		const token = getAccessToken();
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(getAccessToken()).toBe(token);
		expect(verifyToken(token)).toBe(true);
	});
});
