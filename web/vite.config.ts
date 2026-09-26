import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
	plugins: [sveltekit()],
	server: {
		port: Number(process.env.DEV_PORT) || 8125,
		// LOOPBACK UNLESS THE LAUNCHER (OR THE DEVELOPER) ASKS FOR LAN WITH HOST=0.0.0.0
		host: process.env.HOST || '127.0.0.1',
	},
	preview: {
		port: Number(process.env.PORT) || 8124,
		host: process.env.HOST || '127.0.0.1',
	},
	ssr: {
		// IN BUILD MODE: BUNDLE ALL PURE-JS DEPS INTO SERVER CHUNKS FOR ZERO-DEPENDENCY RELEASE.
		// IN DEV MODE: ONLY TRANSFORM PACKAGES WITH .svelte FILES (lucide-svelte) TO AVOID
		// COMMONJS EVALUATION CONFLICTS IN NODE-FETCH / OPENAI.
		noExternal: command === 'build' ? true : ['lucide-svelte'],
		external: ['better-sqlite3', '@napi-rs/canvas', '@napi-rs/image'],
	},
}));
