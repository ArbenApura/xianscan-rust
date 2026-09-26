// ACCESS SETTINGS: STORED AS PLAIN app_settings ROWS OUTSIDE AppSettings, SO THEY NEVER SYNC TO THE
// CLIENT SETTINGS STORE AND CANNOT BE CHANGED THROUGH THE GENERIC SETTINGS API.
// IMPORTED DEP-MODULES
import { eq, inArray } from 'drizzle-orm';
import { networkInterfaces } from 'node:os';
// IMPORTED ENVS ($env/...)
import { env } from '$env/dynamic/private';
// IMPORTED MODULES
import { db as defaultDb } from '$lib/server/db';
import { appSettings } from '$lib/server/db/schema';
import { getBindSource, getEffectiveBind, type BindSource, type EffectiveBind } from './bind';
import { getAccessToken } from './token';

// -- TYPES -- //

export interface AccessSettings {
	lanAccessEnabled: boolean;
	noticePending: boolean;
	/** True once any value was stored (the Rust launcher treats a missing row as "not decided yet"). */
	lanDecided: boolean;
}

export interface AccessStatus {
	token: string;
	lanAccessEnabled: boolean;
	effectiveBind: EffectiveBind;
	bindSource: BindSource;
	restartRequired: boolean;
	lanUrls: string[];
	noticePending: boolean;
}

// -- CONSTANTS -- //

export const LAN_ACCESS_KEY = 'lanAccessEnabled';
export const ACCESS_NOTICE_KEY = 'accessNoticePending';

// -- FUNCTIONS -- //

function upsert(key: string, value: string, db = defaultDb): void {
	const now = Date.now();
	db.insert(appSettings)
		.values({ key, value, updatedAt: now })
		.onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } })
		.run();
}

export function getAccessSettings(db = defaultDb): AccessSettings {
	const rows = db
		.select()
		.from(appSettings)
		.where(inArray(appSettings.key, [LAN_ACCESS_KEY, ACCESS_NOTICE_KEY]))
		.all();
	const map = new Map(rows.map((r) => [r.key, r.value]));
	const lan = map.get(LAN_ACCESS_KEY);
	return {
		lanAccessEnabled: lan === 'true',
		noticePending: map.get(ACCESS_NOTICE_KEY) === 'true',
		lanDecided: lan !== undefined,
	};
}

export function setLanAccessEnabled(value: boolean, db = defaultDb): void {
	upsert(LAN_ACCESS_KEY, value ? 'true' : 'false', db);
}

export function setAccessNoticePending(value: boolean, db = defaultDb): void {
	upsert(ACCESS_NOTICE_KEY, value ? 'true' : 'false', db);
}

/**
 * An install that predates this feature was reachable on the LAN. The launcher starts it in LAN
 * mode (ADR-007) and tells us via XIANSCAN_BIND_SOURCE=legacy-default; record that choice once and
 * show the one-time notice. A stored user choice is never overwritten.
 */
export function applyBindSourceOnBoot(db = defaultDb): boolean {
	if (getBindSource() !== 'legacy-default') return false;
	const row = db.select().from(appSettings).where(eq(appSettings.key, LAN_ACCESS_KEY)).get();
	if (row) return false;
	setLanAccessEnabled(true, db);
	setAccessNoticePending(true, db);
	return true;
}

export function listLanUrls(port: number | string = env.PORT ?? 8124): string[] {
	const urls: string[] = [];
	for (const addrs of Object.values(networkInterfaces())) {
		for (const a of addrs ?? []) {
			if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${port}`);
		}
	}
	return urls;
}

export function getAccessStatus(db = defaultDb): AccessStatus {
	const settings = getAccessSettings(db);
	const effectiveBind = getEffectiveBind();
	const bindSource = getBindSource();
	const pinned = bindSource === 'env' || bindSource === 'docker';
	return {
		token: getAccessToken(),
		lanAccessEnabled: settings.lanAccessEnabled,
		effectiveBind,
		bindSource,
		restartRequired: !pinned && settings.lanAccessEnabled !== (effectiveBind === 'lan'),
		lanUrls: effectiveBind === 'lan' ? listLanUrls() : [],
		noticePending: settings.noticePending,
	};
}
