// VITEST CONFIGURATION — THE SINGLE TEST HARNESS FOR THE WHOLE REPO.
//
// WHY NOT THE sveltekit() PLUGIN HERE: VITEST TRANSFORMS EVERYTHING THROUGH THE SSR PIPELINE, AND THE
// SVELTEKIT PLUGIN'S SVELTE COMPILER THEN COMPILES COMPONENTS IN SSR MODE — onMount/onDestroy NEVER FIRE,
// SO COMPONENT TESTS WOULD BE HOLLOW. THIS CONFIG USES @sveltejs/vite-plugin-svelte DIRECTLY (ITS TRANSFORM
// ALREADY RUNS WITH ssr:false UNDER VITEST — VERIFIED EMPIRICALLY), PLUS MANUAL ALIASES FOR WHAT THE APP
// RESOLVES VIA SVELTEKIT:
//   $lib                  → src/lib
//   $env/dynamic/private  → a live process.env DOUBLE (THE SVELTEKIT VIRTUAL MODULE IS A LITERAL {} IN
//                           TEST MODE — WITHOUT THIS, ENV-DEPENDENT MODULES SEE ONLY DEFAULTS)
//   $app/environment      → a browser:true stub
//
// KNOWN HARNESS LIMITATION (INHERITED FROM xianslate): SVELTE 4 LIFECYCLE HOOKS (onMount/onDestroy) DO NOT
// FIRE FOR COMPONENTS MOUNTED UNDER VITEST+jsdom. PURE-RENDER/INTERACTION COMPONENT TESTS WORK (Modal,
// GlossaryPanel); LIFECYCLE-DRIVEN COMPONENTS ARE COVERED BY THE PURE LOGIC SUITES INSTEAD.
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		svelte({
			// generate IS CONTROLLED BY THE PLUGIN ITSELF (DOM EXCEPT IN SSR) — SETTING IT IS IGNORED
			// AND WARNED ABOUT. hot:false KEEPS THE DEV SERVER OUT OF THE TEST PIPELINE.
			hot: false,
		}),
	],
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
			'$env/dynamic/private': fileURLToPath(new URL('./tests/helpers/env-dynamic.ts', import.meta.url)),
			'$env/dynamic/public': fileURLToPath(new URL('./tests/helpers/env-dynamic.ts', import.meta.url)),
			'$app/environment': fileURLToPath(new URL('./tests/helpers/app-environment.ts', import.meta.url)),
			'$app/navigation': fileURLToPath(new URL('./tests/helpers/app-environment.ts', import.meta.url)),
			'$app/stores': fileURLToPath(new URL('./tests/helpers/app-environment.ts', import.meta.url)),
		},
	},
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node',
		environmentMatchGlobs: [
			['**/*components*/**', 'jsdom'],
			['**/*ui*/**', 'jsdom'],
		],
		// PARALLEL WORKERS RUN TEST FILES CONCURRENTLY WITH THREAD / PROCESS ISOLATION.
		fileParallelism: true,
		// THE APP'S db SINGLETON (IMPORTED BY tests/server/db.test.ts VIA createDb) AND DATA_ROOT MUST NEVER
		// TOUCH THE REAL APP DATA DIR DURING TESTS — FORCE EVERY TEST PROCESS ONTO IN-MEMORY / TMP PATHS.
		env: {
			DATABASE_PATH: ':memory:',
			DATA_ROOT: fileURLToPath(new URL('./tests/.tmp-data', import.meta.url)),
		},
		// COVERAGE IS OPT-IN (npm run test:coverage) — CI GATES ON THE THRESHOLDS BELOW.
		coverage: {
			provider: 'v8',
			// NARROW TO THE MODULES THE SUITE ACTUALLY EXERCISES — THE FULL src/lib SET IS DRAGGED DOWN BY
			// CLIENT-ONLY FILES (api, components, …) THAT UNIT TESTS DELIBERATELY DON'T IMPORT. THE LIST
			// GROWS AS MODULES LAND; CI FAILS IF A COVERED MODULE REGRESSES BELOW THE GATE.
			include: [
				'src/lib/server/db/index.ts',
				'src/lib/server/deepseek.ts',
				'src/lib/server/glossary.ts',
				'src/lib/server/glossary-match.ts',
				'src/lib/server/glossary-csv.ts',
			],
			reporter: ['text', 'json-summary'],
			thresholds: { lines: 45, statements: 40, functions: 50, branches: 28 },
		},
	},
});
