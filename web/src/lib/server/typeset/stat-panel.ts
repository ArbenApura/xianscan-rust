// TYPESET REGION DEFINITIONS AND SFX HEURISTICS
// -- TYPES -- //

export interface TypesetBox {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface TypesetRegion {
	id: string;
	box: TypesetBox;
	bubble_box?: TypesetBox | null;
	centroid?: { x: number; y: number } | null;
	kind?: 'dialogue_bubble' | 'free_text' | 'sound_effect';
	text: string;
	vertical?: boolean;
	angle?: number;
}

// -- FUNCTIONS -- //

export function isSfxOrShout(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed) return false;
	if (trimmed.includes('\n')) return false;
	if (trimmed.includes('?') || trimmed.includes('？') || trimmed.includes(',') || trimmed.includes('，')) return false;

	const words = trimmed.split(/\s+/);
	if (words.length === 1) return true;
	if (words.length === 2 && trimmed.length <= 15) {
		const w1 = words[0].replace(/[^a-zA-Z]/g, '').toLowerCase();
		const w2 = words[1].replace(/[^a-zA-Z]/g, '').toLowerCase();
		if (w1 && w2 && (w1 === w2 || trimmed.endsWith('!') || trimmed.endsWith('！'))) {
			const commonDialogue = new Set([
				'lets', 'let', 'thank', 'thanks', 'help', 'stop', 'come', 'get', 'look',
				'wait', 'shut', 'dont', 'you', 'i', 'we', 'they', 'he', 'she', 'who', 'what',
				'where', 'when', 'why', 'how',
			]);
			if (commonDialogue.has(w1) || commonDialogue.has(w2)) {
				return false;
			}
			return true;
		}
	}
	return false;
}
