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

export default class PQueue {
	public concurrency: number;
	private _pending = 0;
	private _queue: Array<() => void> = [];
	private _idleResolvers: Array<() => void> = [];

	constructor(options?: QueueOptions) {
		this.concurrency = options?.concurrency ?? Infinity;
	}

	get size(): number {
		return this._queue.length;
	}

	get pending(): number {
		return this._pending;
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

			if (this._pending < this.concurrency) {
				void runTask();
			} else {
				this._queue.push(runTask);
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
		if (this._queue.length > 0 && this._pending < this.concurrency) {
			const next = this._queue.shift();
			if (next) {
				void next();
			}
		} else if (this._pending === 0 && this._queue.length === 0) {
			while (this._idleResolvers.length > 0) {
				const resolver = this._idleResolvers.shift();
				if (resolver) {
					resolver();
				}
			}
		}
	}
}
