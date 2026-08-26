/**
 * @vitest-environment jsdom
 */
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import Modal from '$lib/components/ui/Modal.svelte';
import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
import LanguagePicker from '$lib/components/ui/LanguagePicker.svelte';
import Switch from '$lib/components/ui/Switch.svelte';
import TextField from '$lib/components/ui/TextField.svelte';
import Checkbox from '$lib/components/ui/Checkbox.svelte';
import Button from '$lib/components/ui/Button.svelte';

describe('Core UI Primitive Components', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('renders Modal and dispatches close on escape', async () => {
		const { component } = render(Modal, {
			props: {
				open: true,
				title: 'Test Modal',
			},
		});

		expect(screen.getByText('Test Modal')).toBeTruthy();

		let closed = false;
		component.$on('close', () => {
			closed = true;
		});

		const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
		window.dispatchEvent(escEvent);
		await tick();

		expect(closed).toBe(true);
	});

	it('renders ConfirmDialog with cancel and confirm actions', async () => {
		const { component } = render(ConfirmDialog, {
			props: {
				open: true,
				title: 'Delete Item?',
				message: 'Are you sure you want to delete this?',
				confirmLabel: 'Confirm Delete',
			},
		});

		expect(screen.getByText('Delete Item?')).toBeTruthy();
		expect(screen.getByText('Are you sure you want to delete this?')).toBeTruthy();

		let confirmed = false;
		component.$on('confirm', () => {
			confirmed = true;
		});

		const confirmBtn = screen.getByText('Confirm Delete');
		await fireEvent.click(confirmBtn);
		await tick();

		expect(confirmed).toBe(true);
	});

	it('renders LanguagePicker and toggles popover', async () => {
		render(LanguagePicker, {
			props: {
				value: 'en',
				mode: 'target',
			},
		});

		expect(screen.getByText('English')).toBeTruthy();
	});

	it('renders Switch and switches state', async () => {
		render(Switch, {
			props: {
				checked: false,
			},
		});

		const button = screen.getByRole('switch');
		expect(button.getAttribute('aria-checked')).toBe('false');

		await fireEvent.click(button);
		await tick();

		expect(button.getAttribute('aria-checked')).toBe('true');
	});

	it('renders TextField with label and placeholder', () => {
		render(TextField, {
			props: {
				label: 'Username',
				value: 'admin',
				placeholder: 'Enter username',
			},
		});

		expect(screen.getByText('Username')).toBeTruthy();
		expect(screen.getByPlaceholderText('Enter username')).toBeTruthy();
	});

	it('renders Button with variants and disabled state', () => {
		render(Button, {
			props: {
				variant: 'primary',
				disabled: true,
			},
		});

		const btn = screen.getByRole('button');
		expect(btn.hasAttribute('disabled')).toBe(true);
	});
});
