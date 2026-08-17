// MODAL & DIALOG ESCAPE STACK MANAGER
// Guarantees that when multiple dialogs or sheets are stacked (e.g., ConfirmDialog over InspectModal, or EditModal over InspectModal),
// pressing the Escape key dismisses ONLY the topmost (deepest) active dialog in LIFO order.

type DismissFn = () => void;

interface StackItem {
	id: string;
	dismiss: DismissFn;
}

const activeModalStack: StackItem[] = [];
let isCapturingEscape = false;

function handleGlobalEscapeCapture(e: KeyboardEvent) {
	if (e.key !== 'Escape') return;
	if (activeModalStack.length === 0) return;

	// Stop propagation so other event listeners on window or elements do not fire simultaneously
	e.preventDefault();
	e.stopPropagation();
	e.stopImmediatePropagation();

	// Dismiss only the top-most dialog
	const top = activeModalStack[activeModalStack.length - 1];
	if (top) {
		top.dismiss();
	}
}

export function registerModalDismiss(id: string, dismiss: DismissFn): () => void {
	if (typeof window !== 'undefined' && !isCapturingEscape) {
		window.addEventListener('keydown', handleGlobalEscapeCapture, { capture: true });
		isCapturingEscape = true;
	}

	// Avoid duplicates
	const existingIdx = activeModalStack.findIndex((item) => item.id === id);
	if (existingIdx !== -1) {
		activeModalStack.splice(existingIdx, 1);
	}

	activeModalStack.push({ id, dismiss });

	return () => {
		unregisterModalDismiss(id);
	};
}

export function unregisterModalDismiss(id: string): void {
	const idx = activeModalStack.findIndex((item) => item.id === id);
	if (idx !== -1) {
		activeModalStack.splice(idx, 1);
	}

	if (activeModalStack.length === 0 && isCapturingEscape && typeof window !== 'undefined') {
		window.removeEventListener('keydown', handleGlobalEscapeCapture, { capture: true });
		isCapturingEscape = false;
	}
}
