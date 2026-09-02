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
			{ id: 'quick-start', title: 'Quick Start (3-Minute Setup)', href: '/docs/getting-started/quick-start' },
			{ id: 'reading-guide', title: 'How to Import & Read', href: '/docs/getting-started/reading' },
			{ id: 'system-requirements', title: 'System Requirements', href: '/docs/getting-started/requirements' },
		],
	},
	{
		title: 'Reading Everywhere',
		items: [
			{ id: 'browser-importer', title: 'Browser Web Importer', href: '/docs/extensions/importer' },
			{ id: 'mihon-android', title: 'Mihon Android App (Wi-Fi Sync)', href: '/docs/extensions/mihon' },
		],
	},
	{
		title: 'AI & Translation',
		items: [
			{ id: 'ai-models', title: 'Choosing AI Providers (Local & Cloud)', href: '/docs/translation/models' },
			{ id: 'preset-glossaries', title: 'Preset Themes & Glossaries', href: '/docs/translation/glossaries' },
		],
	},
	{
		title: 'Format Benchmarks',
		items: [
			{ id: 'benchmarks-manhua', title: 'Chinese Manhua (Xianxia)', href: '/docs/benchmarks/manhua' },
			{ id: 'benchmarks-manhwa', title: 'Korean Manhwa (Webtoons)', href: '/docs/benchmarks/manhwa' },
			{ id: 'benchmarks-manga', title: 'Japanese Manga (RTL)', href: '/docs/benchmarks/manga' },
		],
	},
	{
		title: 'Advanced & Developer Hub',
		items: [
			{ id: 'gpu-setup', title: 'GPU Hardware Acceleration', href: '/docs/advanced/gpu' },
			{ id: 'ml-pipeline', title: 'ML Pipeline & Inpainting Engine', href: '/docs/advanced/ml-pipeline' },
			{ id: 'api-reference', title: 'REST API & Automation', href: '/docs/advanced/api' },
			{ id: 'extension-development', title: 'Extension & Client Architecture', href: '/docs/advanced/extensions' },
			{ id: 'self-hosting', title: 'Remote Server & Cloudflare Tunnels', href: '/docs/advanced/self-hosting' },
		],
	},
];