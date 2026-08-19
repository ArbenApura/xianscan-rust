import type { ScannedImage } from '../types';

const NOISE_URL_PATTERN = /(?:data:image|placeholder|blurhash|lqip|blur|skeleton|shimmer|loading|loader|blank\.gif|spacer\.gif|pixel\.gif|avatar|favicon|emoji|discord|patreon|kofi|paypal|doubleclick|googleads|adservice|adserver|banner_ad|ad_banner|affiliate|sponsor|watermark_logo)/i;

export function isPlaceholderImage(url: string, width?: number, height?: number): boolean {
	if (!url) return true;
	if (url.startsWith('data:')) return true;
	if (NOISE_URL_PATTERN.test(url)) return true;
	// Reject tiny micro-thumbnails (< 100px) when dimensions are known
	if (width !== undefined && height !== undefined && width > 0 && height > 0) {
		if (width < 100 && height < 100) return true;
		// Reject extreme needle-thin dividing lines or borders
		const ratio = Math.max(width / height, height / width);
		if (ratio > 20) return true;
	}
	return false;
}

export function filterOutlierThumbnails(images: ScannedImage[]): ScannedImage[] {
	if (images.length < 5) return images;

	// Calculate median width for images with known width > 0
	const widths = images.map(i => i.width).filter(w => w > 0).sort((a, b) => a - b);
	if (widths.length < 5) return images;

	const medianWidth = widths[Math.floor(widths.length / 2)];
	// If median is substantial (e.g. comic strips >= 400px), drop images less than 35% of median
	if (medianWidth >= 400) {
		return images.filter(img => {
			if (img.width > 0 && img.width < medianWidth * 0.35) {
				return false;
			}
			return true;
		});
	}
	return images;
}

export function sortImagesByCoordinates(
	images: ScannedImage[],
	minWidth = 100,
	minHeight = 100
): ScannedImage[] {
	// 1. Filter out placeholder blurhashes, noise URLs, and tiny icons
	const filtered = images.filter(img => {
		if (isPlaceholderImage(img.url, img.width, img.height)) return false;
		if (img.width > 0 && img.height > 0) {
			if (img.width < minWidth && img.height < minHeight) return false;
		}
		return true;
	});

	// 2. Filter outlier thumbnails if strip has consistent pages
	const cleanImages = filterOutlierThumbnails(filtered);

	// 3. Spatial 2D sorting: Top-to-bottom primary, Left-to-right secondary (within 20px band)
	return cleanImages.sort((a, b) => {
		const topDiff = a.top - b.top;
		if (Math.abs(topDiff) > 20) {
			return topDiff;
		}
		return a.left - b.left;
	});
}

export function naturalAlphanumericSort(a: string, b: string): number {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
