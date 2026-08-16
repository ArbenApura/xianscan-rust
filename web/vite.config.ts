import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
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
		// BUNDLE ALL PURE-JS DEPS INTO THE SERVER CHUNKS SO THE BUILD/ DIR IS SELF-CONTAINED.
		// THIS IS REQUIRED FOR SINGLE-FILE DISTRIBUTION (NO node_modules SHIPPED IN THE RELEASE).
		// lucide-svelte: MUST BE BUNDLED — NODE CANNOT LOAD .svelte FILES NATIVELY (ERR_UNKNOWN_FILE_EXTENSION).
		// better-sqlite3 / @napi-rs/canvas: NATIVE .node BINARY ADDONS — CANNOT BE BUNDLED BY VITE;
		//   THEY ARE KEPT EXTERNAL AND THEIR node_modules FOLDERS ARE INCLUDED IN THE RELEASE ARCHIVE.
		noExternal: true,
		external: ['better-sqlite3', '@napi-rs/canvas'],
	},
});
