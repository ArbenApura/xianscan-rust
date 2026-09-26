// BATCH STATE ORDERING (FEAT-009 PHASE 3). THE SERVER STAMPS EVERY STATE WITH A MONOTONIC revision AND A PER-PROCESS
// epoch; A STATE OLDER THAN THE ONE ALREADY APPLIED IS DROPPED.
import type { BatchTranslationState } from '$lib/types';

export function isNewerBatchState(cur: BatchTranslationState, next: BatchTranslationState): boolean {
	if (next.epoch === undefined || next.revision === undefined) return true; // OLD SERVER OR A LOCAL WRITE
	if (cur.epoch !== next.epoch) return true; // THE SERVER RESTARTED (OR NOTHING FROM IT WAS APPLIED YET)
	return next.revision >= (cur.revision ?? -1); // EQUAL IS FINE: THE SAME STATE ANNOUNCED TWICE
}

// A LOCAL WRITE (CLEAR A CHAPTER / BOOK, A FAILED CLEAR REQUEST) KEEPS THE CURRENT epoch AND MOVES PAST THE CURRENT
// revision. DROPPING THEM WOULD LET ANY LATE POLL WIN (NO ORDERING TO COMPARE); KEEPING THE SAME revision WOULD STILL
// ACCEPT A POLL THAT CARRIES THE PRE-CLEAR STATE (EQUAL IS ACCEPTED). THE SERVER'S NEXT REAL STATE (revision + 1) WINS.
export function stampLocalBatchState(cur: BatchTranslationState, next: BatchTranslationState): BatchTranslationState {
	if (cur.epoch === undefined || cur.revision === undefined) return next;
	return { ...next, epoch: cur.epoch, revision: cur.revision + 1 };
}
