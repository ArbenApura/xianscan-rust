// INSTALLED OS SYSTEM FONTS QUERY ENDPOINT
// IMPORTED DEP-TYPES
import type { RequestHandler } from '@sveltejs/kit';
// IMPORTED DEP-MODULES
import { json } from '@sveltejs/kit';
// IMPORTED MODULES
import { getAvailableSystemFonts } from '$lib/server/typeset/fonts';

// -- HANDLERS -- //

export const GET: RequestHandler = async ({ url }) => {
	try {
		const q = (url.searchParams.get('q') || '').trim().toLowerCase();
		const scriptFilter = (url.searchParams.get('script') || '').trim().toLowerCase();

		let fonts = getAvailableSystemFonts();

		if (scriptFilter === 'dialogue' || scriptFilter === 'cjk') {
			fonts = fonts.filter((f) => f.scriptType === scriptFilter);
		}

		if (q) {
			fonts = fonts.filter((f) => f.family.toLowerCase().includes(q));
		}

		return json({
			success: true,
			fonts,
			total: fonts.length,
		});
	} catch (e: any) {
		return json({ success: false, error: e?.message || 'FAILED TO SCAN SYSTEM FONTS' }, { status: 500 });
	}
};
