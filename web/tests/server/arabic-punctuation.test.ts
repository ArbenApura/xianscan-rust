// ARABIC PUNCTUATION IN THE SFX HEURISTIC, PRE-FILTER AND PARSER (FEAT-007 PHASE 5)
import { describe, it, expect } from 'vitest';
import { classifyRegionForTranslation, resolveDialoguePunctuation } from '$lib/server/translate/filter';
import { sanitizeTranslationArtifacts } from '$lib/server/translate/parser';
import { isSfxOrShout } from '$lib/server/typeset/stat-panel';

describe('resolveDialoguePunctuation', () => {
	it('uses Arabic marks for an Arabic target', () => {
		expect(resolveDialoguePunctuation('？', 'ar')).toBe('؟');
		expect(resolveDialoguePunctuation('？！', 'ar')).toBe('؟!');
		expect(resolveDialoguePunctuation('...', 'ar')).toBe('...');
		expect(resolveDialoguePunctuation('？', 'en')).toBe('?');
	});

	it('keeps both call sites byte for byte without a target language', () => {
		// PRE-FILTER (normalize): UNCAPPED RUNS
		expect(resolveDialoguePunctuation('？？？？')).toBe('????');
		expect(resolveDialoguePunctuation('～')).toBe('~');
		// PIPELINE FALLBACK (strict): KNOWN SHAPES ONLY, RUNS CAPPED AT THREE
		expect(resolveDialoguePunctuation('？？？？', undefined, 'strict')).toBe('???');
		expect(resolveDialoguePunctuation('……！？', undefined, 'strict')).toBe('...?!');
		expect(resolveDialoguePunctuation('～', undefined, 'strict')).toBeNull();
		expect(resolveDialoguePunctuation('？？', 'ar', 'strict')).toBe('؟؟');
	});

	it('Arabic-only punctuation is a direct punctuation region', () => {
		expect(classifyRegionForTranslation({ text: '؟؟' } as never, 'zh-Hans', 'ar').disposition).toBe('direct_punctuation');
	});
});

describe('isSfxOrShout', () => {
	it('an Arabic question is not a shout, an exclamation still is', () => {
		expect(isSfxOrShout('نعم؟')).toBe(false);
		expect(isSfxOrShout('نعم، حسنا')).toBe(false);
		expect(isSfxOrShout('بوم!')).toBe(true);
	});
});

describe('sanitizeTranslationArtifacts', () => {
	it('restores the full stop of a declarative source in Arabic', () => {
		expect(sanitizeTranslationArtifacts('مرحبا؟', '你好。')).toBe('مرحبا.');
	});

	it('keeps a real question', () => {
		expect(sanitizeTranslationArtifacts('حقا؟', '真的吗？')).toBe('حقا؟');
	});
});
