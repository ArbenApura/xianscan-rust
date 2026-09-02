import type { Config } from 'tailwindcss';

export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	darkMode: 'class',
	theme: {
		extend: {
			fontFamily: {
				sans: ['Inter', 'Lexend', 'system-ui', 'sans-serif'],
				serif: ['Lora', 'Georgia', 'serif'],
				display: ['Montserrat', 'Inter', 'sans-serif'],
			},
			colors: {
				cinnabar: {
					DEFAULT: '#b23a2e',
					hover: '#c0392b',
					deep: '#a3342a',
				},
				jade: {
					DEFAULT: '#4f7a64',
					soft: '#5b8a72',
				},
				gold: {
					DEFAULT: '#a97f28',
					soft: '#c9a24b',
				},
			},
		},
	},
	plugins: [],
} satisfies Config;
