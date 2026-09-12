// -- DEP-MODULES -- //
import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';

// -- TYPES -- //
import type { PipelineRegion, PipelineBox } from './pipeline-client';

// -- CONSTANTS -- //
const COLOR_BUBBLE_STROKE = 'rgba(6, 182, 212, 0.90)';
const COLOR_BUBBLE_FILL = 'rgba(6, 182, 212, 0.10)';
const COLOR_OCR_STROKE = 'rgba(148, 163, 184, 0.95)';
const COLOR_OCR_FILL = 'rgba(148, 163, 184, 0.20)';
const COLOR_OCR_HATCH = 'rgba(148, 163, 184, 0.50)';
const COLOR_TYPESET_STROKE = 'rgba(178, 58, 46, 0.95)';
const COLOR_TYPESET_FILL = 'rgba(178, 58, 46, 0.20)';
const COLOR_ALIGN_GUIDE = 'rgba(178, 58, 46, 0.85)';
const COLOR_FREE_TEXT_STROKE = 'rgba(139, 92, 246, 0.90)';
const COLOR_FREE_TEXT_FILL = 'rgba(139, 92, 246, 0.16)';

// -- HELPER FUNCTIONS -- //
// COMPUTE INTERSECTION OVER UNION (IoU) OF TWO RECTANGLES
function computeBoxIoU(a: PipelineBox, b: PipelineBox): number {
	const x1 = Math.max(a.x, b.x);
	const y1 = Math.max(a.y, b.y);
	const x2 = Math.min(a.x + a.w, b.x + b.w);
	const y2 = Math.min(a.y + a.h, b.y + b.h);
	if (x2 <= x1 || y2 <= y1) return 0;
	const intersection = (x2 - x1) * (y2 - y1);
	const areaA = a.w * a.h;
	const areaB = b.w * b.h;
	const union = areaA + areaB - intersection;
	return union > 0 ? intersection / union : 0;
}

// CHECK IF THE CENTER POINT OF ONE BOX RESIDES INSIDE A CONTAINER BOX
function isCenterInsideBox(box: PipelineBox, container: PipelineBox): boolean {
	const cx = box.x + box.w / 2;
	const cy = box.y + box.h / 2;
	return (
		cx >= container.x - 2 &&
		cx <= container.x + container.w + 2 &&
		cy >= container.y - 2 &&
		cy <= container.y + container.h + 2
	);
}

// DETERMINE IF TWO REGIONS BELONG TO THE SAME DIALOGUE BUBBLE
function shareSameBubble(a: PipelineRegion, b: PipelineRegion): boolean {
	if (a === b) return true;

	if (a.bubble_box && b.bubble_box) {
		return computeBoxIoU(a.bubble_box, b.bubble_box) >= 0.5;
	}

	if (a.carrier_box && b.carrier_box) {
		return computeBoxIoU(a.carrier_box, b.carrier_box) >= 0.5;
	}

	if (a.bubble_box && isCenterInsideBox(b.box, a.bubble_box)) return true;
	if (b.bubble_box && isCenterInsideBox(a.box, b.bubble_box)) return true;

	if (a.carrier_box && isCenterInsideBox(b.box, a.carrier_box)) return true;
	if (b.carrier_box && isCenterInsideBox(a.box, b.carrier_box)) return true;

	const boxA = a.carrier_box || a.bubble_box;
	const boxB = b.carrier_box || b.bubble_box;
	if (boxA && boxB) {
		return computeBoxIoU(boxA, boxB) >= 0.5;
	}

	return false;
}

// DRAW 45-DEGREE DASHED DIAGONAL HATCH LINES FILLING A BOX
function drawDiagonalHatch(ctx: SKRSContext2D, box: PipelineBox, strokeColor: string, spacing = 12): void {
	ctx.save();
	ctx.beginPath();
	ctx.rect(box.x, box.y, box.w, box.h);
	ctx.clip();

	ctx.strokeStyle = strokeColor;
	ctx.lineWidth = 1.2;
	ctx.setLineDash([4, 4]);

	for (let offset = -box.h; offset <= box.w; offset += spacing) {
		ctx.beginPath();
		ctx.moveTo(box.x + offset, box.y + box.h);
		ctx.lineTo(box.x + offset + box.h, box.y);
		ctx.stroke();
	}

	ctx.restore();
}

// DRAW A SOLID CIRCULAR ANCHOR POINT
function drawCornerPoint(ctx: SKRSContext2D, x: number, y: number, radius = 3.0, color: string): void {
	ctx.save();
	ctx.beginPath();
	ctx.arc(x, y, radius, 0, Math.PI * 2);
	ctx.fillStyle = color;
	ctx.fill();
	ctx.restore();
}

// DRAW A RETICLE CROSSHAIR TARGET
function drawReticle(ctx: SKRSContext2D, cx: number, cy: number, radius: number, strokeColor: string): void {
	ctx.save();
	ctx.strokeStyle = strokeColor;
	ctx.lineWidth = 1.5;
	ctx.setLineDash([]);

	// INNER CIRCLE
	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2);
	ctx.stroke();

	// CENTER CROSS TICKS
	const tickLen = radius + 3;
	ctx.beginPath();
	ctx.moveTo(cx - tickLen, cy);
	ctx.lineTo(cx + tickLen, cy);
	ctx.moveTo(cx, cy - tickLen);
	ctx.lineTo(cx, cy + tickLen);
	ctx.stroke();
	ctx.restore();
}

// -- CORE EXPORTED FUNCTION -- //

/**
 * RENDERS THE LIVE OCR ANNOTATION PREVIEW IMAGE FEATURING:
 * - UNIFIED BLUE BUBBLE BOUNDARY (CARRIER CUT-TAIL OR DETECTED BUBBLE)
 * - TIGHT OCR TEXT DETECTION BOX
 * - CALCULATED TYPESET LAYOUT BOUNDARY
 * - FOUR-CORNER ALIGNMENT CONNECTING GUIDE LINES
 * - TYPESET CENTER CROSSHAIR RETICLE
 * - FREE TEXT BOUNDARY REGIONS
 */
export async function renderAnnotatedOcrImage(
	sourceImageBuffer: Buffer,
	regions: PipelineRegion[],
): Promise<Buffer> {
	const img = await loadImage(sourceImageBuffer);
	const canvas = createCanvas(img.width, img.height);
	const ctx = canvas.getContext('2d');

	// 1. DRAW BASE SOURCE IMAGE
	ctx.drawImage(img, 0, 0);

	// FILTER ALL DIALOGUE BUBBLE REGIONS FOR OCCUPANCY DETERMINATION
	const bubbleRegions = regions.filter(
		r => r.kind === 'dialogue_bubble' || Boolean(r.bubble_box) || Boolean(r.carrier_box)
	);

	// 2. RENDER REGION ANNOTATIONS
	for (const r of regions) {
		const isBubble = r.kind === 'dialogue_bubble' || Boolean(r.bubble_box) || Boolean(r.carrier_box);
		const angleDeg = r.angle ?? 0;
		const hasRotation = Math.abs(angleDeg) >= 2.0 && Math.abs(angleDeg) <= 45.0;

		ctx.save();

		if (hasRotation) {
			const rcx = r.box.x + r.box.w / 2;
			const rcy = r.box.y + r.box.h / 2;
			ctx.translate(rcx, rcy);
			ctx.rotate((angleDeg * Math.PI) / 180);
			ctx.translate(-rcx, -rcy);
		}

		if (isBubble) {
			// A. RESOLVE BUBBLE BOUNDARY (CARRIER CUT-TAIL PREFERRED OVER RAW BUBBLE, UNIFIED BLUE STYLE)
			const bubbleBox: PipelineBox = r.carrier_box || r.bubble_box || r.box;
			const bubbleTextsCount = bubbleRegions.filter(other => shareSameBubble(r, other)).length;
			const isSoleOccupant = bubbleTextsCount <= 1;

			// 1. RENDER BUBBLE CONTAINER (UNIFIED BLUE)
			ctx.fillStyle = COLOR_BUBBLE_FILL;
			ctx.fillRect(bubbleBox.x, bubbleBox.y, bubbleBox.w, bubbleBox.h);

			ctx.strokeStyle = COLOR_BUBBLE_STROKE;
			ctx.lineWidth = 2.0;
			ctx.setLineDash([]);
			ctx.strokeRect(bubbleBox.x, bubbleBox.y, bubbleBox.w, bubbleBox.h);

			// 2. RENDER OCR TIGHT TEXT BOUNDARY BOX (NEUTRAL GRAY DASHED WITH 45-DEGREE DIAGONAL HATCH)
			const ocrBox: PipelineBox = r.ocr_box || r.box;
			ctx.fillStyle = COLOR_OCR_FILL;
			ctx.fillRect(ocrBox.x, ocrBox.y, ocrBox.w, ocrBox.h);

			drawDiagonalHatch(ctx, ocrBox, COLOR_OCR_HATCH, 12);

			ctx.strokeStyle = COLOR_OCR_STROKE;
			ctx.lineWidth = 1.8;
			ctx.setLineDash([5, 4]);
			ctx.strokeRect(ocrBox.x, ocrBox.y, ocrBox.w, ocrBox.h);

			// 3. RENDER CALCULATED TYPESET BOUNDARY (CINNABAR RED)
			const typesetBox: PipelineBox = r.typeset_box || r.box;

			ctx.fillStyle = COLOR_TYPESET_FILL;
			ctx.fillRect(typesetBox.x, typesetBox.y, typesetBox.w, typesetBox.h);

			ctx.strokeStyle = COLOR_TYPESET_STROKE;
			ctx.lineWidth = 2.0;
			ctx.setLineDash([]);
			ctx.strokeRect(typesetBox.x, typesetBox.y, typesetBox.w, typesetBox.h);

			// 4. CORNER ALIGNMENT CONNECTING GUIDE LINES AND 4 CORNER POINTS
			// ONLY RENDER 4-POINT GUIDE LINES IF THERE IS ONLY ONE BUBBLE TEXT ON THIS BUBBLE
			if (isSoleOccupant) {
				ctx.save();
				ctx.strokeStyle = COLOR_ALIGN_GUIDE;
				ctx.lineWidth = 2.0;
				ctx.setLineDash([5, 3]);

				// TOP-LEFT
				ctx.beginPath();
				ctx.moveTo(typesetBox.x, typesetBox.y);
				ctx.lineTo(bubbleBox.x, bubbleBox.y);
				ctx.stroke();

				// TOP-RIGHT
				ctx.beginPath();
				ctx.moveTo(typesetBox.x + typesetBox.w, typesetBox.y);
				ctx.lineTo(bubbleBox.x + bubbleBox.w, bubbleBox.y);
				ctx.stroke();

				// BOTTOM-RIGHT
				ctx.beginPath();
				ctx.moveTo(typesetBox.x + typesetBox.w, typesetBox.y + typesetBox.h);
				ctx.lineTo(bubbleBox.x + bubbleBox.w, bubbleBox.y + bubbleBox.h);
				ctx.stroke();

				// BOTTOM-LEFT
				ctx.beginPath();
				ctx.moveTo(typesetBox.x, typesetBox.y + typesetBox.h);
				ctx.lineTo(bubbleBox.x, bubbleBox.y + bubbleBox.h);
				ctx.stroke();
				ctx.restore();

				// FOUR CORNER ANCHOR POINTS
				drawCornerPoint(ctx, typesetBox.x, typesetBox.y, 3.5, COLOR_TYPESET_STROKE);
				drawCornerPoint(ctx, typesetBox.x + typesetBox.w, typesetBox.y, 3.5, COLOR_TYPESET_STROKE);
				drawCornerPoint(ctx, typesetBox.x + typesetBox.w, typesetBox.y + typesetBox.h, 3.5, COLOR_TYPESET_STROKE);
				drawCornerPoint(ctx, typesetBox.x, typesetBox.y + typesetBox.h, 3.5, COLOR_TYPESET_STROKE);

				drawCornerPoint(ctx, bubbleBox.x, bubbleBox.y, 3.0, COLOR_ALIGN_GUIDE);
				drawCornerPoint(ctx, bubbleBox.x + bubbleBox.w, bubbleBox.y, 3.0, COLOR_ALIGN_GUIDE);
				drawCornerPoint(ctx, bubbleBox.x + bubbleBox.w, bubbleBox.y + bubbleBox.h, 3.0, COLOR_ALIGN_GUIDE);
				drawCornerPoint(ctx, bubbleBox.x, bubbleBox.y + bubbleBox.h, 3.0, COLOR_ALIGN_GUIDE);
			}

			// 5. TYPESET CENTER CROSSHAIR RETICLE
			const typesetCx = typesetBox.x + typesetBox.w / 2;
			const typesetCy = typesetBox.y + typesetBox.h / 2;
			drawReticle(ctx, typesetCx, typesetCy, 4.5, COLOR_TYPESET_STROKE);
		} else {
			// B. FREE TEXT REGION (NO SFX LABELS OR TEXT RENDERING)
			const freeBox: PipelineBox = r.ocr_box || r.box;
			ctx.fillStyle = COLOR_FREE_TEXT_FILL;
			ctx.fillRect(freeBox.x, freeBox.y, freeBox.w, freeBox.h);

			ctx.strokeStyle = COLOR_FREE_TEXT_STROKE;
			ctx.lineWidth = 1.8;
			ctx.setLineDash([]);
			ctx.strokeRect(freeBox.x, freeBox.y, freeBox.w, freeBox.h);
		}

		ctx.restore();
	}

	// 3. ENCODE COMPOSITE CANVAS TO WEBP BUFFER
	return await canvas.encode('webp', 85);
}
