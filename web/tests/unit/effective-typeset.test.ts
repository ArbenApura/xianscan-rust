// EFFECTIVE TYPESET STYLE (FEAT-009 PHASE 4, ADR-004): FALLBACKS ARE COMPUTED, NEVER WRITTEN BACK.
import { describe, expect, it } from 'vitest';
import { resolveEffectiveTypeset, type TypesetFontOption } from '$lib/stores/settings';

const font = (over: Partial<TypesetFontOption> & { id: string }): TypesetFontOption =>
	({ label: over.id, stack: `"${over.id}", sans-serif`, supportedWeights: ['normal'], ...over }) as TypesetFontOption;

const catalog = (fonts: TypesetFontOption[], loaded = true) => ({ dialogueFonts: fonts, fontStatus: {}, loaded });

describe('resolveEffectiveTypeset', () => {
	it('an unknown (not yet loaded) custom font keeps the stored casing and weight', () => {
		const eff = resolveEffectiveTypeset(
			{ typesetFont: 'MyFont', typesetFontWeight: '700', typesetCasing: 'original' },
			catalog([font({ id: 'CC Wild Words', allCapsOnly: true, supportedCasings: ['uppercase'] })], false),
		);
		expect(eff.fontKnown).toBe(false);
		expect(eff.font).toBeNull();
		expect(eff.casing).toBe('original');
		expect(eff.weight).toBe('700');
	});

	it('a known all-caps font yields uppercase without touching the stored settings', () => {
		const stored = { typesetFont: 'CC Wild Words', typesetFontWeight: '400' as const, typesetCasing: 'original' as const };
		const eff = resolveEffectiveTypeset(stored, catalog([font({ id: 'CC Wild Words', allCapsOnly: true, supportedCasings: ['uppercase'] })]));
		expect(eff.casing).toBe('uppercase');
		expect(stored.typesetCasing).toBe('original');
	});

	it('a variable font keeps any weight', () => {
		const eff = resolveEffectiveTypeset(
			{ typesetFont: 'Var', typesetFontWeight: '300', typesetCasing: 'uppercase' },
			catalog([font({ id: 'Var', isVariable: true })]),
		);
		expect(eff.weight).toBe('300');
	});

	it('a static font falls back to a weight it has', () => {
		const eff = resolveEffectiveTypeset(
			{ typesetFont: 'BoldOnly', typesetFontWeight: '400', typesetCasing: 'uppercase' },
			catalog([font({ id: 'BoldOnly', supportedWeights: ['bold'] })]),
		);
		expect(eff.weight).toBe('700');
	});

	it('a lowercase-only font yields lowercase', () => {
		const eff = resolveEffectiveTypeset(
			{ typesetFont: 'Lower', typesetFontWeight: '400', typesetCasing: 'uppercase' },
			catalog([font({ id: 'Lower', lowercaseOnly: true, supportedCasings: ['lowercase'] })]),
		);
		expect(eff.casing).toBe('lowercase');
	});
});
