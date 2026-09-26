// PROCESS-LEVEL GUARDS FOR THE NODE SERVER (FEAT-002). EVERYTHING WITH A SIDE EFFECT ON THE PROCESS
// (EXIT, TIMERS, STDIN) IS INJECTABLE SO TESTS NEVER EXIT THE TEST RUNNER.

// -- TYPES -- //

type Exit = (code: number) => void;

export interface WatchdogDeps {
	env?: Record<string, string | undefined>;
	stdin?: Pick<NodeJS.ReadStream, 'resume' | 'on'>;
	exit?: Exit;
	log?: (...args: unknown[]) => void;
	platform?: NodeJS.Platform;
	getPpid?: () => number;
	setInterval?: (fn: () => void, ms: number) => { unref?: () => unknown };
}

// -- CONSTANTS -- //

const PPID_POLL_MS = 5_000;

// -- FUNCTIONS -- //

/**
 * EXITS WHEN THE RUST PARENT DIES. THE PARENT SPAWNS US WITH A STDIN PIPE IT NEVER WRITES TO AND
 * `XIANSCAN_PARENT_WATCHDOG=1`; THE PIPE CLOSES WHEN THE PARENT EXITS FOR ANY REASON. ON NON-WINDOWS
 * PLATFORMS A PARENT PID OF 1 (RE-PARENTED TO INIT) IS A SECOND SIGNAL. RETURNS TRUE WHEN ARMED.
 */
export function armParentWatchdog(deps: WatchdogDeps = {}): boolean {
	const env = deps.env ?? process.env;
	if (env.XIANSCAN_PARENT_WATCHDOG !== '1') return false;

	const exit: Exit = deps.exit ?? ((code) => process.exit(code));
	const log = deps.log ?? console.warn;
	const stdin = deps.stdin ?? process.stdin;
	const platform = deps.platform ?? process.platform;
	const getPpid = deps.getPpid ?? (() => process.ppid);
	const every = deps.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms));

	let fired = false;
	const parentGone = (why: string) => {
		if (fired) return;
		fired = true;
		log(`[server] XianScan parent process is gone (${why}); exiting.`);
		exit(0);
	};

	stdin.on('end', () => parentGone('stdin closed'));
	stdin.on('close', () => parentGone('stdin closed'));
	// A DESTROYED PIPE CAN ALSO SURFACE AS AN ERROR; WITHOUT A LISTENER IT WOULD CRASH THE SERVER
	stdin.on('error', () => parentGone('stdin error'));
	stdin.resume();

	if (platform !== 'win32') {
		const timer = every(() => {
			if (getPpid() === 1) parentGone('re-parented to init');
		}, PPID_POLL_MS);
		timer.unref?.();
	}
	return true;
}

// -- UNCAUGHT ERRORS (FEAT-002 ADR-005) -- //

/** EXIT CODE THE RUST SUPERVISOR RECOGNISES AS "CRASHED ON AN UNCAUGHT EXCEPTION". */
export const UNCAUGHT_EXIT_CODE = 70;

export interface ProcessGuardOptions {
	dev: boolean;
	exit?: Exit;
	log?: (...args: unknown[]) => void;
	/** BEST-EFFORT FINAL FLUSH BEFORE EXITING (STATE IS ALREADY PERSISTED ON EVERY CHANGE). */
	beforeExit?: () => void;
	/** WHERE THE HANDLERS ARE REGISTERED; TESTS PASS A FAKE EMITTER. */
	target?: Pick<NodeJS.Process, 'on'>;
}

/**
 * - `unhandledRejection`: LOG AND KEEP SERVING. A STRAY REJECTION (E.G. A DETACHED JOB SAVING TO A PAGE THE USER
 *   DELETED) DOES NOT CORRUPT PROCESS STATE.
 * - `uncaughtException`: THE PROCESS STATE IS UNKNOWN AFTERWARDS. IN PRODUCTION EXIT WITH 70 SO THE SUPERVISOR
 *   RESTARTS A CLEAN SERVER (WITH BACKOFF); IN DEV KEEP ALIVE SO VITE HMR SURVIVES. A SECOND EXCEPTION DURING
 *   SHUTDOWN EXITS IMMEDIATELY.
 */
export function installProcessGuards(opts: ProcessGuardOptions): void {
	const exit: Exit = opts.exit ?? ((code) => process.exit(code));
	const log = opts.log ?? console.error;
	const target = opts.target ?? process;
	let exiting = false;

	target.on('unhandledRejection', (reason: unknown) => log('[server] unhandled rejection (kept alive):', reason));
	target.on('uncaughtException', (err: unknown) => {
		if (opts.dev) {
			log('[server] uncaught exception (kept alive in dev):', err);
			return;
		}
		if (exiting) {
			exit(UNCAUGHT_EXIT_CODE);
			return;
		}
		exiting = true;
		log('[server] FATAL uncaught exception; exiting so XianScan restarts a clean web server:', err);
		try {
			opts.beforeExit?.();
		} catch (flushErr) {
			log('[server] final state flush failed:', flushErr);
		}
		exit(UNCAUGHT_EXIT_CODE);
	});
}
