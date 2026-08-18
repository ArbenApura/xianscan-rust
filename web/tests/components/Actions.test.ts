/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { focusTrap } from '$lib/actions/focusTrap';
import { scrollLock } from '$lib/actions/scrollLock';
import { ripple } from '$lib/actions/ripple';

describe('Svelte Custom Actions (focusTrap, scrollLock, ripple)', () => {
	let container: HTMLDivElement;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('focusTrap traps Tab keyboard navigation within modal container', async () => {
		container.innerHTML = `
			<button id="btn1">Button 1</button>
			<input id="input1" type="text" />
			<button id="btn2">Button 2</button>
		`;

		const btn1 = container.querySelector('#btn1') as HTMLButtonElement;
		const btn2 = container.querySelector('#btn2') as HTMLButtonElement;

		const trap = focusTrap(container);

		// Trigger Tab keydown on the last element
		btn2.focus();
		const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false, cancelable: true });
		container.dispatchEvent(tabEvent);

		expect(tabEvent.defaultPrevented).toBe(true);

		trap.destroy();
	});

	it('scrollLock locks and unlocks document body position and class', () => {
		const lock = scrollLock(container);
		expect(document.documentElement.classList.contains('scroll-locked')).toBe(true);

		lock.destroy();
		expect(document.documentElement.classList.contains('scroll-locked')).toBe(false);
	});

	it('ripple attaches pointerdown listener and injects ripple container', () => {
		const btn = document.createElement('button');
		container.appendChild(btn);

		const r = ripple(btn);
		const pointerEvent = new Event('pointerdown', { bubbles: true }) as any;
		pointerEvent.pageX = 10;
		pointerEvent.pageY = 10;
		btn.dispatchEvent(pointerEvent);

		const rippleParent = btn.querySelector('.ripleParent__');
		expect(rippleParent).toBeTruthy();

		r.destroy();
	});
});
