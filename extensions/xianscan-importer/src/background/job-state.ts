// -- BACKGROUND JOB CANCELLATION STATE -- //

// -- STATES -- //

let activeJobCancelled = false;

// -- FUNCTIONS -- //

export function isJobCancelled(): boolean {
	return activeJobCancelled;
}

export function setJobCancelled(cancelled: boolean): void {
	activeJobCancelled = cancelled;
}
