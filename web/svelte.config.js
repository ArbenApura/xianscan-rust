import adapterNode from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// precompress: SERVE PRE-BUILT .gz / .br FOR CLIENT ASSETS + PRERENDERED PAGES. NATIVE TO adapter-node.
		adapter: adapterNode({ precompress: true }),
		csrf: {
			checkOrigin: false,
		},
	},
};

export default config;
