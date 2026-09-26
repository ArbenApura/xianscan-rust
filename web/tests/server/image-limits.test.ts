// IMPORTED DEP-MODULES
import { describe, it, expect, vi } from 'vitest';
import { deflateSync } from 'node:zlib';
import { createCanvas } from '@napi-rs/canvas';
import * as napiImage from '@napi-rs/image';
// IMPORTED MODULES
import { getImageDimensionsFromBuffer } from '$lib/server/chapters/dimensions';
import {
	MAX_UNKNOWN_FORMAT_BYTES,
	assertDecodeAllowed,
	assertImageWithinLimits,
	readImageDims,
} from '$lib/server/image-limits';

// -- HELPERS -- //

function crc32(bytes: Buffer): number {
	let crc = 0xffffffff;
	for (const b of bytes) {
		crc ^= b;
		for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}

/** PNG SIGNATURE + IHDR CLAIMING width x height, THEN A TINY (WRONG) IDAT: NEVER DECODABLE AT THAT SIZE. */
function pngHeader(width: number, height: number, chunkName = 'IHDR'): Buffer {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8;
	ihdr[9] = 2;
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk(chunkName, ihdr),
		chunk('IDAT', deflateSync(Buffer.alloc(16))),
		chunk('IEND', Buffer.alloc(0)),
	]);
}

/** MINIMAL JPEG: SOI, AN APP0 SEGMENT, THEN A FRAME HEADER WITH THE GIVEN SOF MARKER. */
function jpegWithSof(marker: number, width: number, height: number): Buffer {
	const app0 = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14)]);
	const sof = Buffer.from([0xff, marker, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03]);
	return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(12)]);
}

// WRAP THE REAL CONSTRUCTOR SO TESTS CAN ASSERT WHETHER A DECODE WAS ATTEMPTED
vi.mock('@napi-rs/image', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@napi-rs/image')>();
	return {
		...actual,
		Transformer: vi.fn(function (this: unknown, ...args: ConstructorParameters<typeof actual.Transformer>) {
			return new actual.Transformer(...args);
		}),
	};
});

// -- TESTS -- //

describe('header dimension parsing', () => {
	it('reads PNG dimensions only from a real IHDR chunk', () => {
		expect(getImageDimensionsFromBuffer(pngHeader(640, 480))).toEqual({ width: 640, height: 480 });
		expect(getImageDimensionsFromBuffer(pngHeader(640, 480, 'XXXX'))).toEqual({ width: null, height: null });
	});

	it.each([
		['SOF0 baseline', 0xc0],
		['SOF2 progressive', 0xc2],
		['SOF3 lossless', 0xc3],
		['SOF9 arithmetic', 0xc9],
	])('reads JPEG %s frames', (_name, marker) => {
		expect(getImageDimensionsFromBuffer(jpegWithSof(marker, 1234, 5678))).toEqual({ width: 1234, height: 5678 });
	});

	it('does not treat DHT (C4) as a frame header', () => {
		expect(getImageDimensionsFromBuffer(jpegWithSof(0xc4, 10, 10))).toEqual({ width: null, height: null });
	});

	it('does not throw on a truncated JPEG', () => {
		const full = jpegWithSof(0xc0, 800, 600);
		for (let len = 24; len < full.length; len++) {
			expect(() => getImageDimensionsFromBuffer(full.subarray(0, len))).not.toThrow();
		}
	});

	it('reads GIF and BMP headers without decoding', async () => {
		const gif = Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.from([0x20, 0x03, 0x58, 0x02]), Buffer.alloc(20)]);
		expect(await readImageDims(gif)).toEqual({ width: 800, height: 600 });
		const bmp = Buffer.alloc(54);
		bmp.write('BM', 0, 'ascii');
		bmp.writeInt32LE(300, 18);
		bmp.writeInt32LE(-200, 22);
		expect(await readImageDims(bmp)).toEqual({ width: 300, height: 200 });
	});
});

describe('pixel caps', () => {
	it('rejects a 20000 x 20000 PNG header with 422 before any decode', async () => {
		const spy = vi.mocked(napiImage.Transformer);
		spy.mockClear();
		await expect(assertImageWithinLimits(pngHeader(20000, 20000), 'Page')).rejects.toMatchObject({
			status: 422,
			body: { message: expect.stringContaining('20000 x 20000') },
		});
		expect(spy).not.toHaveBeenCalled();
	});

	it('accepts an image under the cap', async () => {
		await expect(assertImageWithinLimits(pngHeader(2000, 3000), 'Page')).resolves.toEqual({ width: 2000, height: 3000 });
	});

	it('falls back to metadata for AVIF', async () => {
		const canvas = createCanvas(8, 12);
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = '#336699';
		ctx.fillRect(0, 0, 8, 12);
		const avif = new napiImage.Transformer(canvas.toBuffer('image/jpeg', 90)).avifSync();
		expect(await readImageDims(Buffer.from(avif))).toEqual({ width: 8, height: 12 });
	});

	it('refuses a large file of unknown format without trying to decode it', async () => {
		const big = Buffer.alloc(MAX_UNKNOWN_FORMAT_BYTES + 1, 7);
		expect(await readImageDims(big)).toBeNull();
		await expect(assertDecodeAllowed(big, 'Page')).rejects.toMatchObject({ status: 422 });
		// SMALL UNKNOWN FILES ARE LEFT TO THE DECODER (WHICH REPORTS ITS OWN ERROR)
		await expect(assertDecodeAllowed(Buffer.from('not-an-image-at-all-1234567890'), 'Page')).resolves.toBeNull();
	});
});
