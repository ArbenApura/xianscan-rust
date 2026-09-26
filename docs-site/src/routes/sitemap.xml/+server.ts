// SITEMAP GENERATED FROM THE DOCS NAVIGATION AT BUILD TIME, SO A NEW PAGE CAN NEVER BE LEFT OUT
import { DOC_NAVIGATION } from '$lib/docs-nav';
import { DOCS_CONTENT } from '$lib/docs-content';

export const prerender = true;
export const trailingSlash = 'never';

const SITE = 'https://xianscan.arbenger.com';

export function GET() {
	const urls = [`  <url>\n    <loc>${SITE}/</loc>\n    <priority>1.0</priority>\n  </url>`];

	for (const section of DOC_NAVIGATION) {
		for (const item of section.items) {
			const slug = item.href.replace(/^\/docs\//, '').replace(/\/$/, '');
			const lastmod = DOCS_CONTENT[slug]?.lastUpdated;
			urls.push(
				`  <url>\n    <loc>${SITE}${item.href}</loc>\n` +
					(lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : '') +
					`    <priority>0.8</priority>\n  </url>`,
			);
		}
	}

	const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
	return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
