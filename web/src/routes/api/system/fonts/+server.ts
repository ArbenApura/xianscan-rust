import { json, type RequestHandler } from '@sveltejs/kit';
import { getFontAvailability } from '$lib/server/typeset/fonts';

export const GET: RequestHandler = async () => {
	try {
		const fonts = getFontAvailability();
		return json({ success: true, fonts });
	} catch (e: any) {
		return json({ success: false, error: e?.message || 'Failed to detect fonts' }, { status: 500 });
	}
};

