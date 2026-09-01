// COLOR LUMINANCE AND BACKGROUND SAMPLING
import { createCanvas, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import type { TextColor } from './fonts';

function luminance(r: number, g: number, b: number): number {
	const lin = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function pickTextColor(bg: { r: number; g: number; b: number }): TextColor {
	return luminance(bg.r, bg.g, bg.b) < 0.18
		? { fill: 'white', stroke: 'black' }
		: { fill: 'black', stroke: 'white' };
}

export function sampleBackground(
	source: SKRSContext2D | Image,
	x: number,
	y: number,
	w: number,
	h: number,
): { r: number; g: number; b: number } {
	const srcW = 'canvas' in source ? source.canvas.width : source.width;
	const srcH = 'canvas' in source ? source.canvas.height : source.height;

	let sx = Math.max(0, Math.floor(x + w * 0.2));
	let sy = Math.max(0, Math.floor(y + h * 0.2));
	let ex = Math.min(srcW, Math.ceil(x + w * 0.8));
	let ey = Math.min(srcH, Math.ceil(y + h * 0.8));
	let cw = ex - sx;
	let ch = ey - sy;

	// IF INSET SAMPLING REGION COLLAPSES, FALLBACK TO FULL BOUNDING BOX
	if (cw < 1 || ch < 1) {
		sx = Math.max(0, Math.floor(x));
		sy = Math.max(0, Math.floor(y));
		ex = Math.min(srcW, Math.ceil(x + w));
		ey = Math.min(srcH, Math.ceil(y + h));
		cw = ex - sx;
		ch = ey - sy;
		if (cw < 1 || ch < 1) return { r: 255, g: 255, b: 255 };
	}

	let data: Uint8ClampedArray;
	if ('getImageData' in source) {
		data = source.getImageData(sx, sy, cw, ch).data;
	} else {
		const probe = createCanvas(cw, ch);
		const pctx = probe.getContext('2d');
		pctx.drawImage(source, sx, sy, cw, ch, 0, 0, cw, ch);
		data = pctx.getImageData(0, 0, cw, ch).data;
	}

	let r = 0;
	let g = 0;
	let b = 0;
	const n = cw * ch;
	for (let i = 0; i < data.length; i += 4) {
		r += data[i];
		g += data[i + 1];
		b += data[i + 2];
	}
	return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}
