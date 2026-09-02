import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
	plugins: [sveltekit()],
	ssr: {
		noExternal: command === 'build' ? true : ['lucide-svelte']
	}
}));
