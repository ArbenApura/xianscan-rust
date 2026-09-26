export interface DocItem {
	id: string;
	title: string;
	href: string;
	badge?: string;
}

export interface DocSection {
	title: string;
	items: DocItem[];
}

export const DOC_NAVIGATION: DocSection[] = [
	{
		title: 'Getting Started',
		items: [
			{ id: 'quick-start', title: 'Quick Start', href: '/docs/getting-started/quick-start/' },
			{ id: 'reading-guide', title: 'Using the Studio', href: '/docs/getting-started/reading/' },
			{ id: 'system-requirements', title: 'System Requirements', href: '/docs/getting-started/requirements/' },
			{ id: 'network-access', title: 'Other Devices & Access Token', href: '/docs/getting-started/network-access/' },
			{ id: 'data-and-updates', title: 'Your Data, Updates & Backups', href: '/docs/getting-started/data-and-updates/' },
			{ id: 'troubleshooting', title: 'Troubleshooting', href: '/docs/getting-started/troubleshooting/' },
		],
	},
	{
		title: 'Reading Everywhere',
		items: [
			{ id: 'browser-importer', title: 'Browser Importer', href: '/docs/extensions/importer/' },
			{ id: 'mihon-android', title: 'Mihon (Android)', href: '/docs/extensions/mihon/' },
		],
	},
	{
		title: 'AI & Translation',
		items: [
			{ id: 'ai-models', title: 'Translation Providers', href: '/docs/translation/models/' },
			{ id: 'preset-glossaries', title: 'Glossaries & Directives', href: '/docs/translation/glossaries/' },
		],
	},
	{
		title: 'Sample Results',
		items: [
			{ id: 'benchmarks-manhua', title: 'Chinese Manhua', href: '/docs/benchmarks/manhua/' },
			{ id: 'benchmarks-manhwa', title: 'Korean Manhwa', href: '/docs/benchmarks/manhwa/' },
			{ id: 'benchmarks-manga', title: 'Japanese Manga', href: '/docs/benchmarks/manga/' },
		],
	},
	{
		title: 'Advanced',
		items: [
			{ id: 'gpu-setup', title: 'GPU Acceleration', href: '/docs/advanced/gpu/' },
			{ id: 'typography-fonts', title: 'Typography & Fonts', href: '/docs/advanced/typography/' },
			{ id: 'storage-maintenance', title: 'Storage & Cleanup', href: '/docs/advanced/storage/' },
			{ id: 'self-hosting', title: 'Remote Server & Docker', href: '/docs/advanced/self-hosting/' },
			{ id: 'configuration', title: 'Configuration Reference', href: '/docs/advanced/configuration/' },
		],
	},
	{
		title: 'Developers',
		items: [
			{ id: 'ml-pipeline', title: 'How the Pipeline Works', href: '/docs/advanced/ml-pipeline/' },
			{ id: 'api-reference', title: 'REST API', href: '/docs/advanced/api/' },
			{ id: 'extension-development', title: 'Extension & Client Architecture', href: '/docs/advanced/extensions/' },
		],
	},
];
