// @ts-ignore THE DOCS SITE HAS NO @types/node; THIS RUNS IN NODE AT BUILD TIME ONLY
import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// THE APP VERSION SHOWN ON THE SITE COMES FROM THE ROOT Cargo.toml, SO A RELEASE BUMP NEVER LEAVES THE DOCS BEHIND
const cargoToml = readFileSync(new URL('../Cargo.toml', import.meta.url), 'utf8');
const appVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? 'dev';

export default defineConfig(({ command }) => ({
	plugins: [sveltekit()],
	define: {
		__APP_VERSION__: JSON.stringify(appVersion)
	},
	ssr: {
		noExternal: command === 'build' ? true : ['lucide-svelte']
	}
}));
