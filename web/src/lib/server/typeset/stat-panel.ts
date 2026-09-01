// STAT PANEL PARSING AND TEXT SEGMENTATION
import { FONT_FALLBACK_NAME, fontFor, fontSpec, drawTextLineWithRuns, type TextColor } from './fonts';
import type { SKRSContext2D } from '@napi-rs/canvas';

export type SegmentKind = 'title' | 'rarity' | 'subtitle' | 'body' | 'flavour';

export interface TextSegment {
	kind: SegmentKind;
	text: string;
}

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

export const RARITY_KEYWORDS = new Set([
	'LEGENDARY', 'MYTHIC', 'DIVINE', 'EPIC', 'RARE', 'FINE', 'UNCOMMON', 'COMMON',
	'TRANSCENDENT', 'IMMORTAL', 'SACRED', 'ANCIENT', 'UNIQUE',
]);

const BOX_INSET = 0.05;
const MIN_FONT_SIZE = 6;
const LINE_HEIGHT = 1.2;
const OUTLINE_FACTOR = 0.18;
const OUTLINE_MIN = 2.5;

function _classifyLine(line: string): TextSegment[] {
	if (/^\(.+\)$/.test(line)) return [{ kind: 'subtitle', text: line }];
	if (line.startsWith('*')) return [{ kind: 'flavour', text: line }];
	const fw = line.split(/\s+/)[0].toUpperCase();
	if (RARITY_KEYWORDS.has(fw)) return [{ kind: 'rarity', text: line.toUpperCase() }];
	return [{ kind: 'body', text: line }];
}

export function parseStatPanel(text: string): TextSegment[] | null {
	const rawLines = text.split('\n').map((l) => l.trim()).filter(Boolean);
	if (rawLines.length === 0) return null;

	// REJECT SPEAKER TAGS (E.G. "[CLIMBER 123]:", "[WHISPER]:")
	if (/^(\[|【).+[:：]$/.test(rawLines[0])) {
		return null;
	}

	const hasCjkBracket = /^【.+】$/.test(rawLines[0]);
	const hasAsciiBracket = /^\[.+\]$/.test(rawLines[0]);
	if (hasCjkBracket || hasAsciiBracket) {
		const segments: TextSegment[] = [
			{ kind: 'title', text: rawLines[0] },
		];
		for (let i = 1; i < rawLines.length; i++) {
			segments.push(..._classifyLine(rawLines[i]));
		}

		// FOR MULTI-LINE TEXT, REQUIRE AT LEAST ONE NON-BODY OR STRUCTURED ATTRIBUTE SEGMENT
		if (rawLines.length > 1) {
			const hasStructuredChild = segments.slice(1).some(
				(s) => s.kind !== 'body' || /^[a-zA-Z\u4e00-\u9fa5\s]{1,25}[:：]/.test(s.text),
			);
			if (!hasStructuredChild) {
				return null;
			}
		}

		return segments;
	}

	const firstWord = rawLines[0].split(/\s+/)[0].toUpperCase();
	if (RARITY_KEYWORDS.has(firstWord) && rawLines.length >= 2) {
		return rawLines.map((l) => _classifyLine(l)[0]);
	}

	return null;
}

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
