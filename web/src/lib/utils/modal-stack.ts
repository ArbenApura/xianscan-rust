// MODAL & DIALOG ESCAPE STACK MANAGER
// GUARANTEES THAT WHEN MULTIPLE DIALOGS OR SHEETS ARE STACKED (E.G., CONFIRMATION DIALOG OVER SETTINGS MODAL),
// PRESSING THE ESCAPE KEY DISMISSES ONLY THE TOPMOST ACTIVE DIALOG IN LIFO ORDER.

// -- TYPES -- //

type DismissFn = () => void;

interface StackItem {
	id: string;
	dismiss: DismissFn;
}

// -- STATES -- //

const activeModalStack: StackItem[] = [];
let isListening = false;

// -- FUNCTIONS -- //

function handleGlobalEscape(e: KeyboardEvent) {
	// IME COMPOSITION USES ESCAPE TO CANCEL THE CANDIDATE, NOT TO CLOSE THE DIALOG
	if (e.isComposing || e.keyCode === 229) return;
	if (e.key !== 'Escape') return;
	if (e.defaultPrevented) return;
	if (activeModalStack.length === 0) return;

	// STOP PROPAGATION SO LOWER HANDLERS DO NOT ALSO DISMISS
	e.preventDefault();
	e.stopPropagation();

	// DISMISS ONLY THE TOP-MOST DIALOG
	const top = activeModalStack[activeModalStack.length - 1];
	if (top) {
		top.dismiss();
	}
}

export function registerModalDismiss(id: string, dismiss: DismissFn): () => void {
	if (typeof window !== 'undefined' && !isListening) {
		window.addEventListener('keydown', handleGlobalEscape);
		isListening = true;
	}

	// AVOID DUPLICATES
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

	if (activeModalStack.length === 0 && isListening && typeof window !== 'undefined') {
		window.removeEventListener('keydown', handleGlobalEscape);
		isListening = false;
	}
}
