// IN-MEMORY FAILED-UNLOCK LIMITER: 10 WRONG TOKENS PER CLIENT ADDRESS PER MINUTE.

// -- CONSTANTS -- //

export const MAX_UNLOCK_FAILURES = 10;
const WINDOW_MS = 60_000;

// -- STATE -- //

const failures = new Map<string, { count: number; windowStart: number }>();

// -- FUNCTIONS -- //

function prune(now: number): void {
	for (const [addr, entry] of failures) {
		if (now - entry.windowStart >= WINDOW_MS) failures.delete(addr);
	}
}

export function isUnlockBlocked(addr: string, now = Date.now()): boolean {
	prune(now);
	const entry = failures.get(addr);
	return entry !== undefined && entry.count >= MAX_UNLOCK_FAILURES;
}

export function recordUnlockFailure(addr: string, now = Date.now()): void {
	const entry = failures.get(addr) ?? { count: 0, windowStart: now };
	entry.count += 1;
	failures.set(addr, entry);
}

export function clearUnlockFailures(addr: string): void {
	failures.delete(addr);
}

/** Test hook: clear the failure limiter. */
export function __resetUnlockLimiterForTests(): void {
	failures.clear();
}
