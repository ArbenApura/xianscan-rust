// MATERIAL-STYLE RIPPLE ACTION FOR CLICKABLE ELEMENTS (use:ripple)
// IMPORTED DEP-TYPES
import type { Action } from 'svelte/action';

// -- TYPES -- //

export interface RippleOptions {
	disabled?: boolean;
	background?: string;
	opacity?: number;
	duration?: number;
	outDuration?: number;
}

// -- CONSTANTS -- //

const DEFAULTS = {
	background: 'rgb(150, 150, 150)',
	opacity: 0.4,
	duration: 450,
	outDuration: 550,
};

// -- STATES -- //

let stylesInjected = false;

// -- FUNCTIONS -- //

function injectStyles() {
	if (stylesInjected || typeof document === 'undefined') return;
	stylesInjected = true;
	const style = document.createElement('style');
	style.innerHTML =
		`.ripleParent__{pointer-events:none;overflow:hidden;background:transparent;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}` +
		`.riple__{border-radius:50%;position:absolute;will-change:transform;pointer-events:none;}` +
		`@keyframes ripple__{0%{transform:translate(-50%,-50%) scale(0);}100%{transform:translate(-50%,-50%) scale(1);}}`;
	document.head.appendChild(style);
}

function createHandler(el: HTMLElement, opts: typeof DEFAULTS) {
	function onPointerDown(e: PointerEvent) {
		if (getComputedStyle(el).position.toLowerCase() === 'static') {
			el.style.position = 'relative';
		}

		const rect = el.getBoundingClientRect();
		const cx = e.clientX - rect.left;
		const cy = e.clientY - rect.top;

		const parent = document.createElement('div');
		parent.className = 'ripleParent__';
		Object.assign(parent.style, {
			zIndex: '10',
			height: el.offsetHeight + 'px',
			width: el.offsetWidth + 'px',
			borderRadius: getComputedStyle(el).borderRadius,
			transition: `opacity ${opts.outDuration}ms linear`,
		});
		el.appendChild(parent);

		const dot = document.createElement('div');
		dot.className = 'riple__';
		const size = el.offsetWidth * Math.PI;
		Object.assign(dot.style, {
			top: cy + 'px',
			left: cx + 'px',
			opacity: String(opts.opacity),
			width: size + 'px',
			height: size + 'px',
			background: opts.background,
			animation: `ripple__ ${opts.duration}ms ease both`,
		});
		parent.appendChild(dot);

		let cleaned = false;
		function removeRipple() {
			if (cleaned) return;
			cleaned = true;
			parent.style.opacity = '0';
			setTimeout(() => {
				if (parent.parentNode === el) el.removeChild(parent);
			}, opts.outDuration);
			window.removeEventListener('pointerup', removeRipple);
			window.removeEventListener('pointercancel', removeRipple);
		}

		window.addEventListener('pointerup', removeRipple, { once: true });
		window.addEventListener('pointercancel', removeRipple, { once: true });
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
		if (!disabled) {
			instance = createHandler(node, {
				background: rest.background ?? DEFAULTS.background,
				opacity: rest.opacity ?? DEFAULTS.opacity,
				duration: rest.duration ?? DEFAULTS.duration,
				outDuration: rest.outDuration ?? DEFAULTS.outDuration,
			});
		}
	}

	apply();

	return {
		update(newOptions) {
			disabled = newOptions?.disabled ?? false;
			if (disabled && instance) {
				instance.destroy();
				instance = null;
			} else if (!disabled && !instance) {
				apply();
			}
		},
		destroy() {
			instance?.destroy();
		},
	};
};
