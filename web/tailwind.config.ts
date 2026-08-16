import type { Config } from 'tailwindcss';

export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	darkMode: 'class',
	theme: {
		extend: {
			fontFamily: {
				sans: ['var(--app-font-family, "CC Wild Words")', 'WildWorld', 'Montserrat', 'sans-serif'],
				serif: ['var(--app-font-family, "CC Wild Words")', 'Lora', 'Georgia', 'serif'],
				comic: ['"CC Wild Words"', 'WildWorld', 'sans-serif'],
			},
		},
	},
	plugins: [],
} satisfies Config;
