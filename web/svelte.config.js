import adapterNode from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// precompress: SERVE PRE-BUILT .gz / .br FOR CLIENT ASSETS + PRERENDERED PAGES. NATIVE TO adapter-node.
		adapter: adapterNode({ precompress: true }),
		// ORIGIN AND CSRF CHECKS LIVE IN hooks.server.ts accessHandle, WHICH COVERS ALL METHODS AND CONTENT
		// TYPES AND RUNS AFTER TOKEN CHECKS. SVELTEKIT'S BUILT-IN CHECK WOULD 403 EXTENSION MULTIPART
		// UPLOADS BEFORE THE TOKEN IS READ (ADR-004).
		csrf: {
			trustedOrigins: ['*'],
		},
	},
};

export default config;
