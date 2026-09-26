// IMAGE SIZE CAPS FOR EVERY NODE-SIDE DECODE (FEAT-002 ADR-001). A DECODE NEVER STARTS WITHOUT A KNOWN,
// CAPPED SIZE: DIMENSIONS COME FROM THE FILE HEADER, NOT FROM DECODING IT.
// IMPORTED DEP-MODULES
import { error } from '@sveltejs/kit';
// IMPORTED MODULES
import { getImageDimensionsFromBuffer } from './chapters/dimensions';

// -- CONSTANTS -- //

export const MAX_IMAGE_PIXELS = 100_000_000;
export const MAX_IMAGE_EDGE = 65_535;
export const MAX_THUMB_HEIGHT = 8_000;
// @napi-rs/image `metadata()` DECODES THE WHOLE IMAGE (MEASURED: +400 MB RSS FOR A 20000 x 20000 PNG), SO
// IT IS ONLY USED AS A FALLBACK FOR FORMATS THE HEADER PARSER CANNOT READ, AND ONLY FOR FILES THIS SMALL.
export const MAX_UNKNOWN_FORMAT_BYTES = 16 * 1024 * 1024;

// -- TYPES -- //

export interface ImageDims {
	width: number;
	height: number;
}

// -- FUNCTIONS -- //

/** HEADER-ONLY DIMENSIONS FOR GIF AND BMP (THE SHARED PARSER COVERS PNG, JPEG AND WEBP). */
function extraHeaderDims(buf: Buffer): ImageDims | null {
	if (buf.length >= 10 && buf.toString('ascii', 0, 3) === 'GIF') {
		return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
	}
	if (buf.length >= 26 && buf[0] === 0x42 && buf[1] === 0x4d) {
		// BITMAPINFOHEADER: SIGNED WIDTH / HEIGHT (A NEGATIVE HEIGHT MEANS TOP-DOWN ROWS)
		return { width: Math.abs(buf.readInt32LE(18)), height: Math.abs(buf.readInt32LE(22)) };
	}
	return null;
}

/**
 * READS AN IMAGE'S DIMENSIONS WITHOUT DECODING IT WHEN POSSIBLE. FOR AVIF, HEIC, TIFF AND OTHER FORMATS
 * WITHOUT A HEADER PARSER, FALLS BACK TO `@napi-rs/image` METADATA, BUT ONLY FOR FILES UP TO
 * `MAX_UNKNOWN_FORMAT_BYTES` (THAT CALL DECODES). RETURNS NULL WHEN THE SIZE CANNOT BE KNOWN SAFELY.
 */
export async function readImageDims(buf: Buffer): Promise<ImageDims | null> {
	const fast = getImageDimensionsFromBuffer(buf);
	if (fast.width && fast.height) return { width: fast.width, height: fast.height };
	const extra = extraHeaderDims(buf);
	if (extra && extra.width > 0 && extra.height > 0) return extra;
	if (buf.length > MAX_UNKNOWN_FORMAT_BYTES) return null;
	try {
		const { Transformer } = await import('@napi-rs/image');
		const meta = await new Transformer(buf).metadata();
		if (meta.width > 0 && meta.height > 0) return { width: meta.width, height: meta.height };
	} catch {
		// UNREADABLE: FALL THROUGH
	}
	return null;
}

export function withinImageLimits(dims: ImageDims): boolean {
	return (
		dims.width <= MAX_IMAGE_EDGE && dims.height <= MAX_IMAGE_EDGE && dims.width * dims.height <= MAX_IMAGE_PIXELS
	);
}

/** THROWS A 422 NAMING THE SIZE WHEN `dims` IS OVER THE PIXEL CAP. */
export function assertDimsWithinLimits(dims: ImageDims, label: string): void {
	if (!withinImageLimits(dims)) {
		const mp = Math.round((dims.width * dims.height) / 1_000_000);
		throw error(422, `${label} is ${dims.width} x ${dims.height} (${mp} MP); the limit is 100 MP.`);
	}
}

/**
 * GATE FOR CONVERTERS THAT WILL DECODE `buf`: 422 WHEN IT IS OVER THE PIXEL CAP, OR WHEN ITS SIZE IS UNKNOWN
 * AND THE FILE IS TOO BIG TO RISK. A SMALL FILE OF UNKNOWN SIZE RETURNS NULL: THE DECODER MAY TRY IT AND WILL
 * FAIL WITH ITS OWN CLEAR MESSAGE (A SMALL FILE CANNOT HOLD A HUGE IMAGE IN THESE FORMATS IN PRACTICE).
 */
export async function assertDecodeAllowed(buf: Buffer, label: string): Promise<ImageDims | null> {
	const dims = await readImageDims(buf);
	if (dims) {
		assertDimsWithinLimits(dims, label);
		return dims;
	}
	if (buf.length > MAX_UNKNOWN_FORMAT_BYTES) throw error(422, `${label} could not be read`);
	return null;
}

/** THROWS A 422 WHEN THE IMAGE IS OVER THE PIXEL CAP OR ITS SIZE CANNOT BE READ. */
export async function assertImageWithinLimits(buf: Buffer, label: string): Promise<ImageDims> {
	const dims = await readImageDims(buf);
	if (!dims) throw error(422, `${label} could not be read`);
	assertDimsWithinLimits(dims, label);
	return dims;
}
