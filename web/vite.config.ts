import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
	plugins: [sveltekit()],
	server: {
		port: Number(process.env.PORT) || 8124,
		host: '0.0.0.0',
	},
	preview: {
		port: Number(process.env.PORT) || 8124,
		host: '0.0.0.0',
	},
	ssr: {
		// IN BUILD MODE: BUNDLE ALL PURE-JS DEPS INTO SERVER CHUNKS FOR ZERO-DEPENDENCY RELEASE.
		// IN DEV MODE: ONLY TRANSFORM PACKAGES WITH .svelte FILES (lucide-svelte) TO AVOID
		// COMMONJS EVALUATION CONFLICTS IN NODE-FETCH / OPENAI.
		noExternal: command === 'build' ? true : ['lucide-svelte'],
		external: ['better-sqlite3', '@napi-rs/canvas'],
	},
}));
