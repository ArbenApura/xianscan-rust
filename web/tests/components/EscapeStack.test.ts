/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import Modal from '$lib/components/ui/Modal.svelte';
import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
import LanguagePicker from '$lib/components/ui/LanguagePicker.svelte';
import TagInput from '$lib/components/ui/TagInput.svelte';
import EditRegionTranslationModal from '$lib/components/chapter/EditRegionTranslationModal.svelte';

// REGRESSION TESTS FOR THE DEPTH-AWARE ESCAPE STACK: BUSY DIALOGS SWALLOW ESCAPE, NESTED WIDGETS
// (DROPDOWNS, DRAFT INPUTS) CONSUME THEIR OWN ESCAPE, AND IME COMPOSITION NEVER DISMISSES ANYTHING.

function escape(target: EventTarget = window, init: KeyboardEventInit = {}) {
	const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...init });
	target.dispatchEvent(ev);
	return ev;
}

function openBaseModal() {
	const { component } = render(Modal, { props: { open: true, title: 'Base Modal' } });
	const onClose = vi.fn();
	component.$on('close', onClose);
	return { component, onClose };
}

describe('Escape stack', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('ignores Escape while an IME composition is active', async () => {
		const { onClose } = openBaseModal();

		escape(window, { isComposing: true });
		escape(window, { keyCode: 229 });
		await tick();
		expect(onClose).not.toHaveBeenCalled();

		escape();
		await tick();
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('non-closable Modal stays on the stack and shields the layer underneath', async () => {
		const base = openBaseModal();
		const { component: busy } = render(Modal, { props: { open: true, title: 'Busy', closable: false } });
		const onBusyClose = vi.fn();
		busy.$on('close', onBusyClose);

		escape();
		await tick();
		expect(onBusyClose).not.toHaveBeenCalled();
		expect(base.onClose).not.toHaveBeenCalled();

		// ONCE IT BECOMES CLOSABLE, ESCAPE CLOSES IT (AND ONLY IT)
		busy.$set({ closable: true });
		await tick();
		escape();
		await tick();
		expect(onBusyClose).toHaveBeenCalledTimes(1);
		expect(base.onClose).not.toHaveBeenCalled();
	});

	it('loading ConfirmDialog swallows Escape instead of closing the modal underneath', async () => {
		const base = openBaseModal();
		const { component: dialog } = render(ConfirmDialog, {
			props: { open: true, title: 'Delete?', loading: true },
		});
		const onCancel = vi.fn();
		dialog.$on('cancel', onCancel);

		escape();
		await tick();
		expect(onCancel).not.toHaveBeenCalled();
		expect(base.onClose).not.toHaveBeenCalled();
		expect(screen.getByText('Delete?')).toBeTruthy();

		dialog.$set({ loading: false });
		await tick();
		escape();
		await tick();
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(base.onClose).not.toHaveBeenCalled();
	});

	it('saving EditRegionTranslationModal swallows Escape instead of closing the modal underneath', async () => {
		const base = openBaseModal();
		// A SAVE THAT NEVER RESOLVES KEEPS THE DIALOG IN ITS BUSY STATE
		global.fetch = vi.fn(() => new Promise<Response>(() => {})) as typeof fetch;
		const { component: editor } = render(EditRegionTranslationModal, {
			props: {
				open: true,
				pageId: 1,
				region: { id: 10, seq: 0, textSource: 'src', textTarget: 'Hello', originalTarget: 'Hello' },
			},
		});
		const onEditorClose = vi.fn();
		editor.$on('close', onEditorClose);

		await fireEvent.click(screen.getByText('Save'));
		await tick();
		expect(global.fetch).toHaveBeenCalledTimes(1);

		escape();
		await tick();
		expect(onEditorClose).not.toHaveBeenCalled();
		expect(base.onClose).not.toHaveBeenCalled();
	});

	it('LanguagePicker Escape closes only the dropdown, not the surrounding modal', async () => {
		const base = openBaseModal();
		const { container } = render(LanguagePicker, { props: { value: 'en', mode: 'target' } });
		const trigger = container.querySelector('[aria-haspopup="listbox"]') as HTMLButtonElement;

		await fireEvent.click(trigger);
		await tick();
		expect(trigger.getAttribute('aria-expanded')).toBe('true');

		// THE PORTALED SEARCH INPUT NEEDS onMount (WHICH DOES NOT FIRE UNDER THIS HARNESS), SO FIRE FROM THE BODY
		const ev = escape(document.body);
		await tick();
		expect(ev.defaultPrevented).toBe(true);
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(base.onClose).not.toHaveBeenCalled();

		// WITH THE DROPDOWN CLOSED, THE NEXT ESCAPE REACHES THE MODAL
		escape(document.body);
		await tick();
		expect(base.onClose).toHaveBeenCalledTimes(1);
	});

	it('TagInput Escape clears a draft first, then lets Escape close the modal', async () => {
		const base = openBaseModal();
		render(TagInput, { props: { value: [], placeholder: 'Add a genre' } });
		const input = screen.getByPlaceholderText('Add a genre') as HTMLInputElement;

		await fireEvent.input(input, { target: { value: 'Wuxia' } });
		expect(input.value).toBe('Wuxia');

		const first = escape(input);
		await tick();
		expect(first.defaultPrevented).toBe(true);
		expect(input.value).toBe('');
		expect(base.onClose).not.toHaveBeenCalled();

		const second = escape(input);
		await tick();
		expect(second.defaultPrevented).toBe(true);
		expect(base.onClose).toHaveBeenCalledTimes(1);
	});
});
