import { DOC_NAVIGATION } from '$lib/docs-nav';
import type { EntryGenerator } from './$types';

export const prerender = true;

export const entries: EntryGenerator = () => {
	const entriesList: { slug: string }[] = [];
	for (const section of DOC_NAVIGATION) {
		for (const item of section.items) {
			if (item.href.startsWith('/docs/')) {
				const slug = item.href.replace('/docs/', '');
				entriesList.push({ slug });
			}
		}
	}
	return entriesList;
};
