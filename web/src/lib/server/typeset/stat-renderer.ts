// STAT PANEL CANVAS RENDERER
import type { SKRSContext2D } from '@napi-rs/canvas';
import { fontFor, fontSpec, drawTextLineWithRuns, FONT_FALLBACK_NAME, type TextColor } from './fonts';
import { balancedWrapText } from './layout';
import type { SegmentKind, TextSegment, TypesetRegion } from './stat-panel';

const BOX_INSET = 0.05;
const MIN_FONT_SIZE = 6;
const LINE_HEIGHT = 1.2;
const OUTLINE_FACTOR = 0.18;
const OUTLINE_MIN = 2.5;

export function typesetStatPanel(
	ctx: SKRSContext2D | CanvasRenderingContext2D,
	r: TypesetRegion,
	segments: TextSegment[],
	bgColor: TextColor,
	customCjk?: string,
): void {
	const { x, y, w, h } = r.box;
	const insetW = Math.max(10, w * (1 - 2 * BOX_INSET));
	const insetH = Math.max(10, h * (1 - 2 * BOX_INSET));

	const SEG_SCALE: Record<SegmentKind, number> = {
		title:    segments.length === 1 ? 1.0 : 1.30,
		rarity:   1.15,
		subtitle: 0.80,
		body:     1.00,
		flavour:  0.80,
	};

	const gap = Math.max(2, h * 0.012);
	const gapTotal = gap * (segments.length - 1);
	const BRACKET_GUTTER_RATIO = 0.40;

	function totalAtBase(base: number): number {
		let h2 = gapTotal;
		for (const seg of segments) {
			const sz = Math.max(MIN_FONT_SIZE, Math.round(base * SEG_SCALE[seg.kind]));
			const segFont = fontFor(seg.text, undefined, customCjk);
			ctx.font = fontSpec(sz, segFont, seg.text, customCjk);
			if (seg.kind === 'title') {
				const maxTitleW = insetW - sz * BRACKET_GUTTER_RATIO;
				const textFits = ctx.measureText(seg.text).width <= Math.max(10, maxTitleW);
				if (!textFits) return Infinity;

				h2 += sz * LINE_HEIGHT;
			} else {
				const lines = balancedWrapText(ctx, seg.text, insetW);
				h2 += lines.length * sz * LINE_HEIGHT;
			}
		}
		return h2;
	}

	let lo = MIN_FONT_SIZE;
	let hi = 80;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (totalAtBase(mid) <= insetH) lo = mid;
		else hi = mid - 1;
	}
	const baseSize = lo;

	type MeasuredSeg = { seg: TextSegment; lines: string[]; size: number; color: string; stroke: string; font: string };
	const measured: MeasuredSeg[] = [];
	let totalH = gapTotal;

	for (const seg of segments) {
		const size = Math.max(MIN_FONT_SIZE, Math.round(baseSize * SEG_SCALE[seg.kind]));
		const segFont = fontFor(seg.text, undefined, customCjk);
		ctx.font = fontSpec(size, segFont, seg.text, customCjk);
		const lines = seg.kind === 'title' ? [seg.text] : balancedWrapText(ctx, seg.text, insetW);
		totalH += lines.length * size * LINE_HEIGHT;

		measured.push({ seg, lines, size, color: bgColor.fill, stroke: bgColor.stroke, font: segFont });
	}

	const angleDeg = r.angle ?? 0;
	const hasRotation = Math.abs(angleDeg) >= 2.0;

	ctx.save();
	if (hasRotation) {
		const cx = x + w / 2;
		const cy = y + h / 2;
		ctx.translate(cx, cy);
		ctx.rotate((angleDeg * Math.PI) / 180);
	}

	const renderH = Math.min(totalH, insetH);
	let ty = hasRotation ? -renderH / 2 : y + (h - renderH) / 2;

	for (let i = 0; i < measured.length; i++) {
		const { lines, size, color, stroke, font: segFont } = measured[i];
		const lineH = size * LINE_HEIGHT;
		const tx = hasRotation ? 0 : x + w / 2;
		const isDarkStroke = stroke === 'black' || stroke === '#000000' || stroke === '#111111';
		const strokeWidth = Math.max(OUTLINE_MIN, size * OUTLINE_FACTOR);

		for (const line of lines) {
			const drawY = ty + size * 0.85;
			drawTextLineWithRuns(
				ctx,
				line,
				tx,
				drawY,
				size,
				segFont,
				customCjk || FONT_FALLBACK_NAME,
				{ fill: color, stroke },
				strokeWidth,
				isDarkStroke,
				customCjk,
				'center',
			);
			ty += lineH;
		}
		if (i < measured.length - 1) ty += gap;
	}
	ctx.restore();
}
