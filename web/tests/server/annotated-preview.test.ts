// -- ANNOTATED OCR PREVIEW GENERATOR UNIT TESTS -- //
import { describe, it, expect } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { renderAnnotatedOcrImage } from '../../src/lib/server/annotated-preview';

describe('Annotated OCR Preview Generator', () => {
	function createSampleImageBuffer(width = 400, height = 600): Buffer {
		const canvas = createCanvas(width, height);
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, width, height);
		return canvas.toBuffer('image/png');
	}

	it('renders valid WebP buffer with no detected regions without throwing', async () => {
		const buf = createSampleImageBuffer();
		const result = await renderAnnotatedOcrImage(buf, []);
		expect(result).toBeInstanceOf(Buffer);
		expect(result.length).toBeGreaterThan(0);
	});

	it('renders unified blue bubble boundary, base text detection, and typeset alignment reticle', async () => {
		const buf = createSampleImageBuffer(500, 700);
		const regions: any[] = [
			{
				id: 'reg-1',
				box: { x: 50, y: 60, w: 200, h: 100 },
				typeset_box: { x: 45, y: 55, w: 210, h: 110 },
				bubble_box: { x: 30, y: 40, w: 240, h: 140 },
				carrier_box: { x: 35, y: 45, w: 230, h: 130 },
				text: 'Sample bubble dialogue text',
				kind: 'dialogue_bubble'
			}
		];

		const result = await renderAnnotatedOcrImage(buf, regions);
		expect(result).toBeInstanceOf(Buffer);
		expect(result.length).toBeGreaterThan(100);
	});

	it('renders fallback bubble box cleanly when carrier box is not present', async () => {
		const buf = createSampleImageBuffer(500, 700);
		const regions: any[] = [
			{
				id: 'reg-2',
				box: { x: 100, y: 100, w: 150, h: 80 },
				typeset_box: { x: 100, y: 100, w: 150, h: 80 },
				bubble_box: { x: 80, y: 80, w: 190, h: 120 },
				text: 'Centered bubble text',
				kind: 'dialogue_bubble'
			}
		];

		const result = await renderAnnotatedOcrImage(buf, regions);
		expect(result).toBeInstanceOf(Buffer);
		expect(result.length).toBeGreaterThan(100);
	});

	it('renders free text regions cleanly without labels or OCR text rendering', async () => {
		const buf = createSampleImageBuffer(500, 700);
		const regions: any[] = [
			{
				id: 'reg-3',
				box: { x: 200, y: 300, w: 80, h: 50 },
				text: 'FREE TEXT',
				kind: 'free_text'
			}
		];

		const result = await renderAnnotatedOcrImage(buf, regions);
		expect(result).toBeInstanceOf(Buffer);
		expect(result.length).toBeGreaterThan(100);
	});
});
