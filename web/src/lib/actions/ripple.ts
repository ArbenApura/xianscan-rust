// MATERIAL-STYLE RIPPLE ACTION FOR CLICKABLE ELEMENTS (use:ripple).
// ON POINTER-DOWN IT SPAWNS AN EXPANDING CIRCLE FROM THE CLICK POINT, CLIPPED TO THE ELEMENT'S
// BORDER-RADIUS, THEN FADES IT OUT ON RELEASE. KEYFRAMES ARE INJECTED ONCE INTO <head> AT RUNTIME
// (NOT A COMPONENT <style> BLOCK) SO EVERY use:ripple SHARES ONE STYLESHEET.

// IMPORTED DEP-TYPES
import type { Action } from 'svelte/action';

// -- TYPES -- //

export interface RippleOptions {
	// SKIP THE EFFECT ENTIRELY (E.G. DISABLED BUTTONS)
	disabled?: boolean;
	background?: string;
	opacity?: number;
	zIndex?: number;
	duration?: number;
	outDuration?: number;
	timing?: string;
	width?: string;
	height?: string;
	// FIRE WHEN A CHILD (NOT JUST THE BOUND ELEMENT) IS THE EVENT TARGET
	triggerOnChild?: boolean;
	// TARGETS THAT SHOULD NOT TRIGGER THE RIPPLE
	triggerExcept?: NodeList | HTMLCollection | Element | string;
}

type ResolvedOptions = Required<Omit<RippleOptions, 'disabled'>>;

// -- CONSTANTS -- //

// NEUTRAL GREY READS CORRECTLY ON BOTH LIGHT AND DARK SURFACES — KEEP IT THEME-AGNOSTIC.
const DEFAULTS: ResolvedOptions = {
	background: 'rgb(150,150,150)',
	opacity: 0.5,
	zIndex: 10,
	duration: 500,
	outDuration: 600,
	timing: 'ease',
	width: '',
	height: '',
	triggerOnChild: true,
	triggerExcept: '',
};

// -- STATES -- //

let stylesInjected = false;

// -- FUNCTIONS -- //

function injectStyles() {
	if (stylesInjected) return;
	stylesInjected = true;
	const style = document.createElement('style');
	style.innerHTML =
		`.ripleParent__{pointer-events:none;overflow:hidden;background:transparent;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}` +
		`.riple__{border-radius:50%;position:absolute;will-change:transform;pointer-events:none;}` +
		`@keyframes ripple__{0%{transform:translate(-50%,-50%) scale(0);}100%{transform:translate(-50%,-50%) scale(1);}}`;
	document.head.appendChild(style);
}

function computedProp(el: HTMLElement, prop: string): string {
	const key = prop.startsWith('-') ? prop : prop.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
	return getComputedStyle(el).getPropertyValue(key);
}

function offset(el: HTMLElement) {
	const doc = el.ownerDocument;
	const box = el.getBoundingClientRect();
	return {
		top: box.top + window.pageYOffset - doc.documentElement.clientTop,
		left: box.left + window.pageXOffset - doc.documentElement.clientLeft,
	};
}

function resolveExceptions(selector: RippleOptions['triggerExcept'], parent: HTMLElement): Element[] {
	if (!selector) return [];
	if (selector instanceof NodeList || selector instanceof HTMLCollection) return Array.from(selector) as Element[];
	if (selector instanceof Element) return [selector];
	return Array.from(parent.querySelectorAll(selector));
}

function resolveOpts(opts: RippleOptions): ResolvedOptions {
	return {
		background: opts.background ?? DEFAULTS.background,
		opacity: opts.opacity ?? DEFAULTS.opacity,
		zIndex: opts.zIndex ?? DEFAULTS.zIndex,
		duration: opts.duration ?? DEFAULTS.duration,
		outDuration: opts.outDuration ?? DEFAULTS.outDuration,
		timing: opts.timing ?? DEFAULTS.timing,
		width: opts.width ?? DEFAULTS.width,
		height: opts.height ?? DEFAULTS.height,
		triggerOnChild: opts.triggerOnChild ?? DEFAULTS.triggerOnChild,
		triggerExcept: opts.triggerExcept ?? DEFAULTS.triggerExcept,
	};
}

function createHandler(el: HTMLElement, opts: ResolvedOptions) {
	const { background, opacity, zIndex, duration, outDuration, timing, width, height, triggerOnChild, triggerExcept } =
		opts;

	function onPointerDown(e: PointerEvent) {
		const exceptions = resolveExceptions(triggerExcept, el);
		if (exceptions.includes(e.target as Element)) return;
		if (e.target !== el && !triggerOnChild) return;

		const pos = offset(el);
		const cx = e.pageX - pos.left;
		const cy = e.pageY - pos.top;

		// THE EFFECT NEEDS A POSITIONED ANCESTOR — PROMOTE STATIC ELEMENTS TO relative.
		if (computedProp(el, 'position').toLowerCase() === 'static') el.style.position = 'relative';

		const { offsetWidth, offsetHeight } = el;
		const parent = document.createElement('div');
		parent.className = 'ripleParent__';
		Object.assign(parent.style, {
			zIndex: String(zIndex),
			height: offsetHeight + 'px',
			width: offsetWidth + 'px',
			borderRadius: computedProp(el, 'borderRadius'),
			clipPath: computedProp(el, 'clipPath'),
			transition: `opacity ${outDuration}ms linear`,
		});
		el.appendChild(parent);

		const dot = document.createElement('div');
		dot.className = 'riple__';
		Object.assign(dot.style, {
			top: cy + 'px',
			left: cx + 'px',
			opacity: String(opacity),
			width: width || offsetWidth * Math.PI + 'px',
			height: height || offsetWidth * Math.PI + 'px',
			background,
			animation: `ripple__ ${duration}ms ${timing} both`,
		});
		parent.appendChild(dot);

		let cleaned = false;
		function removeRipple() {
			if (cleaned) return;
			cleaned = true;
			parent.style.opacity = '0';
			setTimeout(() => {
				if (parent.parentNode === el) el.removeChild(parent);
			}, outDuration);
			window.removeEventListener('pointerup', removeRipple);
			window.removeEventListener('pointercancel', removeRipple);
			el.removeEventListener('pointerleave', removeRipple);
		}

		window.addEventListener('pointerup', removeRipple, { once: true });
		window.addEventListener('pointercancel', removeRipple, { once: true });
		el.addEventListener('pointerleave', removeRipple, { once: true });

		// SAFETY TIMEOUT: GUARANTEES REMOVAL EVEN IF EVENTS ARE INTERCEPTED BY MODALS OR NAVIGATION
		setTimeout(removeRipple, duration + outDuration + 100);
	}

	el.addEventListener('pointerdown', onPointerDown);
	return {
		destroy() {
			el.removeEventListener('pointerdown', onPointerDown);
		},
	};
}

export const ripple: Action<HTMLElement, RippleOptions | undefined> = (node, options = {}) => {
	injectStyles();
	let { disabled = false, ...rest } = options ?? {};
	let instance: { destroy(): void } | null = null;

	function apply() {
		if (!disabled) instance = createHandler(node, resolveOpts(rest));
	}

	apply();

	return {
		update(params: RippleOptions | undefined) {
			const { disabled: newDisabled = false, ...newRest } = params ?? {};
			disabled = newDisabled;
			rest = newRest;
			if (disabled && instance) {
				instance.destroy();
				instance = null;
			} else if (!instance && !disabled) {
				apply();
			} else if (instance && !disabled) {
				// OPTIONS CHANGED — RESTART WITH THE NEW OPTIONS
				instance.destroy();
				instance = createHandler(node, resolveOpts(rest));
			}
		},
		destroy() {
			instance?.destroy();
			node.querySelectorAll('.ripleParent__').forEach((el) => el.remove());
		},
	};
};
