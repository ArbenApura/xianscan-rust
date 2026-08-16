// SCROLL-LOCK ACTION — FREEZES THE PAGE BEHIND AN OVERLAY (DIALOG / DRAWER) WHILE IT IS MOUNTED, WITHOUT
// LOSING THE READER'S SCROLL POSITION. REFERENCE-COUNTED SO STACKED OVERLAYS ONLY UNLOCK ON THE LAST CLOSE.
//
// WHY position:fixed AND NOT JUST overflow:hidden: on DESKTOP, overflow:hidden on the scroll container keeps
// its scrollTop, so the page stays put. On iOS SAFARI (AND SOME MOBILE WEBVIEWS) overflow:hidden CLAMPS the
// container's scrollTop to 0 — the page visibly jumps to the very top the moment a drawer opens, and the
// reader then persists that bogus "top" as your place. PINNING THE BODY AT `top:-scrollY` HOLDS THE VISUAL
// POSITION EVERYWHERE, AND WE scrollTo(scrollY) ON RELEASE TO RESTORE IT EXACTLY.
//
// THE REMOVED SCROLLBAR WIDTH IS ADDED BACK AS padding-right ON <html> (NOT <body>) SO THE LAYOUT BEHIND
// DOESN'T SHIFT AND NO WHITE STRIP FLASHES UNDER THE TRANSLUCENT BACKDROP (html CARRIES THE THEME COLOUR).
// THE .scroll-locked CLASS ON <html> LETS SCROLL-DRIVEN UI (E.G. THE READER'S PROGRESS PERSISTENCE) IGNORE
// THE SYNTHETIC scrollTop:0 THAT PINNING THE BODY BRIEFLY REPORTS.
//
// PASS maxWidth TO LOCK ONLY AT-OR-BELOW A VIEWPORT WIDTH (E.G. A lg:hidden DRAWER THAT IS INVISIBLE ON
// DESKTOP MUST NOT LOCK DESKTOP SCROLL): use:scrollLock={{ maxWidth: 1023 }}.

// -- TYPES -- //

type ScrollLockOptions = { maxWidth?: number };

// -- STATES -- //

let lockCount = 0;
// SAVED INLINE STYLES + SCROLL OFFSET FROM THE MOMENT OF THE FIRST LOCK, RESTORED ON THE LAST RELEASE.
let savedScrollY = 0;
let savedHtmlOverflow = '';
let savedHtmlPaddingRight = '';
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
		savedHtmlPaddingRight = html.style.paddingRight;
		savedBodyPosition = body.style.position;
		savedBodyTop = body.style.top;
		savedBodyLeft = body.style.left;
		savedBodyRight = body.style.right;
		savedBodyWidth = body.style.width;
		savedBodyHeight = body.style.height;

		// PIN THE BODY AT ITS CURRENT SCROLL OFFSET — HOLDS THE VISUAL POSITION ON EVERY PLATFORM. html
		// overflow:hidden STOPS THE PAGE SCROLLING; THE BODY KEEPS ITS NATURAL (CONTENT) HEIGHT SO THE PAGE
		// BEHIND STAYS FULLY VISIBLE THROUGH THE TRANSLUCENT BACKDROP. CRUCIALLY WE OVERRIDE THE GLOBAL
		// body{height:100%} TO `auto`: UNDER position:fixed A 100% HEIGHT COLLAPSES TO THE VIEWPORT AND WOULD
		// CLIP EVERYTHING BELOW THE FOLD OFF-SCREEN (THE "CONTENT DISAPPEARS BEHIND THE DRAWER" BUG).
		html.style.overflow = 'hidden';
		body.style.position = 'fixed';
		body.style.top = `-${savedScrollY}px`;
		body.style.left = '0';
		body.style.right = '0';
		body.style.width = '100%';
		body.style.height = 'auto';
		html.classList.add('no-scrollbar', 'scroll-locked');
		// ONLY DESKTOP HAS A SCROLLBAR WIDTH TO COMPENSATE; MOBILE OVERLAY SCROLLBARS ARE 0.
		if (scrollbarWidth > 0) {
			const pad = parseFloat(getComputedStyle(html).paddingRight) || 0;
			html.style.paddingRight = `${pad + scrollbarWidth}px`;
		}
	}
	lockCount += 1;
}

// RESTORE THE ROOT/BODY AND THE EXACT SCROLL POSITION ONLY WHEN THE LAST OVERLAY RELEASES.
function release() {
	lockCount -= 1;
	if (lockCount === 0 && typeof document !== 'undefined') {
		const html = document.documentElement;
		const body = document.body;
		html.style.overflow = savedHtmlOverflow;
		html.style.paddingRight = savedHtmlPaddingRight;
		html.classList.remove('no-scrollbar', 'scroll-locked');
		body.style.position = savedBodyPosition;
		body.style.top = savedBodyTop;
		body.style.left = savedBodyLeft;
		body.style.right = savedBodyRight;
		body.style.width = savedBodyWidth;
		body.style.height = savedBodyHeight;
		// JUMP BACK TO WHERE THE READER WAS (THE PINNED BODY REPORTED scrollY:0 WHILE LOCKED).
		window.scrollTo(0, savedScrollY);
	}
}

export function scrollLock(_node: HTMLElement, options: ScrollLockOptions = {}) {
	let held = false;

	// WHETHER THIS OVERLAY SHOULD HOLD A LOCK AT THE CURRENT VIEWPORT WIDTH.
	const shouldLock = () =>
		typeof window !== 'undefined' && (options.maxWidth == null || window.innerWidth <= options.maxWidth);

	// ACQUIRE / RELEASE TO MATCH shouldLock(), RE-EVALUATED ON RESIZE (E.G. ROTATING PAST THE BREAKPOINT).
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
