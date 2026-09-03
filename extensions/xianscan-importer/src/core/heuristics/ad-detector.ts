// -- NOISE AND BANNER AD DETECTION HEURISTICS -- //

// -- CONSTANTS -- //

export const NOISE_CONTAINER_SELECTORS = [
	'header',
	'footer',
	'nav',
	'aside',
	'[class*="header"]',
	'[class*="footer"]',
	'[class*="navbar"]',
	'[class*="nav-"]',
	'[class*="sidebar"]',
	'[id*="sidebar"]',
	'[class*="comment"]',
	'[id*="comment"]',
	'[id*="disqus"]',
	'[class*="disqus"]',
	'[class*="advert"]',
	'[class*="banner"]',
	'[id*="banner"]',
	'[class*="promo"]',
	'[id*="promo"]',
	'[class*="sponsor"]',
	'[class*="floating"]',
	'[id*="floating"]',
	'[class*="sticky"]',
	'[id*="sticky"]',
	'[class*="fixed"]',
	'[id*="fixed"]',
	'[class*="recommend"]',
	'[class*="related"]',
	'[class*="popular"]',
	'[class*="trending"]',
	'[class*="social"]',
	'[class*="share"]',
	'[class*="widget"]',
	'[class*="avatar"]',
	'[class*="gnb"]',
	'[id*="gnb"]',
	'[class*="snb"]',
	'[id*="snb"]'
].join(',');

export const READER_CONTAINER_SELECTORS = [
	'div[class*="wt_viewer"]',
	'#comic_view_area',
	'div[class*="reading-content"]',
	'div[class*="reader-area"]',
	'div[class*="reader"]',
	'div[id*="reader"]',
	'div[class*="chapter-images"]',
	'div[class*="viewer-cnt"]',
	'div[class*="comic-content"]',
	'div[id*="comic"]',
	'div[class*="v-reader"]',
	'article'
].join(',');

// -- FUNCTIONS -- //

// CHECK WHETHER AN ELEMENT OR ANY ANCESTOR HAS FIXED OR STICKY POSITIONING
export function isFloatingOrSticky(el: HTMLElement): boolean {
	let curr: HTMLElement | null = el;
	while (curr && curr !== document.body && curr !== document.documentElement) {
		const style = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(curr) : null;
		if (style) {
			const pos = style.position;
			if (pos === 'fixed' || pos === 'sticky') {
				return true;
			}
		}
		curr = curr.parentElement;
	}
	return false;
}

// CHECK WHETHER AN IMAGE ELEMENT IS LIKELY AN ADVERTISEMENT OR NAVIGATION BANNER
export function isLikelyAdOrBannerImage(img: HTMLImageElement): boolean {
	// 1. ANCESTOR NOISE CONTAINER CHECK
	let curr: HTMLElement | null = img.parentElement;
	let depth = 0;
	while (curr && depth < 6 && curr !== document.body) {
		if (curr.matches && curr.matches(NOISE_CONTAINER_SELECTORS)) {
			return true;
		}
		// CHECK ANCHOR HREF FOR EXTERNAL ADS OR GAMBLING AFFILIATE LINKS
		if (curr.tagName === 'A') {
			const href = (curr.getAttribute('href') || '').toLowerCase();
			if (
				href.includes('doubleclick') ||
				href.includes('googleads') ||
				href.includes('adservice') ||
				href.includes('affiliate') ||
				href.includes('slot') ||
				href.includes('judi') ||
				href.includes('bet') ||
				href.includes('casino') ||
				href.includes('cuan') ||
				href.includes('gacor') ||
				href.includes('iklan')
			) {
				return true;
			}
		}
		curr = curr.parentElement;
		depth++;
	}

	// 2. SOURCE URL NOISE DETECTION
	const src = (img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original') || '').toLowerCase();
	if (
		src.includes('banner') ||
		src.includes('iklan') ||
		src.includes('advert') ||
		src.includes('guanggao') ||
		src.includes('promo') ||
		src.includes('sponsor') ||
		src.includes('avatar') ||
		src.includes('logo') ||
		src.includes('/ad/') ||
		src.includes('/ads/') ||
		src.includes('_ad.') ||
		src.includes('-ad.') ||
		src.includes('app-qr') ||
		src.includes('qrcode') ||
		src.includes('qr-code') ||
		/[\/_-]ad\d*\.(?:gif|jpg|png|webp)/i.test(src) ||
		src.includes('slot') ||
		src.includes('judi') ||
		src.includes('doubleclick') ||
		src.includes('googleads') ||
		src.includes('noimg') ||
		src.includes('readerarea.svg')
	) {
		return true;
	}

	// 3. DIMENSION & ASPECT RATIO CHECKS FOR BANNER ADS (PRESERVES TALL WEBTOON PANELS)
	const rect = img.getBoundingClientRect ? img.getBoundingClientRect() : { width: img.width || 0, height: img.height || 0 };
	const width = img.naturalWidth || rect.width || img.width || 0;
	const height = img.naturalHeight || rect.height || img.height || 0;

	if (width > 0 && height > 0) {
		const aspectRatio = width / height;
		// HORIZONTAL BANNER AD DETECTION (e.g. 728x90, 300x37, 880x99, 1440x90)
		if (aspectRatio >= 2.5 && height <= 260) {
			return true;
		}
		if (aspectRatio >= 4.0 && height <= 350) {
			return true;
		}
		if (width >= 250 && height <= 100) {
			return true;
		}
		if (height <= 50) {
			return true;
		}
	}

	// 4. ANIMATED GIF BANNER DETECTION (COMIC PANELS ARE ALMOST NEVER ANIMATED GIFS)
	if (src.endsWith('.gif') || src.includes('.gif?')) {
		if (height <= 300 || src.includes('iklan') || src.includes('banner')) {
			return true;
		}
	}

	return false;
}
