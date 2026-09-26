// CORS: ONLY BROWSER EXTENSIONS (THE IMPORTER) GET CROSS-ORIGIN ACCESS. WEB PAGES NEVER DO, AND
// CREDENTIALS ARE NEVER ALLOWED CROSS-ORIGIN; EXTENSIONS AUTHENTICATE WITH THE TOKEN HEADER.
import { isBrowserExtensionOrigin } from './policy';

export function corsHeadersFor(origin: string | null | undefined): Record<string, string> | null {
	if (!origin || !isBrowserExtensionOrigin(origin)) return null;
	return {
		'Access-Control-Allow-Origin': origin,
		Vary: 'Origin',
		'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-XianScan-Token, X-Requested-With',
		'Access-Control-Max-Age': '600',
	};
}
