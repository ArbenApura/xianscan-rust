// ACCESS TOKEN: ONE RANDOM SECRET PER INSTALL, STORED NEXT TO THE DATABASE. LAN BROWSERS TRADE IT
// FOR A SESSION COOKIE ON /unlock; EXTENSIONS AND MIHON SEND IT AS A HEADER ON EVERY REQUEST.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
// IMPORTED ENVS ($env/...)
import { env } from '$env/dynamic/private';
// IMPORTED MODULES
import { DATA_ROOT } from '$lib/server/paths';

// -- CONSTANTS -- //

export const ACCESS_TOKEN_BYTES = 32;
// 32 BYTES IN BASE64URL WITHOUT PADDING
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_LABEL = 'xianscan-session-v1';

// -- STATE -- //

let cachedToken: string | null = null;
let warnedWriteFailure = false;

// -- FUNCTIONS -- //

export function resolveTokenPath(): string {
	return env.ACCESS_TOKEN_PATH && env.ACCESS_TOKEN_PATH.trim().length > 0
		? env.ACCESS_TOKEN_PATH.trim()
		: join(DATA_ROOT, 'access-token');
}

function persistToken(token: string): void {
	const path = resolveTokenPath();
	try {
		mkdirSync(dirname(path), { recursive: true });
		const tmp = `${path}.${process.pid}.tmp`;
		writeFileSync(tmp, token, { mode: 0o600 });
		renameSync(tmp, path);
	} catch (e) {
		// KEEP SERVING WITH THE IN-MEMORY TOKEN; IT JUST WILL NOT SURVIVE A RESTART
		if (!warnedWriteFailure) {
			warnedWriteFailure = true;
			console.warn(`[access] could not write the access token to ${path}:`, e);
		}
	}
}

function readTokenFile(): string | null {
	try {
		const raw = readFileSync(resolveTokenPath(), 'utf8').trim();
		return TOKEN_PATTERN.test(raw) ? raw : null;
	} catch {
		return null;
	}
}

export function getAccessToken(): string {
	if (cachedToken) return cachedToken;
	const existing = readTokenFile();
	if (existing) {
		cachedToken = existing;
		return existing;
	}
	const token = randomBytes(ACCESS_TOKEN_BYTES).toString('base64url');
	persistToken(token);
	cachedToken = token;
	return token;
}

export function regenerateAccessToken(): string {
	const token = randomBytes(ACCESS_TOKEN_BYTES).toString('base64url');
	persistToken(token);
	cachedToken = token;
	return token;
}

function digest(value: string): Buffer {
	return createHash('sha256').update(value, 'utf8').digest();
}

/** Constant-time check. Both sides are hashed first so the comparison never leaks the length. */
export function verifyToken(candidate: string | null | undefined): boolean {
	if (typeof candidate !== 'string' || candidate.length === 0 || candidate.length > 512) return false;
	return timingSafeEqual(digest(candidate.trim()), digest(getAccessToken()));
}

export function sessionCookieValue(token: string = getAccessToken()): string {
	return createHmac('sha256', token).update(SESSION_LABEL).digest('base64url');
}

export function verifySessionCookie(value: string | null | undefined): boolean {
	if (typeof value !== 'string' || value.length === 0 || value.length > 128) return false;
	const expected = Buffer.from(sessionCookieValue(), 'base64url');
	const given = Buffer.from(value, 'base64url');
	if (given.length !== expected.length) return false;
	return timingSafeEqual(given, expected);
}

/** Test hook: forget the cached token so the next call re-reads the file. */
export function __resetAccessTokenCacheForTests(): void {
	cachedToken = null;
	warnedWriteFailure = false;
}
