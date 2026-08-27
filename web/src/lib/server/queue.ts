/**
 * Zero-dependency asynchronous concurrency queue.
 * Drop-in replacement for p-queue without CJS/ESM eventemitter3 interop issues in Vite SSR.
 */

export interface QueueOptions {
	concurrency?: number;
}

export interface TaskOptions {
	throwOnTimeout?: boolean;
}

interface QueuedTask {
	run: () => void;
	reject: (err: any) => void;
}

export default class PQueue {
	private _concurrency: number;
	private _pending = 0;
	private _queue: Array<QueuedTask> = [];
	private _idleResolvers: Array<() => void> = [];

	constructor(options?: QueueOptions) {
		this._concurrency = options?.concurrency ?? Infinity;
	}

	get concurrency(): number {
		return this._concurrency;
	}

	set concurrency(newConcurrency: number) {
		this._concurrency = Math.max(1, Math.floor(newConcurrency) || 1);
		this._tryNext();
	}

	get size(): number {
		return this._queue.length;
	}

	get pending(): number {
		return this._pending;
	}

	clear(): void {
		const abortErr = new Error('The operation was aborted');
		abortErr.name = 'AbortError';
		while (this._queue.length > 0) {
			const item = this._queue.shift();
			if (item) {
				item.reject(abortErr);
			}
		}
		if (this._pending === 0) {
			while (this._idleResolvers.length > 0) {
				const resolver = this._idleResolvers.shift();
				if (resolver) {
					resolver();
				}
			}
		}
	}

	async add<T>(fn: () => Promise<T> | T, _options?: TaskOptions): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const runTask = async () => {
				this._pending++;
				try {
					const result = await fn();
					resolve(result);
				} catch (err) {
					reject(err);
				} finally {
					this._pending--;
					this._tryNext();
				}
			};

			if (this._pending < this._concurrency) {
				void runTask();
			} else {
				this._queue.push({ run: runTask, reject });
			}
		});
	}

	async addAll<T>(functions: Array<() => Promise<T> | T>): Promise<T[]> {
		return Promise.all(functions.map((fn) => this.add(fn)));
	}

	async onIdle(): Promise<void> {
		if (this._pending === 0 && this._queue.length === 0) {
			return;
		}
		return new Promise<void>((resolve) => {
			this._idleResolvers.push(resolve);
		});
	}

	private _tryNext(): void {
		while (this._queue.length > 0 && this._pending < this._concurrency) {
			const next = this._queue.shift();
			if (next) {
				void next.run();
			}
		}

		if (this._pending === 0 && this._queue.length === 0) {
			while (this._idleResolvers.length > 0) {
				const resolver = this._idleResolvers.shift();
				if (resolver) {
					resolver();
				}
			}
		}
	}
}
