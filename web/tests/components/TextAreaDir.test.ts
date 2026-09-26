/**
 * @vitest-environment jsdom
 */
import { render, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import TextArea from '$lib/components/ui/TextArea.svelte';

afterEach(() => cleanup());

describe('TextArea (FEAT-007)', () => {
	it('lets the browser pick the text direction', () => {
		const { container } = render(TextArea, { props: { value: 'مرحبا' } });
		expect(container.querySelector('textarea')?.getAttribute('dir')).toBe('auto');
	});
});
