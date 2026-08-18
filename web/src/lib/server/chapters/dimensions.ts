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

export async function convertBufferToWebP(
	buffer: Buffer,
	originalExt: string,
): Promise<{ data: Buffer; ext: string; width: number | null; height: number | null }> {
	const fastDims = getImageDimensionsFromBuffer(buffer);
	if (originalExt === '.webp' && fastDims.width && fastDims.height) {
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
	} catch {
		try {
			const { loadImage, createCanvas } = await import('@napi-rs/canvas');
			const img = await loadImage(buffer);
			const width = fastDims.width ?? (img.width || null);
			const height = fastDims.height ?? (img.height || null);
			if (originalExt === '.webp') return { data: buffer, ext: '.webp', width, height };
			const canvas = createCanvas(img.width, img.height);
			const ctx = canvas.getContext('2d');
			ctx.drawImage(img, 0, 0);
			const webpBuf = await canvas.encode('webp', 85);
			return { data: webpBuf, ext: '.webp', width, height };
		} catch {
			return { data: buffer, ext: originalExt, width: fastDims.width, height: fastDims.height };
		}
	}
}
