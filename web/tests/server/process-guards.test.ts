import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import { UNCAUGHT_EXIT_CODE, armParentWatchdog, installProcessGuards } from '$lib/server/process-guards';

function fakeStdin() {
	const emitter = new EventEmitter();
	return Object.assign(emitter, { resume: vi.fn() });
}

describe('armParentWatchdog', () => {
	it('stays off unless the parent asked for it', () => {
		const stdin = fakeStdin();
		const exit = vi.fn();
		expect(armParentWatchdog({ env: {}, stdin: stdin as never, exit })).toBe(false);
		stdin.emit('end');
		expect(exit).not.toHaveBeenCalled();
		expect(stdin.resume).not.toHaveBeenCalled();
	});

	it('exits once when stdin ends', () => {
		const stdin = fakeStdin();
		const exit = vi.fn();
		const armed = armParentWatchdog({
			env: { XIANSCAN_PARENT_WATCHDOG: '1' },
			stdin: stdin as never,
			exit,
			log: () => {},
			platform: 'win32',
		});
		expect(armed).toBe(true);
		expect(stdin.resume).toHaveBeenCalled();
		stdin.emit('end');
		stdin.emit('close');
		expect(exit).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledWith(0);
	});

	it('treats a stdin error as the parent going away instead of crashing', () => {
		const stdin = fakeStdin();
		const exit = vi.fn();
		armParentWatchdog({ env: { XIANSCAN_PARENT_WATCHDOG: '1' }, stdin: stdin as never, exit, log: () => {}, platform: 'win32' });
		stdin.emit('error', new Error('EPIPE'));
		expect(exit).toHaveBeenCalledWith(0);
	});

	it('polls the parent pid off Windows and exits when re-parented to init', () => {
		const stdin = fakeStdin();
		const exit = vi.fn();
		let tick: () => void = () => {};
		const unref = vi.fn();
		let ppid = 4242;
		armParentWatchdog({
			env: { XIANSCAN_PARENT_WATCHDOG: '1' },
			stdin: stdin as never,
			exit,
			log: () => {},
			platform: 'linux',
			getPpid: () => ppid,
			setInterval: (fn) => {
				tick = fn;
				return { unref };
			},
		});
		expect(unref).toHaveBeenCalled();
		tick();
		expect(exit).not.toHaveBeenCalled();
		ppid = 1;
		tick();
		expect(exit).toHaveBeenCalledTimes(1);
	});

	it('does not poll the parent pid on Windows', () => {
		const setInterval = vi.fn(() => ({ unref: () => {} }));
		armParentWatchdog({
			env: { XIANSCAN_PARENT_WATCHDOG: '1' },
			stdin: fakeStdin() as never,
			exit: vi.fn(),
			platform: 'win32',
			setInterval,
		});
		expect(setInterval).not.toHaveBeenCalled();
	});
});

describe('installProcessGuards', () => {
	function setup(dev: boolean, beforeExit?: () => void) {
		const target = new EventEmitter();
		const exit = vi.fn();
		installProcessGuards({ dev, exit, log: () => {}, beforeExit, target: target as never });
		return { target, exit };
	}

	it('exits with 70 once on an uncaught exception in production, after a final flush', () => {
		const flush = vi.fn();
		const { target, exit } = setup(false, flush);
		target.emit('uncaughtException', new Error('boom'));
		expect(flush).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledWith(UNCAUGHT_EXIT_CODE);
	});

	it('a second exception during shutdown exits immediately without flushing again', () => {
		const flush = vi.fn();
		const { target, exit } = setup(false, flush);
		target.emit('uncaughtException', new Error('first'));
		target.emit('uncaughtException', new Error('second'));
		expect(flush).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledTimes(2);
	});

	it('still exits when the final flush throws', () => {
		const { target, exit } = setup(false, () => {
			throw new Error('db locked');
		});
		target.emit('uncaughtException', new Error('boom'));
		expect(exit).toHaveBeenCalledWith(UNCAUGHT_EXIT_CODE);
	});

	it('keeps the dev server alive (Vite HMR)', () => {
		const { target, exit } = setup(true);
		target.emit('uncaughtException', new Error('boom'));
		expect(exit).not.toHaveBeenCalled();
	});

	it('never exits on an unhandled rejection', () => {
		const { target, exit } = setup(false);
		target.emit('unhandledRejection', new Error('stray'));
		expect(exit).not.toHaveBeenCalled();
	});
});
