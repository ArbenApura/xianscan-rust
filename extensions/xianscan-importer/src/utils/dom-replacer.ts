// -- IN-PLACE REPLACEMENT UTILITIES FACADE -- //

// IMPORTED MODULES
import { isFloatingOrSticky, isLikelyAdOrBannerImage } from '../core/heuristics/ad-detector';
import { normalizePageUrl, getCanonicalUrl } from '../core/heuristics/url-clustering';
import { resolveSafeImageUrl, createSafeBlobUrlFromData, clearSafeImageUrlCache } from '../content/safe-image';
import { findPrimaryReaderContainer } from '../content/scanner';
import { DomReplacerEngine, getImageCandidateUrls, getHostReaderImages } from '../content/replacer';

// -- RE-EXPORTS FOR BACKWARD COMPATIBILITY & TEST SUITES -- //

export {
	normalizePageUrl,
	getCanonicalUrl,
	resolveSafeImageUrl,
	createSafeBlobUrlFromData,
	clearSafeImageUrlCache,
	isFloatingOrSticky,
	isLikelyAdOrBannerImage,
	findPrimaryReaderContainer,
	getImageCandidateUrls,
	getHostReaderImages,
	DomReplacerEngine
};
