// -- SERVICE WORKER KEEP-ALIVE PORT MANAGER -- //

// -- STATES -- //

const activeKeepAlivePorts = new Set<chrome.runtime.Port>();
const chapterPorts = new Map<number, Set<chrome.runtime.Port>>();

// -- FUNCTIONS -- //

// DISPATCH A MESSAGE DIRECTLY TO OPEN PORTS REGISTERED TO A CHAPTER
export function dispatchToChapterPort(chapterId: number, msg: any): boolean {
	const portSet = chapterPorts.get(Number(chapterId));
	if (!portSet || portSet.size === 0) return false;
	let delivered = false;
	for (const port of Array.from(portSet)) {
		try {
			port.postMessage(msg);
			delivered = true;
		} catch {
			portSet.delete(port);
		}
	}
	return delivered;
}

// INITIALIZE PORT LISTENER TO KEEP MANIFEST V3 SERVICE WORKER ALIVE DURING ACTIVE JOBS
export function initKeepAliveService(): void {
	if (typeof chrome === 'undefined' || !chrome.runtime?.onConnect) return;

	chrome.runtime.onConnect.addListener(port => {
		if (port.name === 'xianscan-keepalive') {
			activeKeepAlivePorts.add(port);
			let registeredChapterId: number | null = null;

			port.onMessage.addListener(msg => {
				if (msg && msg.type === 'KEEPALIVE_PING') {
					if (msg.chapterId) {
						registeredChapterId = Number(msg.chapterId);
						let portSet = chapterPorts.get(registeredChapterId);
						if (!portSet) {
							portSet = new Set();
							chapterPorts.set(registeredChapterId, portSet);
						}
						portSet.add(port);
					}
					try {
						port.postMessage({ type: 'KEEPALIVE_PONG', timestamp: Date.now() });
					} catch {
						// IGNORE DISCONNECTED PORT
					}
				}
			});

			port.onDisconnect.addListener(() => {
				activeKeepAlivePorts.delete(port);
				if (registeredChapterId !== null) {
					const portSet = chapterPorts.get(registeredChapterId);
					if (portSet) {
						portSet.delete(port);
						if (portSet.size === 0) {
							chapterPorts.delete(registeredChapterId);
						}
					}
				}
			});
		}
	});
}
