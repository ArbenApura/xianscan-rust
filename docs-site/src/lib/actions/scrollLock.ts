// SCROLL-LOCK ACTION: FREEZES THE PAGE BEHIND AN OVERLAY (DIALOG / DRAWER) WHILE MOUNTED, WITHOUT
// LOSING THE READER'S SCROLL POSITION OR INTRODUCING LAYOUT SHIFTS. REFERENCE-COUNTED SO STACKED
// OVERLAYS ONLY UNLOCK ON THE LAST CLOSE.
//
// DESKTOP VIEWPORTS:
// WE REMOVE THE SCROLLBAR VIA html overflow: hidden SO THE MODAL BACKDROP COVERS THE FULL VIEWPORT
// EDGE-TO-EDGE WITHOUT LEAVING AN UN-DIMMED STRIPE. TO MAINTAIN THE MAIN CONTAINER WIDTH AND PREVENT
// THE LAYOUT BEHIND FROM JUMPING OR EXPANDING, WE COMPENSATE BY ADDING padding-right TO body EQUAL
// TO THE REMOVED SCROLLBAR WIDTH WHILE LEAVING body IN THE NORMAL DOCUMENT FLOW.
//
// MOBILE / TOUCH VIEWPORTS:
// ON SMALL TOUCH SCREENS WITH OVERLAY SCROLLBARS (scrollbarWidth === 0), WE PIN body AT top: -scrollY
// TO PREVENT iOS SAFARI RUBBER-BANDING AND PRESERVE EXACT SCROLL COORDINATES ON RELEASE.

// -- TYPES -- //

type ScrollLockOptions = { maxWidth?: number };

// -- STATES -- //

let lockCount = 0;
let isPinned = false;
let savedScrollY = 0;
let savedHtmlOverflow = '';
let savedBodyPaddingRight = '';
let savedBodyPosition = '';
let savedBodyTop = '';
let savedBodyLeft = '';
let savedBodyRight = '';
let savedBodyWidth = '';
let savedBodyHeight = '';

// -- FUNCTIONS -- //

// APPLY THE GLOBAL LOCK ON THE FIRST OVERLAY; LATER OVERLAYS JUST BUMP THE COUNT.
function acquire() {
	if (lockCount === 0 && typeof document !== 'undefined') {
		const html = document.documentElement;
		const body = document.body;
		const scrollbarWidth = window.innerWidth - html.clientWidth;

		savedScrollY = window.scrollY || html.scrollTop || 0;
		savedHtmlOverflow = html.style.overflow;
		savedBodyPaddingRight = body.style.paddingRight;

		html.style.overflow = 'hidden';
		html.classList.add('scroll-locked');

		// DETECT SMALL TOUCH VIEWPORTS WHERE iOS TOUCH RUBBER-BANDING REQUIRES FIXED PINNING
		const isMobileTouch =
			scrollbarWidth === 0 &&
			('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
			window.innerWidth < 1024;

		if (isMobileTouch) {
			savedBodyPosition = body.style.position;
			savedBodyTop = body.style.top;
			savedBodyLeft = body.style.left;
			savedBodyRight = body.style.right;
			savedBodyWidth = body.style.width;
			savedBodyHeight = body.style.height;

			body.style.position = 'fixed';
			body.style.top = `-${savedScrollY}px`;
			body.style.left = '0';
			body.style.right = '0';
			body.style.width = '100%';
			body.style.height = 'auto';
			isPinned = true;
		} else {
			isPinned = false;
			// ON DESKTOP, COMPENSATE ON body TO PREVENT THE MAIN CONTAINER FROM EXPANDING OR JUMPING
			if (scrollbarWidth > 0) {
				const currentPad = parseFloat(getComputedStyle(body).paddingRight) || 0;
				body.style.paddingRight = `${currentPad + scrollbarWidth}px`;
			}
		}
	}
	lockCount += 1;
}

// RESTORE ROOT AND BODY STYLES ONLY WHEN THE LAST OVERLAY RELEASES.
function release() {
	lockCount -= 1;
	if (lockCount === 0 && typeof document !== 'undefined') {
		const html = document.documentElement;
		const body = document.body;

		html.style.overflow = savedHtmlOverflow;
		html.classList.remove('scroll-locked');

		if (isPinned) {
			body.style.position = savedBodyPosition;
			body.style.top = savedBodyTop;
			body.style.left = savedBodyLeft;
			body.style.right = savedBodyRight;
			body.style.width = savedBodyWidth;
			body.style.height = savedBodyHeight;
			isPinned = false;
			window.scrollTo(0, savedScrollY);
		} else {
			body.style.paddingRight = savedBodyPaddingRight;
			if (savedScrollY > 0 && Math.abs((window.scrollY || html.scrollTop || 0) - savedScrollY) > 1) {
				window.scrollTo(0, savedScrollY);
			}
		}
	}
}

export function scrollLock(_node: HTMLElement, options: ScrollLockOptions = {}) {
	let held = false;

	// WHETHER THIS OVERLAY SHOULD HOLD A LOCK AT THE CURRENT VIEWPORT WIDTH.
	const shouldLock = () =>
		typeof window !== 'undefined' && (options.maxWidth == null || window.innerWidth <= options.maxWidth);

	// ACQUIRE / RELEASE TO MATCH shouldLock(), RE-EVALUATED ON RESIZE (E.G. ROTATING PAST BREAKPOINT).
	function sync() {
		const want = shouldLock();
		if (want && !held) {
			acquire();
			held = true;
		} else if (!want && held) {
			release();
			held = false;
		}
	}

	sync();
	if (typeof window !== 'undefined') window.addEventListener('resize', sync);

	return {
		update(next: ScrollLockOptions = {}) {
			options = next;
			sync();
		},
		destroy() {
			if (typeof window !== 'undefined') window.removeEventListener('resize', sync);
			if (held) release();
		},
	};
}
