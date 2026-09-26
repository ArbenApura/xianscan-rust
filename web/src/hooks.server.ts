// IMPORTED DEP-TYPES
import type { Handle, HandleServerError } from '@sveltejs/kit';
// IMPORTED DEP-MODULES
import { sequence } from '@sveltejs/kit/hooks';
import { dev } from '$app/environment';
// IMPORTED MODULES
import {
	THEME_BG,
	THEME_COOKIE,
	FONT_COOKIE,
	FONT_STACKS,
	INPUT_FONT_STACKS,
	type AppFont,
} from '$lib/stores/settings';
import { getCanonicalSettings } from '$lib/server/settings-service';
import { batchService } from '$lib/server/batch-service';
import { accessHandle } from '$lib/server/access/handle';
import { applyBindSourceOnBoot } from '$lib/server/access/access-settings';
import { syncPersistedHardwareSettings } from '$lib/server/hardware-sync';
import { armParentWatchdog, installProcessGuards } from '$lib/server/process-guards';

// -- TYPES -- //

declare global {
	var __mtProcessGuards: boolean | undefined;
}

// -- CONSTANTS -- //

const DARK = ['dark'];

// -- LIFECYCLES -- //

// PROCESS-LEVEL RESILIENCE, REGISTERED ONCE (HMR-SAFE). A STRAY ASYNC REJECTION IS LOGGED AND THE SERVER KEEPS
// SERVING; AN UNCAUGHT EXCEPTION EXITS IN PRODUCTION SO THE RUST SUPERVISOR RESTARTS A CLEAN SERVER (SEE
// process-guards.ts).
if (!globalThis.__mtProcessGuards) {
	globalThis.__mtProcessGuards = true;
	installProcessGuards({ dev });
	// EXIT WITH THE RUST PARENT (NO ORPHANED SERVER HOLDING THE PORT); ONLY ARMED WHEN IT SPAWNED US
	armParentWatchdog();
	// RESTORE CRASH-INTERRUPTED TRANSLATION BATCH QUEUE
	try {
		batchService.reconcileAndRecoverOnStartup();
	} catch (err) {
		console.warn('[server] failed to run batch recovery on startup:', err);
	}
	// A PRE-TOKEN INSTALL STARTED IN LAN MODE: RECORD THAT AND QUEUE THE ONE-TIME NOTICE (ADR-007)
	try {
		applyBindSourceOnBoot();
	} catch (err) {
		console.warn('[server] failed to record the legacy LAN access setting:', err);
	}
	// PUSH THE PERSISTED DEVICE / VRAM SETTINGS TO THE ML SERVER ONCE (NOT ON EVERY GET)
	syncPersistedHardwareSettings().catch((err) => console.warn('[server] hardware settings sync failed:', err));
}

// -- HANDLES -- //

// WELL-KNOWN & BROWSER PROBE HANDLER: SILENCES CHROME DEVTOOLS AND SYSTEM PROBE 404 WARNINGS
const probeHandle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	if (path.startsWith('/.well-known/')) {
		return new Response(JSON.stringify({}), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	}
	return resolve(event);
};

// HTTP REQUEST LOGGER: QUIET BY DEFAULT. SET LOG_REQUESTS=1 TO RESTORE PER-REQUEST LOGS.
const loggingHandle: Handle = async ({ event, resolve }) => {
	if (process.env.LOG_REQUESTS !== '1') {
		return resolve(event);
	}

	const start = performance.now();
	const { method } = event.request;
	const path = event.url.pathname;

	const response = await resolve(event);
	const duration = (performance.now() - start).toFixed(1);
	const status = response.status;

	// Log meaningful pages and API calls (skip internal static assets)
	const isStatic = path.startsWith('/_app/') || path.startsWith('/fonts/') || path.startsWith('/favicon');
	if (!isStatic) {
		const timeStr = new Date().toLocaleTimeString();
		const statusColor = status >= 500 ? '❌' : status >= 400 ? '⚠️' : '✅';
		console.log(`[${timeStr}] ${statusColor} ${method} ${path} -> ${status} (${duration}ms)`);
	}

	return response;
};

// PRE-RENDER THE SAVED THEME & FONT ONTO <html> FROM COOKIES SO THERE'S ZERO FLASH ON LOAD
const themeHandle: Handle = async ({ event, resolve }) => {
	const themeCookie = event.cookies.get(THEME_COOKIE);
	const fontCookie = event.cookies.get(FONT_COOKIE) as AppFont;
	const canonical = getCanonicalSettings();
	const defaultTheme = canonical?.theme && Object.prototype.hasOwnProperty.call(THEME_BG, canonical.theme) ? canonical.theme : 'sepia';
	const defaultFont = canonical?.appFont && Object.prototype.hasOwnProperty.call(FONT_STACKS, canonical.appFont) ? canonical.appFont : 'comic';

	const theme = themeCookie && Object.prototype.hasOwnProperty.call(THEME_BG, themeCookie) ? themeCookie : defaultTheme;
	const font = fontCookie && Object.prototype.hasOwnProperty.call(FONT_STACKS, fontCookie) ? fontCookie : defaultFont;
	const isDark = theme === 'dark' || (theme === 'auto' && event.request.headers.get('sec-ch-prefers-color-scheme') === 'dark');
	const bg = isDark ? THEME_BG.dark : (theme === 'sepia' ? THEME_BG.sepia : THEME_BG.light);
	const fontStack = FONT_STACKS[font] ?? FONT_STACKS.comic;
	const inputFontStack = INPUT_FONT_STACKS[font] ?? INPUT_FONT_STACKS.comic;
	const htmlClass = isDark ? 'h-full dark' : 'h-full';
	const fontStyle = `--app-font-family: ${fontStack}; --app-input-font-family: ${inputFontStack};`;
	return resolve(event, {
		// SEED THE MOBILE BROWSER-CHROME COLOR AND ROOT FONT ON FIRST PAINT
		transformPageChunk: ({ html }) =>
			html
				.replace('%THEME_CLASS%', htmlClass)
				.replace('%THEME_COLOR%', bg)
				.replace('%APP_FONT_STYLE%', fontStyle),
	});
};

// ACCESS CONTROL (TOKEN, SESSION COOKIE, TRUSTED LOOPBACK) AND EXTENSION-ONLY CORS RUN FIRST.
// SEE $lib/server/access/handle.ts
export const handle = sequence(accessHandle, probeHandle, loggingHandle, themeHandle);

// SERVER ERROR HANDLER: SUPPRESSES 404 LOGS IN CLI
export const handleError: HandleServerError = ({ error, status }) => {
	if (status === 404 || (error as any)?.status === 404) {
		return { message: 'Not found' };
	}
	console.error('[server error]', error);
	return { message: 'Internal Server Error' };
};
