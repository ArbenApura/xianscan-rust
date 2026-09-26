import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getTestDb, resetDb } from '../helpers/db';
import { fakeEvent } from '../helpers/request-event';

vi.mock('$lib/server/db', async () => ({ db: (await import('../helpers/db')).getTestDb() }));

import {
	applyBindSourceOnBoot,
	getAccessSettings,
	getAccessStatus,
	setLanAccessEnabled,
} from '$lib/server/access/access-settings';
import { __resetAccessTokenCacheForTests, getAccessToken, verifySessionCookie } from '$lib/server/access/token';
import { GET, PATCH } from '../../src/routes/api/system/access/+server';
import { POST as REGENERATE } from '../../src/routes/api/system/access/token/regenerate/+server';

describe('access settings', () => {
	let dir: string;

	beforeEach(() => {
		resetDb();
		dir = mkdtempSync(join(tmpdir(), 'xianscan-access-'));
		process.env.ACCESS_TOKEN_PATH = join(dir, 'access-token');
		__resetAccessTokenCacheForTests();
	});

	afterEach(() => {
		delete process.env.ACCESS_TOKEN_PATH;
		delete process.env.XIANSCAN_BIND_SOURCE;
		delete process.env.HOST;
		__resetAccessTokenCacheForTests();
		rmSync(dir, { recursive: true, force: true });
	});

	it('legacy-default boot writes both rows once and never overwrites a user choice', () => {
		const db = getTestDb();
		process.env.XIANSCAN_BIND_SOURCE = 'legacy-default';

		expect(applyBindSourceOnBoot(db as any)).toBe(true);
		expect(getAccessSettings(db as any)).toEqual({ lanAccessEnabled: true, noticePending: true, lanDecided: true });

		// THE USER TURNS LAN OFF; A SECOND LEGACY BOOT MUST NOT FLIP IT BACK
		setLanAccessEnabled(false, db as any);
		expect(applyBindSourceOnBoot(db as any)).toBe(false);
		expect(getAccessSettings(db as any).lanAccessEnabled).toBe(false);
	});

	it('does nothing on a normal boot', () => {
		const db = getTestDb();
		process.env.XIANSCAN_BIND_SOURCE = 'default';
		expect(applyBindSourceOnBoot(db as any)).toBe(false);
		expect(getAccessSettings(db as any).lanDecided).toBe(false);
	});

	it('reports restartRequired when the stored choice differs from the running bind', () => {
		const db = getTestDb();
		process.env.HOST = '127.0.0.1';
		process.env.XIANSCAN_BIND_SOURCE = 'default';
		setLanAccessEnabled(true, db as any);
		const status = getAccessStatus(db as any);
		expect(status.effectiveBind).toBe('local');
		expect(status.restartRequired).toBe(true);
		expect(status.lanUrls).toEqual([]);

		// PINNED BY DOCKER: NEVER "RESTART REQUIRED"
		process.env.XIANSCAN_BIND_SOURCE = 'docker';
		expect(getAccessStatus(db as any).restartRequired).toBe(false);
	});

	it('GET /api/system/access is refused for public callers and returns the token otherwise', async () => {
		const pub = fakeEvent({ url: 'http://localhost:8124/api/system/access' });
		pub.locals.access = { via: 'public' };
		expect((await GET(pub)).status).toBe(401);

		const local = fakeEvent({ url: 'http://localhost:8124/api/system/access' });
		local.locals.access = { via: 'local' };
		const res = await GET(local);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.token).toBe(getAccessToken());
		expect(body).toHaveProperty('lanAccessEnabled');
		expect(body).toHaveProperty('bindSource');
	});

	it('PATCH persists the LAN choice and dismisses the notice', async () => {
		const db = getTestDb();
		process.env.XIANSCAN_BIND_SOURCE = 'legacy-default';
		applyBindSourceOnBoot(db as any);

		const event = fakeEvent({
			method: 'PATCH',
			url: 'http://localhost:8124/api/system/access',
			body: { lanAccessEnabled: false, dismissNotice: true },
		});
		event.locals.access = { via: 'local' };
		const res = await PATCH(event);
		expect(res.status).toBe(200);
		expect(getAccessSettings(db as any)).toMatchObject({ lanAccessEnabled: false, noticePending: false });

		const bad = fakeEvent({ method: 'PATCH', url: 'http://localhost:8124/api/system/access', body: { token: 'x' } });
		bad.locals.access = { via: 'local' };
		expect((await PATCH(bad)).status).toBe(400);
	});

	it('regenerate returns a new token and re-issues the caller cookie', async () => {
		const old = getAccessToken();
		const event = fakeEvent({ method: 'POST', url: 'http://localhost:8124/api/system/access/token/regenerate' });
		event.locals.access = { via: 'cookie' };
		const res = await REGENERATE(event);
		const body = await res.json();
		expect(body.token).not.toBe(old);
		expect(body.token).toBe(getAccessToken());
		expect(event.setCookies[0].name).toBe('xianscan_session');
		expect(verifySessionCookie(event.setCookies[0].value)).toBe(true);

		const pub = fakeEvent({ method: 'POST', url: 'http://localhost:8124/api/system/access/token/regenerate' });
		pub.locals.access = { via: 'public' };
		expect((await REGENERATE(pub)).status).toBe(401);
	});
});
