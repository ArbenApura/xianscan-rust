// ZERO-ALLOCATION FAST IMAGE DIMENSION AND FORMAT CONVERTERS (PNG, WebP, JPEG, AVIF)
export function getImageDimensionsFromBuffer(buf: Buffer): { width: number | null; height: number | null } {
	if (!buf || buf.length < 24) return { width: null, height: null };

	// 1. PNG Header (0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A)
	if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
		const width = buf.readUInt32BE(16);
		const height = buf.readUInt32BE(20);
		if (width > 0 && height > 0) return { width, height };
	}

	// 2. WebP (RIFF....WEBP)
	if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
		const type = buf.toString('ascii', 12, 16);
		if (type === 'VP8X' && buf.length >= 30) {
			const width = 1 + buf.readUIntLE(24, 3);
			const height = 1 + buf.readUIntLE(27, 3);
			return { width, height };
		}
		if (type === 'VP8L' && buf.length >= 25 && buf[20] === 0x2f) {
			const b0 = buf[21];
			const b1 = buf[22];
			const b2 = buf[23];
			const b3 = buf[24];
			const width = 1 + (((b1 & 0x3f) << 8) | b0);
			const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
			return { width, height };
		}
		if (type === 'VP8 ' && buf.length >= 30 && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
			const width = buf.readUInt16LE(26) & 0x3fff;
			const height = buf.readUInt16LE(28) & 0x3fff;
			return { width, height };
		}
	}

	// 3. JPEG (0xFF 0xD8)
	if (buf[0] === 0xff && buf[1] === 0xd8) {
		let offset = 2;
		while (offset < buf.length - 8) {
			if (buf[offset] !== 0xff) {
				offset++;
				continue;
			}
			const marker = buf[offset + 1];
			if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
				const height = buf.readUInt16BE(offset + 5);
				const width = buf.readUInt16BE(offset + 7);
				if (width > 0 && height > 0) return { width, height };
				break;
			}
			if (marker === 0xd9 || marker === 0xda) break;
			const len = buf.readUInt16BE(offset + 2);
			if (len < 2) break;
			offset += 2 + len;
		}
	}

	return { width: null, height: null };
}

// DETECT AN IMAGE FORMAT BY MAGIC BYTES (NOT THE FILE EXTENSION). ONLY STATIC
// WEBP IS KEPT AS-IS — EVERY OTHER FORMAT IS CONVERTED TO WEBP (GLOBAL WEBP POLICY).
export function detectImageFormat(buf: Buffer): 'webp' | 'png' | 'jpeg' | null {
	if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
	if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
	if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
	return null;
}

// DETECT AN ANIMATED WEBP BY SCANNING RIFF CHUNKS FOR AN "ANIM" CHUNK. THE
// RUST SIDECAR DECODES ONLY STATIC WEBP, SO ANIMATED FILES MUST BE FLATTENED
// (CONVERTED) RATHER THAN PASSED THROUGH WITH A SAME-MAGIC `detectImageFormat`.
export function isAnimatedWebP(buf: Buffer): boolean {
	if (buf.length < 16 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return false;
	let off = 12;
	while (off + 8 <= buf.length) {
		const fourcc = buf.toString('ascii', off, off + 4);
		const size = buf.readUInt32LE(off + 4);
		if (fourcc === 'ANIM') return true;
		off += 8 + size + (size & 1);
	}
	return false;
}

export async function convertBufferToWebP(
	buffer: Buffer,
	originalExt: string,
): Promise<{ data: Buffer; ext: string; width: number | null; height: number | null }> {
	const fastDims = getImageDimensionsFromBuffer(buffer);
	const fmt = detectImageFormat(buffer);

	// GLOBAL WEBP POLICY: ONLY A STATIC WEBP PASSES THROUGH UNCHANGED. EVERY OTHER
	// FORMAT (PNG, JPEG, AVIF, HEIC, GIF, ANIMATED WEBP...) IS CONVERTED TO WEBP HERE.
	if (fmt === 'webp' && !isAnimatedWebP(buffer) && fastDims.width && fastDims.height) {
		return { data: buffer, ext: '.webp', width: fastDims.width, height: fastDims.height };
	}

	try {
		const { Transformer } = await import('@napi-rs/image');
		const transformer = new Transformer(buffer);
		const meta = await transformer.metadata();
		const webpBuf = await transformer.webp(90);
		return {
			data: webpBuf,
			ext: '.webp',
			width: meta.width || fastDims.width || null,
			height: meta.height || fastDims.height || null,
		};
	} catch (imageErr) {
		try {
			const { loadImage, createCanvas } = await import('@napi-rs/canvas');
			const img = await loadImage(buffer);
			const width = fastDims.width ?? (img.width || null);
			const height = fastDims.height ?? (img.height || null);
			const canvas = createCanvas(img.width, img.height);
			const ctx = canvas.getContext('2d');
			ctx.drawImage(img, 0, 0);
			const webpBuf = await canvas.encode('webp', 85);
			return { data: webpBuf, ext: '.webp', width, height };
		} catch {
			// NEVER SILENTLY STORE A RAW FILE: AN UNDECODABLE AVIF/HEIC SURVIVES
			// HERE ONLY TO CRASH THE RUST ML SIDECAR LATER ("AVIF NOT SUPPORTED").
			throw new Error(
				`could not convert ${originalExt} to WebP (${(imageErr as Error)?.message ?? 'decode failed'})`,
			);
		}
	}
}
