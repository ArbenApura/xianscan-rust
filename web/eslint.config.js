import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default [
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser,
			},
		},
	},
	{
		// ALLOW `_`-PREFIXED ARGS/VARS THAT EXIST ONLY FOR A SIGNATURE OR TO DECLARE A REACTIVE DEPENDENCY
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
			],
			// SvelteKit'S app.d.ts LOCALS/PAGEDATA INTERFACES START EMPTY AND GROW — INTERFACES MERGE, SO
			// THIS IS THE DOCUMENTED PATTERN (UNLIKE `type`, WHICH WOULD FORBID A SECOND DECLARATION).
			'@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'always' }],
		},
	},
	{
		// build/.svelte-kit/drizzle: GENERATED. tests/: TDD SUITE — LINTED TOO, BUT SOME FIXTURES ARE LOOSE.
		ignores: ['build/', '.svelte-kit/', 'package/', 'drizzle/', '*.db'],
	},
];
