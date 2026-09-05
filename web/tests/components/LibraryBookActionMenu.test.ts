/**
 * @vitest-environment jsdom
 */
// -- EXTERNAL IMPORTS -- //
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import BookOpen from 'lucide-svelte/icons/book-open';
import ScrollText from 'lucide-svelte/icons/scroll-text';
import ExternalLink from 'lucide-svelte/icons/external-link';
import Pencil from 'lucide-svelte/icons/pencil';

// -- INTERNAL IMPORTS -- //
import ActionMenu from '$lib/components/ui/ActionMenu.svelte';

describe('Library Book ActionMenu Items', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('renders Glossary and Directives in the menu items list and dispatches select events', async () => {
		const selectHandler = vi.fn();

		const { component } = render(ActionMenu, {
			props: {
				items: [
					{ value: 'open', label: 'Open Book', icon: ExternalLink },
					{ value: 'glossary', label: 'Glossary', icon: BookOpen },
					{ value: 'directives', label: 'Directives', icon: ScrollText },
					{ value: 'edit', label: 'Edit Book Details', icon: Pencil },
				],
			},
		});

		component.$on('select', (e: CustomEvent<string>) => {
			selectHandler(e.detail);
		});

		// OPEN THE MENU POPOVER
		const trigger = screen.getByRole('button', { name: 'Actions' });
		await fireEvent.click(trigger);
		await tick();
		await tick();

		// VERIFY GLOSSARY AND DIRECTIVES ARE PRESENT IN DOCUMENT BODY (PORTALED)
		const glossaryBtn = screen.getByText('Glossary');
		const directivesBtn = screen.getByText('Directives');

		expect(glossaryBtn).toBeTruthy();
		expect(directivesBtn).toBeTruthy();

		// CLICK GLOSSARY OPTION
		await fireEvent.click(glossaryBtn);
		await tick();
		await tick();

		expect(selectHandler).toHaveBeenCalledWith('glossary');

		// RE-OPEN MENU AND CLICK DIRECTIVES
		await fireEvent.click(trigger);
		await tick();
		await tick();

		const directivesBtnSecond = screen.getByText('Directives');
		await fireEvent.click(directivesBtnSecond);
		await tick();
		await tick();

		expect(selectHandler).toHaveBeenCalledWith('directives');
	});
});
