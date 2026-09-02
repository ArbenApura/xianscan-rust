// THEME STORE WITH THEME_CLASS ADHERING TO DESIGN SYSTEM (LIGHT / SEPIA / DARK / AUTO)
import { writable } from 'svelte/store';

export type Theme = 'auto' | 'light' | 'sepia' | 'dark';

export const THEME_CLASS: Record<Theme, string> = {
	auto: 'bg-[#fbfaf7] dark:bg-[#13100c] text-[#2b2320] dark:text-[#d8cfc2]',
	light: 'bg-[#fbfaf7] text-[#2b2320]',
	sepia: 'bg-[#f4ecd8] text-[#5b4636]',
	dark: 'bg-[#13100c] text-[#d8cfc2]',
};

export const THEME_HEADER: Record<Theme, string> = {
	auto: 'bg-[#fbfaf7]/75 dark:bg-[#13100c]/75 border-black/10 dark:border-white/10',
	light: 'bg-[#fbfaf7]/75 border-black/10',
	sepia: 'bg-[#f4ecd8]/75 border-[#5b4636]/15',
	dark: 'bg-[#13100c]/75 border-white/10',
};

export const THEME_PANEL: Record<Theme, string> = {
	auto: 'bg-white dark:bg-[#211c15] border-black/10 dark:border-white/10',
	light: 'bg-white border-black/10',
	sepia: 'bg-[#fbf6ea] border-[#5b4636]/15',
	dark: 'bg-[#211c15] border-white/10',
};

export const THEME_BG: Record<'light' | 'sepia' | 'dark', string> = {
	light: '#fbfaf7',
	sepia: '#f4ecd8',
	dark: '#13100c',
};

const STORAGE_KEY = 'xianscan:docs:theme';

export function isDarkTheme(theme: Theme): boolean {
	if (typeof window === 'undefined') return false;
	if (theme === 'auto') {
		return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
	}
	return theme === 'dark';
}

export function resolveTheme(theme: Theme): 'light' | 'sepia' | 'dark' {
	if (theme !== 'auto') return theme;
	if (typeof window !== 'undefined' && window.matchMedia) {
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}
	return 'light';
}

function createThemeStore() {
	const initial: Theme = (typeof window !== 'undefined' && (localStorage.getItem(STORAGE_KEY) as Theme)) || 'auto';
	const { subscribe, set, update } = writable<Theme>(initial);

	function applyTheme(theme: Theme) {
		if (typeof document === 'undefined') return;
		const root = document.documentElement;
		const isDark = isDarkTheme(theme);
		const resolved = resolveTheme(theme);

		// SYNCHRONIZE DARK CLASS FOR TAILWIND & CUSTOM CSS RULES
		if (isDark) {
			root.classList.add('dark');
		} else {
			root.classList.remove('dark');
		}

		// SET EXPLICIT COLOR SCHEME FOR BROWSER SCROLLBARS AND NATIVE INPUTS
		root.style.colorScheme = isDark ? 'dark' : 'light';

		// SET ROOT AND BODY BACKGROUNDS
		const bg = THEME_BG[resolved] || (isDark ? THEME_BG.dark : THEME_BG.light);
		root.style.backgroundColor = bg;
		if (document.body) {
			document.body.style.backgroundColor = bg;
		}

		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(STORAGE_KEY, theme);
		}
	}

	return {
		subscribe,
		set: (theme: Theme) => {
			applyTheme(theme);
			set(theme);
		},
		toggle: () => {
			update((current) => {
				const next: Theme = current === 'auto' ? 'sepia' : current === 'sepia' ? 'light' : current === 'light' ? 'dark' : 'auto';
				applyTheme(next);
				return next;
			});
		},
		init: () => {
			if (typeof window !== 'undefined') {
				const saved = (localStorage.getItem(STORAGE_KEY) as Theme) || 'auto';
				applyTheme(saved);
				set(saved);

				// LISTEN FOR OS COLOR-SCHEME CHANGES IF IN AUTO MODE
				const mql = window.matchMedia('(prefers-color-scheme: dark)');
				const handler = () => {
					const current = (localStorage.getItem(STORAGE_KEY) as Theme) || 'auto';
					if (current === 'auto') {
						applyTheme('auto');
					}
				};
				if (mql.addEventListener) {
					mql.addEventListener('change', handler);
				} else if ((mql as any).addListener) {
					(mql as any).addListener(handler);
				}
			}
		}
	};
}

export const themeStore = createThemeStore();