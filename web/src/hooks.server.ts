// IMPORTED DEP-TYPES
import type { Handle } from '@sveltejs/kit';
// IMPORTED DEP-MODULES
import { sequence } from '@sveltejs/kit/hooks';
// IMPORTED MODULES
import { THEME_BG, THEME_COOKIE, FONT_COOKIE, FONT_STACKS, type AppFont } from '$lib/stores/settings';

// -- TYPES -- //

declare global {
	var __mtProcessGuards: boolean | undefined;
}

// -- CONSTANTS -- //

const DARK = ['dark'];

// -- LIFECYCLES -- //

// PROCESS-LEVEL RESILIENCE. A STRAY ASYNC REJECTION — e.g. A DETACHED TRANSLATION JOB SAVING TO A PAGE
// THE USER DELETED MID-FLIGHT — MUST NOT TAKE THE WHOLE SERVER DOWN. NODE EXITS ON AN UNHANDLED REJECTION
// BY DEFAULT; LOG IT AND KEEP SERVING. REGISTERED ONCE (HMR-SAFE).
if (!globalThis.__mtProcessGuards) {
	globalThis.__mtProcessGuards = true;
	process.on('unhandledRejection', (reason) => console.error('[server] unhandled rejection (kept alive):', reason));
	process.on('uncaughtException', (err) => console.error('[server] uncaught exception (kept alive):', err));
}

// -- HANDLES -- //

// HTTP REQUEST LOGGER
const loggingHandle: Handle = async ({ event, resolve }) => {
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
	const theme = event.cookies.get(THEME_COOKIE) ?? 'sepia';
	const font = (event.cookies.get(FONT_COOKIE) as AppFont) ?? 'comic';
	const isDark = DARK.includes(theme);
	const bg = (THEME_BG as Record<string, string>)[theme] ?? THEME_BG.sepia;
	const fontStack = FONT_STACKS[font] ?? FONT_STACKS.comic;
	const htmlClass = isDark ? 'h-full dark' : 'h-full';
	const fontStyle = `--app-font-family: ${fontStack};`;
	return resolve(event, {
		// SEED THE MOBILE BROWSER-CHROME COLOR AND ROOT FONT ON FIRST PAINT
		transformPageChunk: ({ html }) =>
			html
				.replace('%THEME_CLASS%', htmlClass)
				.replace('%THEME_COLOR%', bg)
				.replace('%APP_FONT_STYLE%', fontStyle),
	});
};

export const handle = sequence(loggingHandle, themeHandle);
